import * as THREE from "three";
import type { ActiveDevice } from "@/input/actions";
import { TARGET_KINDS, type AimState, type TargetingConfig } from "./types";

export interface AssistStrengths {
  yaw: number;
  pitch: number;
}

/**
 * Resolves camera look-rate friction / slowdown (0 = no slowdown, 1 = fully stopped).
 *
 * Friction applies only while locked onto a hoop target. The "player is holding a ball"
 * half of that condition is enforced upstream by `HoopProvider.isActive`, which only
 * emits the hoop candidate when `ctx.isHoldingEquipment` — so a hoop lock implies a held ball.
 */
export function resolveSlowdown(
  aim: Pick<AimState, "lock" | "targetKind">,
  config: Pick<TargetingConfig, "aimAssistSlowdown">,
): number {
  if (
    (aim.targetKind !== TARGET_KINDS.hoop &&
      aim.targetKind !== TARGET_KINDS.shootingTarget) ||
    aim.lock <= 0
  ) {
    return 0;
  }

  return THREE.MathUtils.clamp(aim.lock * config.aimAssistSlowdown, 0, 1);
}

/**
 * Resolves throw-direction correction strengths based on the active input device.
 * Gamepad receives full configured assist; keyboard/mouse is scaled by aimAssistMouseScale.
 */
export function resolveAssistStrengths(
  device: ActiveDevice,
  config: Pick<
    TargetingConfig,
    "aimAssistStrength" | "aimAssistPitchStrength" | "aimAssistMouseScale"
  >,
): AssistStrengths {
  if (device === "gamepad") {
    return {
      yaw: config.aimAssistStrength,
      pitch: config.aimAssistPitchStrength,
    };
  }

  const scale = config.aimAssistMouseScale;
  return {
    yaw: config.aimAssistStrength * scale,
    pitch: config.aimAssistPitchStrength * scale,
  };
}
