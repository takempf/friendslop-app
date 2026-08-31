import type * as THREE from "three";

/**
 * Predicate to test line-of-sight between two world points.
 * Returns true if the path from `from` to `to` is blocked by static geometry.
 */
export type OcclusionPredicate = (
  from: THREE.Vector3,
  to: THREE.Vector3,
) => boolean;
