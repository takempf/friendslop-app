export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Computes world-space 3D horizontal movement velocity given analog input,
 * camera yaw angle, and player speed.
 *
 * Preserves analog stick deflection for magnitudes <= 1 and clamps diagonals > 1
 * so that keyboard diagonal sprint does not exceed maximum speed.
 */
export function computeMoveDirection(
  moveX: number,
  moveY: number,
  cameraYaw: number,
  speed: number,
): Vector3D {
  const mag = Math.hypot(moveX, moveY);
  if (mag === 0 || speed === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  // Normalize only if length > 1, preserving analog magnitude below 1
  const scale = mag > 1 ? 1 / mag : 1;
  const localX = moveX * scale;
  const localZ = moveY * scale;

  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);

  // Rotate local horizontal vector around Y axis by cameraYaw
  const worldX = (localX * cos + localZ * sin) * speed;
  const worldZ = (-localX * sin + localZ * cos) * speed;

  return {
    x: worldX,
    y: 0,
    z: worldZ,
  };
}
