import { describe, it, expect, vi } from "vitest";
import { GamepadSource } from "./GamepadSource";
import { createEmptyFrame } from "../actions";

function createMockGamepad(overrides: Partial<Gamepad> = {}): Gamepad {
  const defaultButtons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));

  return {
    id: "Mock Controller",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 1000,
    axes: [0, 0, 0, 0],
    buttons: defaultButtons,
    hapticActuators: [],
    vibrationActuator: null,
    ...overrides,
  } as Gamepad;
}

describe("GamepadSource", () => {
  const defaultConfig = {
    gamepadEnabled: true,
    gamepadLookSensitivity: 3.0,
    gamepadLookCurve: 1.6,
    gamepadDeadzone: 0.15,
    gamepadInvertY: false,
  };

  it("skips a DualSense that WebHID has claimed, so it is not counted twice", () => {
    const mockPads: (Gamepad | null)[] = [
      createMockGamepad({
        id: "DualSense Wireless Controller (054c:0ce6)",
        axes: [0.8, 0, 0, 0],
      }),
    ];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
      getIsHidClaimActive: () => true,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.moveX).toBe(0);
  });

  it("still reads a non-DualSense pad while WebHID holds a DualSense", () => {
    const mockPads: (Gamepad | null)[] = [
      createMockGamepad({
        id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)",
        axes: [0.8, 0, 0, 0],
      }),
    ];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
      getIsHidClaimActive: () => true,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.moveX).toBeGreaterThan(0);
  });

  it("reads left stick movement with deadzone applied", () => {
    const mockPads: (Gamepad | null)[] = [
      createMockGamepad({ axes: [0.8, -0.6, 0, 0] }),
    ];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.moveX).toBeGreaterThan(0);
    expect(frame.moveY).toBeLessThan(0);
  });

  it("ignores sub-deadzone stick noise", () => {
    const mockPads: (Gamepad | null)[] = [
      createMockGamepad({ axes: [0.05, 0.05, 0.05, 0.05] }),
    ];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
    expect(frame.lookYaw).toBe(0);
    expect(frame.lookPitch).toBe(0);
  });

  it("maps button presses to actions", () => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    buttons[0] = { pressed: true, touched: true, value: 1 }; // Jump (A)
    buttons[2] = { pressed: true, touched: true, value: 1 }; // Interact (X)

    const mockPads: (Gamepad | null)[] = [createMockGamepad({ buttons })];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.buttons.jump).toBe(true);
    expect(frame.buttons.interact).toBe(true);
    expect(frame.buttons.sprint).toBe(false);
  });

  it("respects the 0.5 threshold on analog triggers for chargeThrow", () => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    buttons[7] = { pressed: false, touched: true, value: 0.3 }; // RT below threshold

    let mockPads: (Gamepad | null)[] = [createMockGamepad({ buttons })];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    let frame = createEmptyFrame();
    source.sample(frame, 0.016);
    expect(frame.buttons.chargeThrow).toBe(false);

    // Now above threshold
    buttons[7] = { pressed: false, touched: true, value: 0.7 };
    mockPads = [createMockGamepad({ buttons })];
    frame = createEmptyFrame();
    source.sample(frame, 0.016);
    expect(frame.buttons.chargeThrow).toBe(true);
  });

  it("ignores gamepads with non-standard mapping", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: true,
      touched: true,
      value: 1,
    }));
    const mockPads: (Gamepad | null)[] = [
      createMockGamepad({ mapping: "" as GamepadMappingType, buttons }),
    ];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);

    expect(frame.buttons.jump).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("releases held actions immediately if controller is disconnected mid-hold", () => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: true,
      touched: true,
      value: 1,
    }));
    let mockPads: (Gamepad | null)[] = [createMockGamepad({ buttons })];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    let frame = createEmptyFrame();
    source.sample(frame, 0.016);
    expect(frame.buttons.jump).toBe(true);

    // Controller disconnects
    mockPads = [];
    frame = createEmptyFrame();
    source.sample(frame, 0.016);
    expect(frame.buttons.jump).toBe(false);
  });

  it("applies injected aim modulation slowdown to look rates", () => {
    const pad = createMockGamepad({ axes: [0, 0, 1.0, 0] });
    const normalSource = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => defaultConfig,
    });
    const slowedSource = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => defaultConfig,
      getAimModulation: () => ({ slowdown: 0.5 }),
    });

    const frameNormal = createEmptyFrame();
    normalSource.sample(frameNormal, 0.016);

    const frameSlowed = createEmptyFrame();
    slowedSource.sample(frameSlowed, 0.016);

    expect(frameSlowed.lookYaw).toBeCloseTo(frameNormal.lookYaw * 0.5, 5);
  });

  it("resets acceleration ramp state on reset()", () => {
    const pad = createMockGamepad({ axes: [0, 0, 1.0, 0] });
    const source = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => defaultConfig,
    });

    // Advance ramp over several frames
    for (let i = 0; i < 15; i++) {
      const f = createEmptyFrame();
      source.sample(f, 0.016);
    }

    const frameFullRamp = createEmptyFrame();
    source.sample(frameFullRamp, 0.016);

    // Reset source
    source.reset();

    const frameAfterReset = createEmptyFrame();
    source.sample(frameAfterReset, 0.016);

    // Rate right after reset starts back at startScale (lower magnitude)
    expect(Math.abs(frameAfterReset.lookYaw)).toBeLessThan(
      Math.abs(frameFullRamp.lookYaw),
    );
  });

  it("tracks activePadSampled status via hasActivePad()", () => {
    let mockPads: (Gamepad | null)[] = [createMockGamepad()];
    const source = new GamepadSource({
      getGamepads: () => mockPads,
      getConfig: () => defaultConfig,
    });

    expect(source.hasActivePad()).toBe(false);

    const frame = createEmptyFrame();
    source.sample(frame, 0.016);
    expect(source.hasActivePad()).toBe(true);

    mockPads = [];
    source.sample(frame, 0.016);
    expect(source.hasActivePad()).toBe(false);
  });
});
