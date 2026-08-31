export function applyRadialDeadzone(
  x: number,
  y: number,
  dz: number,
): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) {
    return [0, 0];
  }
  const clampedDz = Math.min(Math.max(dz, 0), 0.999);
  const rescaledMag = Math.min((mag - clampedDz) / (1 - clampedDz), 1);
  return [(x / mag) * rescaledMag, (y / mag) * rescaledMag];
}

export function applyResponseCurve(v: number, exponent: number): number {
  if (v === 0) return 0;
  const sign = Math.sign(v);
  const abs = Math.min(Math.abs(v), 1);
  return sign * Math.pow(abs, exponent);
}
