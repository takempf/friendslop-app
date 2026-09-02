import type { InputFrame } from "./actions";
import type { GamepadBindings } from "./bindings";
import { shapeStick, STICK_SATURATION } from "./stick";
import { advanceRamp, rampScale } from "./lookRamp";
import { mapLookRates } from "./lookMapping";
import { NO_AIM_MODULATION, type AimModulation } from "./aimModulation";
import type { gameConfig } from "@/config";

export type PadConfig = Pick<
  typeof gameConfig,
  | "gamepadLookSensitivity"
  | "gamepadLookCurve"
  | "gamepadDeadzone"
  | "gamepadInvertY"
>;

/**
 * A controller's state in standard-mapping terms: axes 0-3 are left X/Y and
 * right X/Y, and button indices follow the Gamepad API's standard layout.
 * Both the Gamepad API and raw DualSense HID reports are normalised into this,
 * so a controller feels the same whichever path it arrives through.
 */
export interface PadSnapshot {
  readonly axes: readonly number[];
  /** 0..1 per button, so analog triggers keep their travel. */
  readonly buttons: readonly number[];
}

/** Trigger actions read analog travel; everything else is a plain press. */
const TRIGGER_PRESS_RATIO = 0.5;

/**
 * Turns a pad snapshot into frame contributions. Owns the look ramp, which is
 * per-controller state that has to persist across frames.
 */
export class PadSampler {
  private rampProgress = 0;

  public sample(
    frame: InputFrame,
    dt: number,
    pad: PadSnapshot,
    config: PadConfig,
    bindings: GamepadBindings,
    modulation: AimModulation = NO_AIM_MODULATION,
  ): void {
    // Left stick -> Movement (linear curve)
    const [moveX, moveY] = shapeStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, {
      deadzone: config.gamepadDeadzone,
      saturation: STICK_SATURATION,
      curve: 1.0,
    });

    frame.moveX += moveX;
    frame.moveY += moveY;

    // Right stick -> Look (shaped + ramp + modulation)
    const [shapedLookX, shapedLookY] = shapeStick(
      pad.axes[2] ?? 0,
      pad.axes[3] ?? 0,
      {
        deadzone: config.gamepadDeadzone,
        saturation: STICK_SATURATION,
        curve: config.gamepadLookCurve,
      },
    );

    const deflection = Math.hypot(shapedLookX, shapedLookY);
    this.rampProgress = advanceRamp(this.rampProgress, deflection, dt);

    const [yawRate, pitchRate] = mapLookRates(
      shapedLookX,
      shapedLookY,
      rampScale(this.rampProgress),
      {
        sensitivity: config.gamepadLookSensitivity,
        invertY: config.gamepadInvertY,
      },
      modulation,
    );

    frame.lookYaw -= yawRate * dt;
    frame.lookPitch -= pitchRate * dt;

    for (const [action, buttonIndex] of Object.entries(bindings.buttons)) {
      const value = pad.buttons[buttonIndex];
      if (value === undefined) continue;

      if (value > TRIGGER_PRESS_RATIO) {
        frame.buttons[action as keyof InputFrame["buttons"]] = true;
      }
    }
  }

  public reset(): void {
    this.rampProgress = 0;
  }
}
