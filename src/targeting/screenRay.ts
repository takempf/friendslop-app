import * as THREE from "three";

/**
 * Turns a reticle position into a world-space direction from the camera.
 *
 * `screenX`/`screenY` are in units of viewport height (the units `aimState`
 * uses), with the origin at screen centre; NDC is height-normalised on Y and
 * width-normalised on X, so only X needs the aspect divide.
 */
export function screenToWorldDirection(
  camera: THREE.Camera,
  screenX: number,
  screenY: number,
  aspect: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out
    .set((screenX * 2) / aspect, screenY * 2, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize();
}
