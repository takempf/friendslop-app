import { describe, it, expect, vi, afterEach } from "vitest";
import { DualSenseHidSource, type DualSenseConfig } from "./DualSenseHidSource";
import { createEmptyFrame } from "../actions";
import { setTextInputActive } from "../textInputMode";
import { DUALSENSE_LSB_TO_RAD_S } from "../dualsense/dualsenseReport";
import type { HIDDevice, HIDInputReportEvent } from "@/types/webhid";
import {
  DUALSENSE_VENDOR_ID,
  DUALSENSE_PRODUCT_ID,
} from "../dualsense/dualsenseReport";

function createMockHIDDevice(): HIDDevice {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};

  return {
    opened: true,
    vendorId: DUALSENSE_VENDOR_ID,
    productId: DUALSENSE_PRODUCT_ID,
    productName: "DualSense Wireless Controller",
    collections: [],
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    sendReport: vi.fn().mockResolvedValue(undefined),
    sendFeatureReport: vi.fn().mockResolvedValue(undefined),
    receiveFeatureReport: vi
      .fn()
      .mockResolvedValue(new DataView(new ArrayBuffer(0))),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    dispatchEvent: (event: Event) => {
      (listeners[event.type] ?? []).forEach((l) => l(event));
      return true;
    },
  } as unknown as HIDDevice;
}

interface ReportOptions {
  /** Raw 0-255 stick bytes: left X/Y then right X/Y. 128 is centred. */
  sticks?: [number, number, number, number];
  /** Raw face-button byte (bit 5 is cross, bit 6 circle, bit 4 square). */
  face?: number;
  /** Raw shoulder byte (bit 5 is options, bit 6 L3). */
  shoulder?: number;
}

function createUsbReportEvent(
  device: HIDDevice,
  pitch: number,
  yaw: number,
  l2 = 0,
  r2 = 0,
  options: ReportOptions = {},
): HIDInputReportEvent {
  const view = new DataView(new ArrayBuffer(64));
  // Sticks rest at 128; leaving them at 0 would read as full deflection.
  const sticks = options.sticks ?? [128, 128, 128, 128];
  sticks.forEach((v, i) => view.setUint8(i, v));
  view.setUint8(7, options.face ?? 0);
  view.setUint8(8, options.shoulder ?? 0);
  view.setUint8(4, l2);
  view.setUint8(5, r2);
  view.setInt16(15, pitch, true);
  view.setInt16(17, yaw, true);
  view.setUint8(52, 0x18); // 80%, charging

  return {
    device,
    reportId: 0x01,
    data: view,
  } as unknown as HIDInputReportEvent;
}

const defaultConfig: DualSenseConfig = {
  dualsenseGyroMode: "aiming",
  dualsenseGyroSensitivity: 2.0,
  dualsenseGyroInvertY: false,
  dualsenseHidEnabled: true,
  gamepadEnabled: true,
  gamepadLookSensitivity: 2.5,
  gamepadLookCurve: 1.6,
  gamepadDeadzone: 0.15,
  gamepadInvertY: false,
};

/** Attaches a source and burns through calibration with the given resting bias. */
async function createCalibratedSource(
  config: Partial<DualSenseConfig> = {},
  bias: { pitch: number; yaw: number } = { pitch: 0, yaw: 0 },
): Promise<{ source: DualSenseHidSource; device: HIDDevice }> {
  const source = new DualSenseHidSource({
    getConfig: () => ({ ...defaultConfig, ...config }),
  });
  const device = createMockHIDDevice();
  await source.attachDevice(device);

  for (let i = 0; i < 64; i++) {
    source.handleInputReport(
      createUsbReportEvent(device, bias.pitch, bias.yaw),
    );
  }
  return { source, device };
}

describe("DualSenseHidSource", () => {
  afterEach(() => {
    setTextInputActive(false);
    vi.restoreAllMocks();
  });

  it("updates connection, battery, and calibration state when device attaches", async () => {
    const source = new DualSenseHidSource({ getConfig: () => defaultConfig });
    const device = createMockHIDDevice();

    const stateListener = vi.fn();
    source.subscribeState(stateListener);

    await source.attachDevice(device);

    expect(stateListener).toHaveBeenCalled();
    const state = source.getState();
    expect(state.connected).toBe(true);
    expect(state.deviceName).toBe("DualSense Wireless Controller");
    expect(state.isCalibrating).toBe(true);
  });

  it("publishes connection type and battery read off the report stream", async () => {
    const source = new DualSenseHidSource({ getConfig: () => defaultConfig });
    const device = createMockHIDDevice();
    await source.attachDevice(device);

    expect(source.getState().connectionType).toBeNull();
    expect(source.getState().batteryLevel).toBeNull();

    const listener = vi.fn();
    source.subscribeState(listener);
    listener.mockClear();

    source.handleInputReport(createUsbReportEvent(device, 0, 0));

    const state = source.getState();
    expect(state.connectionType).toBe("usb");
    expect(state.batteryLevel).toBe(80);
    expect(state.isCharging).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it("closes the HID device when detached so the handle is released", async () => {
    const source = new DualSenseHidSource({ getConfig: () => defaultConfig });
    const device = createMockHIDDevice();
    await source.attachDevice(device);

    source.detachDevice();

    expect(device.close).toHaveBeenCalled();
    expect(source.getState().connected).toBe(false);
  });

  it("calibrates resting gyro bias over 64 samples and subtracts it", async () => {
    const { source, device } = await createCalibratedSource(undefined, {
      pitch: 100,
      yaw: -200,
    });

    expect(source.getState().isCalibrating).toBe(false);

    // Identical stationary reading: after bias removal the delta is zero.
    source.handleInputReport(createUsbReportEvent(device, 100, -200, 200, 0));

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.lookYaw).toBeCloseTo(0, 5);
    expect(frame.lookPitch).toBeCloseTo(0, 5);
  });

  it("integrates gyro rate over the real report interval", async () => {
    let fakeTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    const { source, device } = await createCalibratedSource({
      dualsenseGyroSensitivity: 1.0,
      dualsenseGyroMode: "always",
    });

    // One report 8ms after the previous one, at a known count.
    const counts = 4000;
    const dt = 0.008;
    fakeTime += dt * 1000;
    source.handleInputReport(createUsbReportEvent(device, counts, counts));

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    const expectedRad = counts * DUALSENSE_LSB_TO_RAD_S * dt;
    expect(frame.lookPitch).toBeCloseTo(expectedRad, 6);
    expect(frame.lookYaw).toBeCloseTo(expectedRad, 6);
  });

  it("applies gyro only while L2 is held in 'aiming' mode", async () => {
    const { source, device } = await createCalibratedSource();

    // No trigger -> no gyro contribution.
    source.handleInputReport(createUsbReportEvent(device, 500, -1000, 0, 0));
    let frame = createEmptyFrame();
    source.sample(frame, 1 / 60);
    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);

    // L2 (aim) -> gyro steers look.
    source.handleInputReport(createUsbReportEvent(device, 500, -1000, 255, 0));
    frame = createEmptyFrame();
    source.sample(frame, 1 / 60);
    expect(frame.buttons.aim).toBe(true);
    expect(frame.lookYaw).toBeLessThan(0);
    expect(frame.lookPitch).toBeGreaterThan(0);
  });

  it("leaves the gyro off while R2 charges a throw without L2", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(createUsbReportEvent(device, 500, -1000, 0, 255));
    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    // The charge action still fires; only the gyro stays out of it.
    expect(frame.buttons.chargeThrow).toBe(true);
    expect(frame.buttons.aim).toBe(false);
    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);
  });

  it("keeps the gyro live when L2 and R2 are held together", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(
      createUsbReportEvent(device, 500, -1000, 255, 255),
    );
    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.buttons.aim).toBe(true);
    expect(frame.buttons.chargeThrow).toBe(true);
    expect(frame.lookYaw).toBeLessThan(0);
    expect(frame.lookPitch).toBeGreaterThan(0);
  });

  it("applies gyro continuously in 'always' mode", async () => {
    const { source, device } = await createCalibratedSource({
      dualsenseGyroMode: "always",
    });

    source.handleInputReport(createUsbReportEvent(device, 400, -800, 0, 0));
    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.lookYaw).toBeLessThan(0);
    expect(frame.lookPitch).toBeGreaterThan(0);
  });

  it("contributes no look at all in 'disabled' mode, triggers included", async () => {
    const { source, device } = await createCalibratedSource({
      dualsenseGyroMode: "disabled",
    });

    source.handleInputReport(
      createUsbReportEvent(device, 500, -1000, 255, 255),
    );
    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);
    // Trigger actions still pass through; only the gyro is off.
    expect(frame.buttons.aim).toBe(true);
    expect(frame.buttons.chargeThrow).toBe(true);
  });

  it("respects dualsenseGyroInvertY and sensitivity settings", async () => {
    let fakeTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    const { source: normal, device } = await createCalibratedSource({
      dualsenseGyroSensitivity: 1.0,
      dualsenseGyroInvertY: false,
    });
    const { source: inverted } = await createCalibratedSource({
      dualsenseGyroSensitivity: 2.0,
      dualsenseGyroInvertY: true,
    });

    fakeTime += 4;
    normal.handleInputReport(createUsbReportEvent(device, 500, -500, 200, 0));
    inverted.handleInputReport(createUsbReportEvent(device, 500, -500, 200, 0));

    const frameNormal = createEmptyFrame();
    normal.sample(frameNormal, 1 / 60);

    const frameInverted = createEmptyFrame();
    inverted.sample(frameInverted, 1 / 60);

    expect(frameInverted.lookYaw).toBeCloseTo(frameNormal.lookYaw * 2.0, 5);
    expect(frameInverted.lookPitch).toBeCloseTo(
      -frameNormal.lookPitch * 2.0,
      5,
    );
  });

  it("drops rotation accumulated while a text field has focus", async () => {
    const { source, device } = await createCalibratedSource({
      dualsenseGyroMode: "always",
    });

    setTextInputActive(true);

    // Reports keep streaming while the player types.
    for (let i = 0; i < 10; i++) {
      source.handleInputReport(createUsbReportEvent(device, 3000, 3000, 0, 0));
      source.sample(createEmptyFrame(), 1 / 60);
    }

    setTextInputActive(false);

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    // Nothing banked up while typing, so the first frame back is still.
    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);
  });

  it("caps rotation banked while the render loop is stalled", async () => {
    let fakeTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    const { source, device } = await createCalibratedSource({
      dualsenseGyroSensitivity: 1.0,
      dualsenseGyroMode: "always",
    });

    // 500 reports at full tilt with no sample() in between (tab hidden).
    for (let i = 0; i < 500; i++) {
      fakeTime += 4;
      source.handleInputReport(
        createUsbReportEvent(device, 32767, 32767, 0, 0),
      );
    }

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    // Uncapped this would be many full rotations; the clamp keeps it survivable.
    expect(Math.abs(frame.lookPitch)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(frame.lookYaw)).toBeLessThanOrEqual(0.35);
  });

  it("drives movement from the left stick while it owns the device", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(
      createUsbReportEvent(device, 0, 0, 0, 0, {
        sticks: [255, 128, 128, 128], // full right
      }),
    );

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.moveX).toBeGreaterThan(0.9);
    expect(frame.moveY).toBeCloseTo(0, 3);
  });

  it("drives look from the right stick while it owns the device", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(
      createUsbReportEvent(device, 0, 0, 0, 0, {
        sticks: [128, 128, 255, 128], // full right on look
      }),
    );

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.lookYaw).toBeLessThan(0);
  });

  it("leaves a centred stick alone rather than drifting", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(createUsbReportEvent(device, 0, 0));

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
    expect(frame.lookYaw).toBe(0);
  });

  it("maps face and shoulder buttons through the standard bindings", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(
      createUsbReportEvent(device, 0, 0, 0, 0, {
        face: 1 << 5, // cross -> jump
        shoulder: (1 << 5) | (1 << 6), // options -> menu, L3 -> sprint
      }),
    );

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.buttons.jump).toBe(true);
    expect(frame.buttons.menu).toBe(true);
    expect(frame.buttons.sprint).toBe(true);
    expect(frame.buttons.interact).toBe(false);
  });

  it("still reports sticks when the gyro is disabled", async () => {
    const { source, device } = await createCalibratedSource({
      dualsenseGyroMode: "disabled",
    });

    source.handleInputReport(
      createUsbReportEvent(device, 3000, 3000, 0, 0, {
        sticks: [128, 255, 128, 128],
      }),
    );

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.moveY).toBeGreaterThan(0.9);
    expect(frame.lookPitch).toBe(0); // gyro really is off
  });

  it("goes quiet when gamepad input is disabled entirely", async () => {
    const { source, device } = await createCalibratedSource({
      gamepadEnabled: false,
    });

    source.handleInputReport(
      createUsbReportEvent(device, 0, 0, 0, 0, {
        sticks: [255, 255, 255, 255],
        face: 1 << 5,
      }),
    );

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.moveX).toBe(0);
    expect(frame.buttons.jump).toBe(false);
  });

  it("stops contributing sticks once the device is released", async () => {
    const { source, device } = await createCalibratedSource();

    source.handleInputReport(
      createUsbReportEvent(device, 0, 0, 0, 0, {
        sticks: [255, 128, 128, 128],
      }),
    );
    expect(source.ownsDevice()).toBe(true);

    source.detachDevice();
    expect(source.ownsDevice()).toBe(false);

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);
    expect(frame.moveX).toBe(0);
  });

  it("resets accumulated deltas on reset()", async () => {
    const { source, device } = await createCalibratedSource({
      dualsenseGyroMode: "always",
    });

    source.handleInputReport(createUsbReportEvent(device, 500, -500, 0, 0));
    source.reset();

    const frame = createEmptyFrame();
    source.sample(frame, 1 / 60);

    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);
  });
});
