import type { InputSource } from "../InputSource";
import type { InputFrame } from "../actions";
import { isTextInputActive } from "../textInputMode";
import {
  parseDualSenseReport,
  isDualSenseDevice,
  DUALSENSE_VENDOR_ID,
  DUALSENSE_LSB_TO_RAD_S,
  type DualSenseReportType,
} from "../dualsense/dualsenseReport";
import { DEFAULT_GAMEPAD_BINDINGS, type GamepadBindings } from "../bindings";
import { PadSampler, type PadSnapshot } from "../padSampling";
import { NO_AIM_MODULATION, type AimModulation } from "../aimModulation";
import { gameConfig } from "@/config";
import type {
  HID,
  HIDDevice,
  HIDDeviceEvent,
  HIDInputReportEvent,
} from "@/types/webhid";

export interface DualSenseState {
  readonly connected: boolean;
  readonly deviceName: string | null;
  readonly connectionType: DualSenseReportType | null;
  readonly batteryLevel: number | null;
  readonly isCharging: boolean;
  readonly isCalibrating: boolean;
}

export type DualSenseConfig = Pick<
  typeof gameConfig,
  | "dualsenseGyroMode"
  | "dualsenseGyroSensitivity"
  | "dualsenseGyroInvertY"
  | "dualsenseHidEnabled"
  | "gamepadEnabled"
  | "gamepadLookSensitivity"
  | "gamepadLookCurve"
  | "gamepadDeadzone"
  | "gamepadInvertY"
>;

export interface DualSenseHidSourceOptions {
  getHid?: () => HID | undefined;
  getConfig?: () => DualSenseConfig;
  getAimModulation?: () => AimModulation;
  bindings?: GamepadBindings;
}

const CALIBRATION_SAMPLES_TARGET = 64;

/** 50ms cap; a longer gap means a hitch, not real elapsed rotation. */
const MAX_REPORT_DT = 0.05;
const NOMINAL_REPORT_DT = 1 / 250;

/**
 * Ceiling on unconsumed rotation (~20°). Reports keep streaming while the render
 * loop is stalled (tab hidden, menu open), and without this the whole backlog
 * would land in one frame the moment `sample()` resumes.
 */
const MAX_ACCUMULATED_DELTA_RAD = 0.35;

/** Matches GamepadSource's `value > 0.5` on the same physical trigger. */
const TRIGGER_PRESS_THRESHOLD = 128;

function clampDelta(value: number): number {
  return Math.max(
    -MAX_ACCUMULATED_DELTA_RAD,
    Math.min(MAX_ACCUMULATED_DELTA_RAD, value),
  );
}

export class DualSenseHidSource implements InputSource {
  public readonly id = "dualsense";

  private readonly getHid: () => HID | undefined;
  private readonly getConfig: () => DualSenseConfig;
  private getAimModulation: () => AimModulation;
  private readonly bindings: GamepadBindings;

  private readonly sampler = new PadSampler();
  /** Latest sticks and buttons; the pad half of the device, unlike the gyro. */
  private padSnapshot: PadSnapshot | null = null;

  private activeDevice: HIDDevice | null = null;
  private connectionType: DualSenseReportType | null = null;
  private deviceName: string | null = null;
  private batteryLevel: number | null = null;
  private isCharging = false;

  /** Mirrors L2 for the gyro gate; every other button goes through the sampler. */
  private isL2Held = false;

  // Gyro accumulation
  private accumulatedYawDelta = 0;
  private accumulatedPitchDelta = 0;
  private lastReportTimestamp = 0;

  // Calibration state
  private isCalibrating = false;
  private calibrationSampleCount = 0;
  private calibrationSumPitch = 0;
  private calibrationSumYaw = 0;
  private biasPitch = 0;
  private biasYaw = 0;

  private readonly stateListeners = new Set<(state: DualSenseState) => void>();

  constructor(options: DualSenseHidSourceOptions = {}) {
    this.getHid =
      options.getHid ??
      ((): HID | undefined => {
        if (typeof navigator !== "undefined" && navigator.hid) {
          return navigator.hid;
        }
        return undefined;
      });

    this.getConfig =
      options.getConfig ??
      ((): DualSenseConfig => ({
        dualsenseGyroMode: gameConfig.dualsenseGyroMode,
        dualsenseGyroSensitivity: gameConfig.dualsenseGyroSensitivity,
        dualsenseGyroInvertY: gameConfig.dualsenseGyroInvertY,
        dualsenseHidEnabled: gameConfig.dualsenseHidEnabled,
        gamepadEnabled: gameConfig.gamepadEnabled,
        gamepadLookSensitivity: gameConfig.gamepadLookSensitivity,
        gamepadLookCurve: gameConfig.gamepadLookCurve,
        gamepadDeadzone: gameConfig.gamepadDeadzone,
        gamepadInvertY: gameConfig.gamepadInvertY,
      }));

    this.getAimModulation =
      options.getAimModulation ?? ((): AimModulation => NO_AIM_MODULATION);
    this.bindings = options.bindings ?? DEFAULT_GAMEPAD_BINDINGS;
  }

  /**
   * Lets the composition root inject aim assist after construction, since the
   * shared instance is built before the targeting layer is wired up.
   */
  public setAimModulationAccessor(accessor: () => AimModulation): void {
    this.getAimModulation = accessor;
  }

  /** True while this source holds the device, and so owes the frame its sticks. */
  public ownsDevice(): boolean {
    return this.activeDevice !== null;
  }

  public getState(): DualSenseState {
    return {
      connected: this.activeDevice !== null && this.activeDevice.opened,
      deviceName: this.deviceName,
      connectionType: this.connectionType,
      batteryLevel: this.batteryLevel,
      isCharging: this.isCharging,
      isCalibrating: this.isCalibrating,
    };
  }

  public subscribeState(listener: (state: DualSenseState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return (): void => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyState(): void {
    const state = this.getState();
    this.stateListeners.forEach((l) => l(state));
  }

  public connect(): () => void {
    const hid = this.getHid();
    if (!hid) return () => {};

    const handleConnect = async (event: HIDDeviceEvent): Promise<void> => {
      if (
        !this.activeDevice &&
        this.getConfig().dualsenseHidEnabled &&
        isDualSenseDevice(event.device.vendorId, event.device.productId)
      ) {
        await this.attachDevice(event.device);
      }
    };

    const handleDisconnect = (event: HIDDeviceEvent): void => {
      if (this.activeDevice === event.device) {
        this.detachDevice();
      }
    };

    hid.addEventListener("connect", handleConnect);
    hid.addEventListener("disconnect", handleDisconnect);

    // Auto-attach any previously paired DualSense, unless the player opted out.
    if (!this.getConfig().dualsenseHidEnabled) {
      return (): void => {
        hid.removeEventListener("connect", handleConnect);
        hid.removeEventListener("disconnect", handleDisconnect);
      };
    }

    hid
      .getDevices()
      .then(async (devices) => {
        const dualsense = devices.find((d) =>
          isDualSenseDevice(d.vendorId, d.productId),
        );
        if (dualsense && !this.activeDevice) {
          await this.attachDevice(dualsense);
        }
      })
      .catch(() => {});

    return (): void => {
      hid.removeEventListener("connect", handleConnect);
      hid.removeEventListener("disconnect", handleDisconnect);
      this.detachDevice();
    };
  }

  public async requestPair(): Promise<boolean> {
    const hid = this.getHid();
    if (!hid) return false;

    try {
      const devices = await hid.requestDevice({
        filters: [{ vendorId: DUALSENSE_VENDOR_ID }],
      });
      const selected = devices.find((d) =>
        isDualSenseDevice(d.vendorId, d.productId),
      );
      if (!selected) return false;

      await this.attachDevice(selected);
      return this.activeDevice === selected;
    } catch {
      return false;
    }
  }

  public async attachDevice(device: HIDDevice): Promise<void> {
    if (this.activeDevice && this.activeDevice !== device) {
      this.detachDevice();
    }

    try {
      if (!device.opened) {
        await device.open();
      }

      // Reading feature report 0x05 flips a Bluetooth-connected DualSense into
      // the extended report mode (0x31) that carries motion data.
      try {
        await device.receiveFeatureReport(0x05);
      } catch {
        // USB connection or already active - ignore
      }

      this.activeDevice = device;
      this.deviceName = device.productName || "DualSense Wireless Controller";
      this.lastReportTimestamp = 0;

      device.addEventListener("inputreport", this.handleInputReport);
      this.startCalibration();
      this.notifyState();
    } catch (err) {
      console.warn("[DualSenseHidSource] Failed to open device:", err);
      this.detachDevice();
    }
  }

  public detachDevice(): void {
    const device = this.activeDevice;
    if (device) {
      device.removeEventListener("inputreport", this.handleInputReport);
      this.activeDevice = null;
      // Release the OS handle, otherwise the controller stays claimed by this
      // page until the tab closes.
      if (device.opened) {
        void device.close().catch(() => {});
      }
    }
    this.connectionType = null;
    this.deviceName = null;
    this.batteryLevel = null;
    this.isCharging = false;
    this.isL2Held = false;
    this.padSnapshot = null;
    this.reset();
    this.notifyState();
  }

  public recalibrate(): void {
    this.startCalibration();
  }

  private startCalibration(): void {
    this.isCalibrating = true;
    this.calibrationSampleCount = 0;
    this.calibrationSumPitch = 0;
    this.calibrationSumYaw = 0;
    this.notifyState();
  }

  public handleInputReport = (event: HIDInputReportEvent): void => {
    const report = parseDualSenseReport(event.reportId, event.data);
    if (!report.valid) return;

    if (this.connectionType !== report.reportType) {
      this.connectionType = report.reportType;
      this.notifyState();
    }

    if (
      this.batteryLevel !== report.batteryLevel ||
      this.isCharging !== report.isCharging
    ) {
      this.batteryLevel = report.batteryLevel;
      this.isCharging = report.isCharging;
      this.notifyState();
    }

    this.isL2Held = report.triggerL2 >= TRIGGER_PRESS_THRESHOLD;
    this.padSnapshot = { axes: report.axes, buttons: report.buttons };

    const now = performance.now();
    const elapsed =
      this.lastReportTimestamp > 0
        ? (now - this.lastReportTimestamp) / 1000
        : NOMINAL_REPORT_DT;
    this.lastReportTimestamp = now;
    const reportDt = elapsed > MAX_REPORT_DT ? NOMINAL_REPORT_DT : elapsed;

    if (this.isCalibrating) {
      this.calibrationSumPitch += report.gyroPitch;
      this.calibrationSumYaw += report.gyroYaw;
      this.calibrationSampleCount++;

      if (this.calibrationSampleCount >= CALIBRATION_SAMPLES_TARGET) {
        this.biasPitch = this.calibrationSumPitch / this.calibrationSampleCount;
        this.biasYaw = this.calibrationSumYaw / this.calibrationSampleCount;
        this.isCalibrating = false;
        this.notifyState();
      }
      return;
    }

    // Integrate calibrated gyro rates
    const pitchRadS =
      (report.gyroPitch - this.biasPitch) * DUALSENSE_LSB_TO_RAD_S;
    const yawRadS = (report.gyroYaw - this.biasYaw) * DUALSENSE_LSB_TO_RAD_S;

    this.accumulatedPitchDelta = clampDelta(
      this.accumulatedPitchDelta + pitchRadS * reportDt,
    );
    this.accumulatedYawDelta = clampDelta(
      this.accumulatedYawDelta + yawRadS * reportDt,
    );
  };

  public sample(frame: InputFrame, dt: number): void {
    // Reports keep arriving regardless, so anything that skips this frame's
    // contribution has to drop the accumulated rotation with it.
    if (isTextInputActive()) {
      this.clearAccumulatedDeltas();
      return;
    }

    const config = this.getConfig();

    // Claiming the device over WebHID takes it away from the Gamepad API on
    // some platforms, so this source owes the frame the whole controller —
    // sticks and buttons included — not just the gyro it came for.
    if (this.padSnapshot && config.gamepadEnabled) {
      this.sampler.sample(
        frame,
        dt,
        this.padSnapshot,
        config,
        this.bindings,
        this.getAimModulation(),
      );
    }

    const {
      dualsenseGyroMode,
      dualsenseGyroSensitivity,
      dualsenseGyroInvertY,
    } = config;

    // L2 alone arms the gyro. Charging a throw on R2 does not: the wind-up
    // already shakes the controller, and steering the shot with that shake is
    // exactly the drift the player would have to fight.
    const shouldApplyGyro =
      dualsenseGyroMode === "always" ||
      (dualsenseGyroMode === "aiming" && this.isL2Held);

    if (shouldApplyGyro) {
      const pitchSign = dualsenseGyroInvertY ? -1 : 1;
      frame.lookYaw += this.accumulatedYawDelta * dualsenseGyroSensitivity;
      frame.lookPitch +=
        pitchSign * this.accumulatedPitchDelta * dualsenseGyroSensitivity;
    }

    this.clearAccumulatedDeltas();
  }

  private clearAccumulatedDeltas(): void {
    this.accumulatedPitchDelta = 0;
    this.accumulatedYawDelta = 0;
  }

  public reset(): void {
    this.clearAccumulatedDeltas();
    this.sampler.reset();
    this.lastReportTimestamp = 0;
  }
}
