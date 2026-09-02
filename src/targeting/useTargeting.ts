import { useEffect, useRef, useMemo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { targetingSystem } from "./TargetingSystem";
import { BasketballProvider } from "./providers/basketballProvider";
import { ResetButtonProvider } from "./providers/resetButtonProvider";
import { HoopProvider } from "./providers/hoopProvider";
import { reticleCircleElement } from "@/components/HUD/Reticle/reticleCircleElement";
import { useBasketball } from "@/contexts/BasketballContext";
import { gameConfig } from "@/config";
import { aimCursor } from "@/input/aimCursor";
import { GROUND_RAY_COLLISION_GROUPS } from "@/constants/physics";
import { TARGET_KINDS, type TargetingContext } from "./types";
import type { OcclusionPredicate } from "./occlusion";

const _rayDir = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();

/** Ignore hits this close to either endpoint — the target's own collider, mostly. */
const OCCLUSION_EPSILON = 0.05;

export function useTargeting(): void {
  const { camera, size } = useThree();
  const { rapier, world } = useRapier();
  const {
    ballRefs,
    heldBallRef,
    grabCandidateRef,
    buttonCandidateRef,
    lastThrowRef,
  } = useBasketball();

  const basketballProvider = useMemo(
    () => new BasketballProvider({ ballRefs, lastThrowRef }),
    [ballRefs, lastThrowRef],
  );
  const resetButtonProvider = useMemo(() => new ResetButtonProvider(), []);
  const hoopProvider = useMemo(() => new HoopProvider(), []);

  useEffect(() => {
    const unregister = [
      targetingSystem.registerProvider(basketballProvider),
      targetingSystem.registerProvider(resetButtonProvider),
      targetingSystem.registerProvider(hoopProvider),
    ];
    return () => unregister.forEach((fn) => fn());
  }, [basketballProvider, resetButtonProvider, hoopProvider]);

  // One Ray reused across every occlusion test; its origin/dir are plain mutable vectors.
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  const isOccluded: OcclusionPredicate = useCallback(
    (from: THREE.Vector3, to: THREE.Vector3): boolean => {
      _rayDir.subVectors(to, from);
      const dist = _rayDir.length();
      if (dist < OCCLUSION_EPSILON) return false;
      _rayDir.divideScalar(dist);

      const ray = (rayRef.current ??= new rapier.Ray(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ));
      ray.origin.x = from.x;
      ray.origin.y = from.y;
      ray.origin.z = from.z;
      ray.dir.x = _rayDir.x;
      ray.dir.y = _rayDir.y;
      ray.dir.z = _rayDir.z;

      const hit = world.castRay(
        ray,
        dist,
        true,
        undefined,
        GROUND_RAY_COLLISION_GROUPS,
      );

      return Boolean(hit && hit.timeOfImpact < dist - OCCLUSION_EPSILON);
    },
    [rapier, world],
  );

  const ctxRef = useRef<TargetingContext>({
    camera,
    aspect: 1,
    isHoldingBall: false,
    cameraPosition: _cameraPos,
    isManualAiming: false,
    manualAimX: 0,
    manualAimY: 0,
  });

  useFrame((_, delta) => {
    camera.getWorldPosition(_cameraPos);

    const ctx = ctxRef.current;
    ctx.camera = camera;
    ctx.aspect = size.width / (size.height || 1);
    ctx.isHoldingBall = heldBallRef.current !== -1;
    // The cursor is advanced by the input layer at priority -1, above.
    ctx.isManualAiming = aimCursor.active;
    ctx.manualAimX = aimCursor.x;
    ctx.manualAimY = aimCursor.y;

    const state = targetingSystem.update(ctx, gameConfig, delta, isOccluded);

    // Publish the pick to the outline/interaction refs the basketball scene reads.
    grabCandidateRef.current =
      state.targetKind === TARGET_KINDS.basketball ? state.targetIndex : -1;
    buttonCandidateRef.current = state.targetKind === TARGET_KINDS.resetButton;

    // Move the HUD circle in the same tick as the 3D camera, so it never trails it.
    const circleEl = reticleCircleElement.current;
    if (circleEl) {
      const height = size.height || window.innerHeight;
      const px = state.screenX * height;
      const py = -state.screenY * height;
      const scale = state.isManualAiming ? 1.1 : 1 - 0.1 * state.lock;
      circleEl.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${scale})`;
      circleEl.style.opacity = state.isManualAiming
        ? "1"
        : `${0.6 + 0.4 * state.lock}`;
    }
  });
}
