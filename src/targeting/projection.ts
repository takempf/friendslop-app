import * as THREE from "three";
import type { ProjectedScreenPoint } from "./types";

const _scratchVec = new THREE.Vector3();

/**
 * Projects a world-space point to height-relative normalized screen coordinates.
 * (0, 0) is screen center, y = ±0.5 is top/bottom edge, x is scaled by aspect ratio.
 *
 * Sets out.behind = true if the point lies on or behind the camera's eye plane.
 */
export function worldToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  aspect: number,
  out: ProjectedScreenPoint,
): void {
  // Transform to camera/view space to check if point is in front of camera
  _scratchVec.copy(point).applyMatrix4(camera.matrixWorldInverse);

  // In Three.js camera space (looking down -Z): z >= 0 means behind or on camera plane
  const behind = _scratchVec.z >= 0;

  // Project to NDC by applying projection matrix (divides by -z/w)
  _scratchVec.applyMatrix4(camera.projectionMatrix);

  out.behind = behind;
  out.x = _scratchVec.x * 0.5 * aspect;
  out.y = _scratchVec.y * 0.5;
}
