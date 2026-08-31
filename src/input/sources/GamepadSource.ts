import type { InputSource } from "../InputSource";
import type { InputFrame } from "../actions";
import { DEFAULT_GAMEPAD_BINDINGS, type GamepadBindings } from "../bindings";
import { applyRadialDeadzone, applyResponseCurve } from "../deadzone";
import { isTextInputActive } from "../textInputMode";
import { gameConfig } from "@/config";

export type GamepadConfig = Pick<
  typeof gameConfig,
  | "gamepadEnabled"
  | "gamepadLookSensitivity"
  | "gamepadDeadzone"
  | "gamepadInvertY"
>;

export interface GamepadSourceOptions {
  bindings?: GamepadBindings;
  getGamepads?: () => (Gamepad | null)[];
  getConfig?: () => GamepadConfig;
}

export class GamepadSource implements InputSource {
  public readonly id = "gamepad";

  private readonly bindings: GamepadBindings;
  private readonly getGamepads: () => (Gamepad | null)[];
  private readonly getConfig: () => GamepadConfig;

  private hasWarnedNonStandard = false;

  constructor(options: GamepadSourceOptions = {}) {
    this.bindings = options.bindings ?? DEFAULT_GAMEPAD_BINDINGS;
    this.getGamepads =
      options.getGamepads ??
      ((): (Gamepad | null)[] => {
        if (typeof navigator !== "undefined" && navigator.getGamepads) {
          return Array.from(navigator.getGamepads());
        }
        return [];
      });
    this.getConfig =
      options.getConfig ??
      ((): GamepadConfig => ({
        gamepadEnabled: gameConfig.gamepadEnabled,
        gamepadLookSensitivity: gameConfig.gamepadLookSensitivity,
        gamepadDeadzone: gameConfig.gamepadDeadzone,
        gamepadInvertY: gameConfig.gamepadInvertY,
      }));
  }

  public connect(): () => void {
    const handleDisconnect = (): void => {
      this.reset();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("gamepaddisconnected", handleDisconnect);
    }

    return (): void => {
      if (typeof window !== "undefined") {
        window.removeEventListener("gamepaddisconnected", handleDisconnect);
      }
    };
  }

  public sample(frame: InputFrame, dt: number): void {
    if (isTextInputActive()) return;

    const config = this.getConfig();
    if (!config.gamepadEnabled) return;

    const gamepads = this.getGamepads();
    const pad = gamepads.find((p): p is Gamepad => Boolean(p && p.connected));
    if (!pad) return;

    if (pad.mapping !== "standard") {
      if (!this.hasWarnedNonStandard) {
        console.warn(
          `[GamepadSource] Unsupported non-standard gamepad mapping: "${pad.mapping}". Only standard mapping is supported.`,
        );
        this.hasWarnedNonStandard = true;
      }
      return;
    }

    // Left stick -> Movement
    const rawMoveX = pad.axes[0] ?? 0;
    const rawMoveY = pad.axes[1] ?? 0;
    const [moveX, moveY] = applyRadialDeadzone(
      rawMoveX,
      rawMoveY,
      config.gamepadDeadzone,
    );

    frame.moveX += moveX;
    frame.moveY += moveY;

    // Right stick -> Look (rate-based)
    const rawLookX = pad.axes[2] ?? 0;
    const rawLookY = pad.axes[3] ?? 0;
    const [deadzoneLookX, deadzoneLookY] = applyRadialDeadzone(
      rawLookX,
      rawLookY,
      config.gamepadDeadzone,
    );

    const curvedLookX = applyResponseCurve(deadzoneLookX, 2.0);
    const curvedLookY = applyResponseCurve(deadzoneLookY, 2.0);

    const yawRate = curvedLookX * config.gamepadLookSensitivity;
    let pitchRate = curvedLookY * config.gamepadLookSensitivity;
    if (config.gamepadInvertY) {
      pitchRate = -pitchRate;
    }

    frame.lookYaw -= yawRate * dt;
    frame.lookPitch -= pitchRate * dt;

    // Buttons
    for (const [action, buttonIndex] of Object.entries(this.bindings.buttons)) {
      const buttonAction = action as keyof typeof frame.buttons;
      const button = pad.buttons[buttonIndex];
      if (!button) continue;

      const isTrigger = buttonAction === "chargeThrow";
      const isPressed = isTrigger
        ? button.value > 0.5 || button.pressed
        : button.pressed;

      if (isPressed) {
        frame.buttons[buttonAction] = true;
      }
    }
  }

  public reset(): void {
    // Gamepad state is polled live; reset is a no-op except for ensuring clean state transitions
  }
}
