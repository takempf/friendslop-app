export interface RampShape {
  /** Rate multiplier the instant the stick leaves center. */
  startScale: number;
  /** Seconds of sustained engaged deflection needed to reach full rate. */
  rampTime: number;
  /** Seconds to fall back to startScale once deflection drops below engagement. */
  decayTime: number;
  /**
   * Shaped (post-curve) deflection magnitude at or above which the ramp charges;
   * below it the ramp decays. Gating on near-full deflection is what makes the ramp
   * reward a committed turn rather than any input at all — without it, holding the
   * stick at 25% for a slow tracking motion would silently accelerate it, and easing
   * off a fast turn to settle onto a target would keep max rate exactly when the
   * player wants minimum.
   */
  engageThreshold: number;
}

export const DEFAULT_RAMP_SHAPE: RampShape = {
  startScale: 0.6,
  rampTime: 0.2,
  decayTime: 0.1,
  engageThreshold: 0.85,
};

/**
 * Advances ramp progress in [0, 1].
 * Pure function where caller owns progress state.
 *
 * @param deflection Shaped stick magnitude, on the same post-curve scale as `engageThreshold`.
 */
export function advanceRamp(
  progress: number,
  deflection: number,
  dt: number,
  shape: RampShape = DEFAULT_RAMP_SHAPE,
): number {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  if (dt <= 0) return clampedProgress;

  if (deflection >= shape.engageThreshold) {
    const rate = 1 / Math.max(shape.rampTime, 1e-4);
    return Math.min(1, clampedProgress + rate * dt);
  }

  const decayRate = 1 / Math.max(shape.decayTime, 1e-4);
  return Math.max(0, clampedProgress - decayRate * dt);
}

/**
 * Maps ramp progress [0, 1] to a rate multiplier in [startScale, 1.0].
 */
export function rampScale(
  progress: number,
  shape: RampShape = DEFAULT_RAMP_SHAPE,
): number {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return shape.startScale + (1 - shape.startScale) * clampedProgress;
}
