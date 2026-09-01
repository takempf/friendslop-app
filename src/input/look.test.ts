import { describe, it, expect } from "vitest";
import { GamepadSource } from "./sources/GamepadSource";
import type { InputFrame } from "./actions";

function createMockGamepad(overrides: Partial<Gamepad> = {}): Gamepad {
  return {
    id: "Mock Controller",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 1000,
    axes: [0, 0, 0, 0],
    buttons: [],
    hapticActuators: [],
    vibrationActuator: null,
    ...overrides,
  } as Gamepad;
}

function createEmptyFrame(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    lookYaw: 0,
    lookPitch: 0,
    buttons: {
      jump: false,
      interact: false,
      chargeThrow: false,
      sprint: false,
      crouch: false,
      menu: false,
    },
  };
}

describe("look rate vs displacement scaling", () => {
  const baseConfig = {
    gamepadEnabled: true,
    gamepadLookSensitivity: 3.0,
    gamepadLookCurve: 1.6,
    gamepadDeadzone: 0.15,
    gamepadInvertY: false,
  };

  it("scales stick look rate proportionally with dt at steady state", () => {
    const pad = createMockGamepad({ axes: [0, 0, 1.0, 0] }); // full right look stick
    const sourceA = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => baseConfig,
    });
    const sourceB = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => baseConfig,
    });

    // Advance both sources past ramp time (0.2s)
    const warmupFrame = createEmptyFrame();
    sourceA.sample(warmupFrame, 0.3);
    sourceB.sample(warmupFrame, 0.3);

    const frameA = createEmptyFrame();
    sourceA.sample(frameA, 0.016); // ~60fps frame

    const frameB = createEmptyFrame();
    sourceB.sample(frameB, 0.032); // ~30fps frame (doubled dt)

    expect(frameB.lookYaw).toBeCloseTo(frameA.lookYaw * 2, 5);
  });

  it("inverts pitch only when gamepadInvertY is true", () => {
    const pad = createMockGamepad({ axes: [0, 0, 0.5, -0.8] }); // looking right and up
    const normalSource = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => baseConfig,
    });
    const invertedSource = new GamepadSource({
      getGamepads: () => [pad],
      getConfig: () => ({
        ...baseConfig,
        gamepadInvertY: true,
      }),
    });

    const frameNormal = createEmptyFrame();
    normalSource.sample(frameNormal, 0.016);

    const frameInverted = createEmptyFrame();
    invertedSource.sample(frameInverted, 0.016);

    // Yaw is unchanged
    expect(frameInverted.lookYaw).toBeCloseTo(frameNormal.lookYaw, 5);
    // Pitch is inverted
    expect(frameInverted.lookPitch).toBeCloseTo(-frameNormal.lookPitch, 5);
  });
});
