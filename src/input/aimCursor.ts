import type { InputFrame } from "./actions";

/**
 * Screen-space manual-aim cursor, in units of viewport height (the same units
 * `aimState.screenX/Y` uses). Mirrors `aimModulation`: a mutable singleton the
 * input layer writes once per frame and the targeting layer reads, so neither
 * has to reach into the other's manager.
 */
export interface AimCursor {
  /** True while the aim button is held. */
  active: boolean;
  x: number;
  y: number;
}

export const aimCursor: AimCursor = { active: false, x: 0, y: 0 };

/** Keeps the cursor inside the viewport rather than off-screen. */
export const MAX_AIM_CURSOR_RADIUS = 0.45;

/**
 * How far the camera itself still turns while manually aiming. The cursor takes
 * the full look delta and the camera takes a fifth of it, so fine aim happens on
 * screen instead of by swinging the whole view.
 */
export const MANUAL_AIM_LOOK_SCALE = 0.2;

/**
 * Advances the cursor by this frame's look delta. Must run after the frame is
 * merged and before targeting consumes it.
 */
export function updateAimCursor(cursor: AimCursor, frame: InputFrame): void {
  if (!frame.buttons.aim) {
    cursor.active = false;
    cursor.x = 0;
    cursor.y = 0;
    return;
  }

  cursor.active = true;
  cursor.x -= frame.lookYaw;
  cursor.y += frame.lookPitch;

  const radius = Math.hypot(cursor.x, cursor.y);
  if (radius > MAX_AIM_CURSOR_RADIUS) {
    const scale = MAX_AIM_CURSOR_RADIUS / radius;
    cursor.x *= scale;
    cursor.y *= scale;
  }
}
