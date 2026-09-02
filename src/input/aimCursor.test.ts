import { describe, it, expect, beforeEach } from "vitest";
import {
  aimCursor,
  updateAimCursor,
  MAX_AIM_CURSOR_RADIUS,
  type AimCursor,
} from "./aimCursor";
import { createEmptyFrame, type InputFrame } from "./actions";

function frameWith(
  overrides: Partial<Pick<InputFrame, "lookYaw" | "lookPitch">> & {
    aim?: boolean;
  } = {},
): InputFrame {
  const frame = createEmptyFrame();
  frame.lookYaw = overrides.lookYaw ?? 0;
  frame.lookPitch = overrides.lookPitch ?? 0;
  frame.buttons.aim = overrides.aim ?? false;
  return frame;
}

describe("updateAimCursor", () => {
  let cursor: AimCursor;

  beforeEach(() => {
    cursor = { active: false, x: 0, y: 0 };
  });

  it("stays inert and centred while the aim button is up", () => {
    updateAimCursor(cursor, frameWith({ lookYaw: 0.2, lookPitch: 0.2 }));

    expect(cursor.active).toBe(false);
    expect(cursor.x).toBe(0);
    expect(cursor.y).toBe(0);
  });

  it("accumulates look deltas while aiming, inverting yaw to screen X", () => {
    updateAimCursor(cursor, frameWith({ aim: true, lookYaw: 0.05 }));
    updateAimCursor(cursor, frameWith({ aim: true, lookYaw: 0.05 }));

    // Yawing right sweeps the world left past the cursor, so screen X goes negative.
    expect(cursor.active).toBe(true);
    expect(cursor.x).toBeCloseTo(-0.1, 6);

    updateAimCursor(cursor, frameWith({ aim: true, lookPitch: 0.03 }));
    expect(cursor.y).toBeCloseTo(0.03, 6);
  });

  it("recentres the moment aim is released", () => {
    updateAimCursor(cursor, frameWith({ aim: true, lookYaw: -0.2 }));
    expect(cursor.x).toBeGreaterThan(0);

    updateAimCursor(cursor, frameWith({ aim: false }));
    expect(cursor).toEqual({ active: false, x: 0, y: 0 });
  });

  it("clamps to a radius so the cursor cannot leave the viewport", () => {
    for (let i = 0; i < 100; i++) {
      updateAimCursor(
        cursor,
        frameWith({ aim: true, lookYaw: -0.1, lookPitch: 0.1 }),
      );
    }

    expect(Math.hypot(cursor.x, cursor.y)).toBeCloseTo(
      MAX_AIM_CURSOR_RADIUS,
      6,
    );
    // Clamping is radial, so the direction the player aimed is preserved.
    expect(cursor.x).toBeCloseTo(cursor.y, 6);
  });

  it("ships a shared singleton that starts centred and inactive", () => {
    expect(aimCursor).toEqual({ active: false, x: 0, y: 0 });
  });
});
