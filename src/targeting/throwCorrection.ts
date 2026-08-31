import * as THREE from "three";

const _toTarget = new THREE.Vector3();
const TWO_PI = Math.PI * 2;

/**
 * Computes an assisted throw launch direction by separately interpolating yaw (lateral)
 * and pitch (vertical) angles toward the target aim point.
 *
 * @param lookDir Player's unassisted look direction (normalized).
 * @param targetPoint World-space aim point of the target, or null if no target.
 * @param cameraPos World-space camera/eye position.
 * @param yawStrength 0..1 lateral correction strength (0 = no correction, 1 = direct to target bearing).
 * @param pitchStrength 0..1 vertical correction strength (0 = keep player pitch, 1 = pitch to target).
 * @param out Vector3 into which the result is written.
 * @returns out Vector3 with the normalized assisted direction.
 */
export function pickAssistedDirection(
  lookDir: THREE.Vector3,
  targetPoint: THREE.Vector3 | null,
  cameraPos: THREE.Vector3,
  yawStrength: number,
  pitchStrength: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (
    !targetPoint ||
    (yawStrength <= 0 && pitchStrength <= 0) ||
    (Number.isNaN(yawStrength) && Number.isNaN(pitchStrength))
  ) {
    return out.copy(lookDir).normalize();
  }

  _toTarget.subVectors(targetPoint, cameraPos);
  if (_toTarget.lengthSq() < 1e-6) {
    return out.copy(lookDir).normalize();
  }
  _toTarget.normalize();

  // Clamp vertical components for asin numerical stability
  const lookPitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -1, 1));
  const targetPitch = Math.asin(THREE.MathUtils.clamp(_toTarget.y, -1, 1));

  const lookYaw = Math.atan2(lookDir.x, -lookDir.z);
  const targetYaw = Math.atan2(_toTarget.x, -_toTarget.z);

  // Shortest angular difference for yaw, wrapped to [-PI, PI]
  const deltaYaw =
    THREE.MathUtils.euclideanModulo(targetYaw - lookYaw + Math.PI, TWO_PI) -
    Math.PI;

  const assistedYaw =
    lookYaw + deltaYaw * THREE.MathUtils.clamp(yawStrength, 0, 1);
  const assistedPitch =
    lookPitch +
    (targetPitch - lookPitch) * THREE.MathUtils.clamp(pitchStrength, 0, 1);

  const cosP = Math.cos(assistedPitch);
  out.set(
    cosP * Math.sin(assistedYaw),
    Math.sin(assistedPitch),
    -cosP * Math.cos(assistedYaw),
  );

  return out.normalize();
}
