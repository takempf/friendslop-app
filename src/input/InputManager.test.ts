import { describe, it, expect, vi } from "vitest";
import { InputManager } from "./InputManager";
import type { InputSource } from "./InputSource";
import type { InputFrame } from "./actions";

function createMockSource(
  id: string,
  onSample?: (frame: InputFrame) => void,
): InputSource {
  return {
    id,
    connect: () => () => {},
    sample: (frame: InputFrame) => {
      if (onSample) onSample(frame);
    },
    reset: () => {},
  };
}

describe("InputManager", () => {
  it("merges button presses across multiple sources using logical OR", () => {
    const sourceA = createMockSource("keyboard", (frame) => {
      frame.buttons.jump = true;
    });
    const sourceB = createMockSource("gamepad", (frame) => {
      frame.buttons.jump = true;
      frame.buttons.interact = true;
    });

    const manager = new InputManager([sourceA, sourceB]);
    manager.update(0.016);

    expect(manager.pressed("jump")).toBe(true);
    expect(manager.pressed("interact")).toBe(true);
    expect(manager.pressed("sprint")).toBe(false);
  });

  it("triggers justPressed strictly on the initial frame of a press", () => {
    let pressed = false;
    const source = createMockSource("keyboard", (frame) => {
      frame.buttons.jump = pressed;
    });
    const manager = new InputManager([source]);

    // Frame 1: not pressed
    manager.update(0.016);
    expect(manager.justPressed("jump")).toBe(false);

    // Frame 2: pressed down
    pressed = true;
    manager.update(0.016);
    expect(manager.pressed("jump")).toBe(true);
    expect(manager.justPressed("jump")).toBe(true);

    // Frame 3: held down
    manager.update(0.016);
    expect(manager.pressed("jump")).toBe(true);
    expect(manager.justPressed("jump")).toBe(false);
  });

  it("triggers justReleased strictly on the frame of release", () => {
    let pressed = true;
    const source = createMockSource("keyboard", (frame) => {
      frame.buttons.chargeThrow = pressed;
    });
    const manager = new InputManager([source]);

    // Frame 1: holding
    manager.update(0.016);
    expect(manager.justReleased("chargeThrow")).toBe(false);

    // Frame 2: released
    pressed = false;
    manager.update(0.016);
    expect(manager.pressed("chargeThrow")).toBe(false);
    expect(manager.justReleased("chargeThrow")).toBe(true);

    // Frame 3: still released
    manager.update(0.016);
    expect(manager.justReleased("chargeThrow")).toBe(false);
  });

  it("sums movement vectors and clamps diagonal/combined length to <= 1", () => {
    const sourceA = createMockSource("keyboard", (frame) => {
      frame.moveX = 1;
      frame.moveY = -1; // raw length = sqrt(2) ~ 1.414
    });
    const manager = new InputManager([sourceA]);
    manager.update(0.016);

    const f = manager.getFrame();
    const len = Math.hypot(f.moveX, f.moveY);
    expect(len).toBeCloseTo(1, 5);
    expect(f.moveX).toBeCloseTo(Math.SQRT1_2, 5);
    expect(f.moveY).toBeCloseTo(-Math.SQRT1_2, 5);
  });

  it("sums look deltas across sources", () => {
    const sourceA = createMockSource("keyboard", (frame) => {
      frame.lookYaw = -0.05;
      frame.lookPitch = 0.02;
    });
    const sourceB = createMockSource("gamepad", (frame) => {
      frame.lookYaw = -0.03;
      frame.lookPitch = -0.01;
    });

    const manager = new InputManager([sourceA, sourceB]);
    manager.update(0.016);

    const f = manager.getFrame();
    expect(f.lookYaw).toBeCloseTo(-0.08, 5);
    expect(f.lookPitch).toBeCloseTo(0.01, 5);
  });

  it("tracks last active device and notifies subscribers", () => {
    let sourceAActive = false;
    let sourceBActive = false;

    const sourceA = createMockSource("keyboard", (frame) => {
      if (sourceAActive) frame.buttons.jump = true;
    });
    const sourceB = createMockSource("gamepad", (frame) => {
      if (sourceBActive) frame.moveX = 0.8;
    });

    const manager = new InputManager([sourceA, sourceB]);
    const listener = vi.fn();
    const unsub = manager.subscribeActiveDevice(listener);

    expect(manager.getActiveDevice()).toBe("keyboard");

    // Gamepad becomes active
    sourceBActive = true;
    manager.update(0.016);
    expect(manager.getActiveDevice()).toBe("gamepad");
    expect(listener).toHaveBeenCalledWith("gamepad");

    // Keyboard becomes active
    sourceBActive = false;
    sourceAActive = true;
    manager.update(0.016);
    expect(manager.getActiveDevice()).toBe("keyboard");
    expect(listener).toHaveBeenCalledWith("keyboard");

    unsub();
  });
});
