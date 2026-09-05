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
    fire: ["Mouse0"],
    reload: ["KeyR"],
    secondary: ["KeyB"],
    jump: ["Space"],
    interact: ["KeyE"],
    chargeThrow: ["KeyQ"],
    aim: ["KeyF", "Mouse2"],
    sprint: ["ShiftLeft"],
    crouch: ["KeyC"],
    menu: ["Escape"],
  },
};

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  buttons: {
    fire: 7, // RT
    reload: 3, // Y
    secondary: 5, // RB
    jump: 0, // A
    crouch: 1, // B
    interact: 2, // X
    aim: 6, // LT / L2
    chargeThrow: 7, // RT / R2
    menu: 9, // Start
    sprint: 10, // L3
  },
};
