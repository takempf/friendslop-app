export const BUTTON_ACTIONS = [
  "jump",
  "interact",
  "chargeThrow",
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
