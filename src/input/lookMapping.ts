import { NO_AIM_MODULATION, type AimModulation } from "./aimModulation";

/** Vertical pitch rate ratio relative to horizontal yaw (feel invariant). */
export const PITCH_RATE_RATIO = 0.7;

export interface LookMappingConfig {
  sensitivity: number;
  invertY: boolean;
}

/**
 * Maps shaped stick axes, ramp scale, and aim modulation to yaw/pitch angular rates in rad/s.
 */
export function mapLookRates(
  shapedX: number,
  shapedY: number,
  ramp: number,
  config: LookMappingConfig,
  modulation: AimModulation = NO_AIM_MODULATION,
): [number, number] {
  const slowdownMult = Math.max(0, 1 - modulation.slowdown);
  const yawRate = shapedX * config.sensitivity * ramp * slowdownMult;
  let pitchRate =
    shapedY * config.sensitivity * PITCH_RATE_RATIO * ramp * slowdownMult;

  if (config.invertY) {
    pitchRate = -pitchRate;
  }

  return [yawRate, pitchRate];
}
