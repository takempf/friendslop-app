/** Default stick saturation threshold where maximum deflection rate is reached. */
export const STICK_SATURATION = 0.95;

export interface StickShape {
  deadzone: number;
  saturation: number;
  curve: number;
}

/**
 * Scalar response curve: signed, monotonic, fixing f(0)=0 and f(±1)=±1.
 * Exponents above 1 give finer control near center.
 */
export function applyResponseCurve(v: number, exponent: number): number {
  if (v === 0) return 0;
  const sign = Math.sign(v);
  const abs = Math.min(Math.abs(v), 1);
  return sign * Math.pow(abs, exponent);
}

/**
 * Transforms raw 2D analog stick axes into a shaped vector on the unit disc.
 * Applies radial deadzone, saturation rescaling, and response curve to magnitude only,
 * preserving stick direction by construction.
 */
export function shapeStick(
  x: number,
  y: number,
  shape: StickShape,
): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= shape.deadzone || mag === 0) {
    return [0, 0];
  }

  const clampedDz = Math.min(Math.max(shape.deadzone, 0), 0.999);
  const clampedSat = Math.max(shape.saturation, clampedDz + 1e-4);

  // Rescale magnitude from [deadzone, saturation] to [0, 1]
  const normalizedMag = Math.min(
    Math.max((mag - clampedDz) / (clampedSat - clampedDz), 0),
    1,
  );

  const curvedMag = applyResponseCurve(normalizedMag, shape.curve);
  const dirX = x / mag;
  const dirY = y / mag;

  return [dirX * curvedMag, dirY * curvedMag];
}
