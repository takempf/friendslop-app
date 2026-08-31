import type { ButtonAction } from "./actions";

export interface KeyBindings {
  forward: string[];
  backward: string[];
  left: string[];
  right: string[];
  buttons: Record<ButtonAction, string[]>;
}

export interface GamepadBindings {
  buttons: Record<ButtonAction, number>;
}

export const DEFAULT_KEYBOARD_BINDINGS: KeyBindings = {
  forward: ["KeyW"],
  backward: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  buttons: {
    jump: ["Space"],
    interact: ["KeyE"],
    chargeThrow: ["KeyQ"],
    sprint: ["ShiftLeft"],
    crouch: ["KeyC"],
    menu: ["Escape"],
  },
};

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  buttons: {
    jump: 0, // A
    crouch: 1, // B
    interact: 2, // X
    chargeThrow: 7, // RT
    menu: 9, // Start
    sprint: 10, // L3
  },
};
