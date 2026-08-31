/**
 * Euclidean distance from screen center (0, 0) in height-relative units.
 */
export function screenDistance(x: number, y: number): number {
  return Math.hypot(x, y);
}
