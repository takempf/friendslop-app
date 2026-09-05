export const BUTTON_ACTIONS = [
  "fire",
  "reload",
  "secondary",
  "jump",
  "interact",
  "chargeThrow",
  "aim",
  "sprint",
  "crouch",
  "menu",
] as const;

export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export interface InputFrame {
  /** -1..1, analog magnitude preserved. Vector length clamped to 1 by the manager. */
  moveX: number;
  moveY: number;
  /** Radians to add to yaw/pitch this frame - already dt- and sensitivity-scaled. */
  lookYaw: number;
  lookPitch: number;
  buttons: Record<ButtonAction, boolean>;
}

export type ActiveDevice = "keyboard" | "gamepad";

/**
 * A zeroed frame. The manager allocates one per source per tick, so this is the
 * single place that has to learn about a new action.
 */
export function createEmptyFrame(): InputFrame {
  const buttons = {} as Record<ButtonAction, boolean>;
  for (const action of BUTTON_ACTIONS) {
    buttons[action] = false;
  }
  return { moveX: 0, moveY: 0, lookYaw: 0, lookPitch: 0, buttons };
}
