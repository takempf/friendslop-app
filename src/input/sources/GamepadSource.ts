import type { InputSource } from "../InputSource";
import type { InputFrame } from "../actions";
import { DEFAULT_GAMEPAD_BINDINGS, type GamepadBindings } from "../bindings";
import { shapeStick, STICK_SATURATION } from "../stick";
import { advanceRamp, rampScale } from "../lookRamp";
import { mapLookRates } from "../lookMapping";
import { NO_AIM_MODULATION, type AimModulation } from "../aimModulation";
import { isTextInputActive } from "../textInputMode";
import { gameConfig } from "@/config";

export type GamepadConfig = Pick<
  typeof gameConfig,
  | "gamepadEnabled"
  | "gamepadLookSensitivity"
  | "gamepadLookCurve"
  | "gamepadDeadzone"
  | "gamepadInvertY"
>;

export interface GamepadSourceOptions {
  bindings?: GamepadBindings;
  getGamepads?: () => (Gamepad | null)[];
  getConfig?: () => GamepadConfig;
  getAimModulation?: () => AimModulation;
}

export class GamepadSource implements InputSource {
  public readonly id = "gamepad";

  private readonly bindings: GamepadBindings;
  private readonly getGamepads: () => (Gamepad | null)[];
  private readonly getConfig: () => GamepadConfig;
  private readonly getAimModulation: () => AimModulation;

  private rampProgress = 0;
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
        gamepadLookCurve: gameConfig.gamepadLookCurve,
        gamepadDeadzone: gameConfig.gamepadDeadzone,
        gamepadInvertY: gameConfig.gamepadInvertY,
      }));
    this.getAimModulation =
      options.getAimModulation ?? ((): AimModulation => NO_AIM_MODULATION);
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

    // Left stick -> Movement (linear curve)
    const rawMoveX = pad.axes[0] ?? 0;
    const rawMoveY = pad.axes[1] ?? 0;
    const [moveX, moveY] = shapeStick(rawMoveX, rawMoveY, {
      deadzone: config.gamepadDeadzone,
      saturation: STICK_SATURATION,
      curve: 1.0,
    });

    frame.moveX += moveX;
    frame.moveY += moveY;

    // Right stick -> Look (shaped + ramp + modulation)
    const rawLookX = pad.axes[2] ?? 0;
    const rawLookY = pad.axes[3] ?? 0;
    const [shapedLookX, shapedLookY] = shapeStick(rawLookX, rawLookY, {
      deadzone: config.gamepadDeadzone,
      saturation: STICK_SATURATION,
      curve: config.gamepadLookCurve,
    });

    const deflection = Math.hypot(shapedLookX, shapedLookY);
    this.rampProgress = advanceRamp(this.rampProgress, deflection, dt);
    const currentRamp = rampScale(this.rampProgress);

    const modulation = this.getAimModulation();
    const [yawRate, pitchRate] = mapLookRates(
      shapedLookX,
      shapedLookY,
      currentRamp,
      {
        sensitivity: config.gamepadLookSensitivity,
        invertY: config.gamepadInvertY,
      },
      modulation,
    );

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
    this.rampProgress = 0;
  }
}
