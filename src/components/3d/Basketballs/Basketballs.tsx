import * as THREE from "three";
import {
  RigidBody,
  BallCollider,
  interactionGroups,
  useRapier,
} from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useBasketball } from "@/contexts/BasketballContext";
import { useGameSync } from "@/sync/GameSyncProvider";
import {
  BALL_RADIUS,
  RIM_Y,
  RIM_RADIUS,
  HOOP_RIM_POS,
  BOARD_FRONT_FACE_Z,
  BALL_COUNT,
  RACK_SLOT_POSITIONS,
} from "@/constants/basketball";
import {
  sharedOutlineMat,
  sharedStrokeMat,
  updateOutlineResolution,
} from "@/utils/outlineMaterial";
import { audioManager } from "@/audio/AudioManager";
import { useGLTF, Clone, Center } from "@react-three/drei";
import basketballModelUrl from "./models/basketball.glb?url";

type BounceSurface = "floor" | "wall" | "backboard" | "rim" | "window";

useGLTF.preload(basketballModelUrl);

/** Infer surface type from ball world position at moment of collision. */
function detectSurface(pos: {
  x: number;
  y: number;
  z: number;
}): BounceSurface {
  // Floor: ball centre is near ground level (floor surface at y=0)
  if (pos.y < BALL_RADIUS + 0.15) return "floor";

  // Rim: ball is near rim height and within striking distance of the torus
  const dxRim = pos.x - HOOP_RIM_POS.x;
  const dzRim = pos.z - HOOP_RIM_POS.z;
  const distRim = Math.sqrt(dxRim * dxRim + dzRim * dzRim);
  if (Math.abs(pos.y - RIM_Y) < 0.3 && distRim < RIM_RADIUS + 0.25)
    return "rim";

  // Backboard: ball is in front of / at the board face within the board's width/height
  if (
    pos.z > BOARD_FRONT_FACE_Z - 0.25 &&
    pos.y > 2.5 &&
    pos.y < 5.0 &&
    Math.abs(pos.x) < 1.2
  )
    return "backboard";

  // Window glass panes: east (x ≈ 9.75) and west (x ≈ -9.75), height 1.5–6.5, |z| < 8
  if (
    Math.abs(Math.abs(pos.x) - 9.75) < 0.4 &&
    pos.y > 1.5 &&
    pos.y < 6.5 &&
    Math.abs(pos.z) < 8
  )
    return "window";

  return "wall";
}

/** Returns true when a ball has left the playable gym area. */
function isOutOfBounds(pos: { x: number; y: number; z: number }): boolean {
  // Fell below the floor (physics glitch or rolled off an edge)
  if (pos.y < -0.8) return true;
  // Went through the north-wall hallway gap (x ∈ [-2, 2], z < -10)
  if (pos.z < -10.5) return true;
  return false;
}

// Group layout:  0 = environment, 1 = player, 2 = balls
// Balls never interact with the player (group 1), only environment & each other
const BALL_GROUPS = interactionGroups([2], [0, 2]);

export function Basketballs() {
  const { rapier } = useRapier();
  const {
    ballRefs,
    grabCandidateRef,
    heldBallRef,
    ballInRack,
    releaseBallFromRack,
    returnBallToRack,
    heldBallVisualPos,
  } = useBasketball();
  const { broadcastSoundEvent } = useGameSync();
  const outlineRefs = useRef<(THREE.Mesh | null)[]>(
    Array(BALL_COUNT).fill(null),
  );
  const strokeRefs = useRef<(THREE.Mesh | null)[]>(
    Array(BALL_COUNT).fill(null),
  );
  // Main ball mesh refs — used to directly override the RigidBody group's
  // Three.js position after Rapier's sync, eliminating the one-step render lag
  // that causes jitter while the ball is held.
  const mainMeshRefs = useRef<(THREE.Object3D | null)[]>(
    Array(BALL_COUNT).fill(null),
  );

  // Velocity sampled at end of each frame — used as pre-collision speed estimate
  const prevVelocities = useRef(
    RACK_SLOT_POSITIONS.map(() => ({ x: 0, y: 0, z: 0 })),
  );
  // Per-ball cooldown timestamp (ms) to suppress rapid-fire sounds from sustained contact
  const lastBounceMs = useRef(RACK_SLOT_POSITIONS.map(() => 0));

  const { scene } = useGLTF(basketballModelUrl);

  const modelScale = useMemo(() => {
    // Clone scene to not mutate the cached scene's matrices when measuring
    const cloned = scene.clone();
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return maxDim > 0 ? (BALL_RADIUS * 2) / maxDim : 1;
  }, [scene]);

  useFrame(({ gl }) => {
    // Keep resolution in sync with the game render target (640p-based) so the
    // screen-space outline stays at a constant pixel width.
    updateOutlineResolution(gl);

    const candidate = grabCandidateRef.current;
    outlineRefs.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = i === candidate;
    });
    strokeRefs.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = i === candidate;
    });

    ballRefs.current.forEach((ballRef, i) => {
      if (!ballRef) return;

      if (ballInRack.current[i]) {
        // --- Rack ball: keep kinematic at slot position ---
        const sp = RACK_SLOT_POSITIONS[i];
        const p = ballRef.translation();
        const dx = p.x - sp[0];
        const dy = p.y - sp[1];
        const dz = p.z - sp[2];
        if (dx * dx + dy * dy + dz * dz > 0.09) {
          // Ball has moved more than 0.3m from its slot — someone grabbed it
          releaseBallFromRack(i);
        } else {
          if (
            ballRef.bodyType() !== rapier.RigidBodyType.KinematicPositionBased
          ) {
            ballRef.setBodyType(
              rapier.RigidBodyType.KinematicPositionBased,
              true,
            );
          }
          ballRef.setNextKinematicTranslation({
            x: sp[0],
            y: sp[1],
            z: sp[2],
          });
        }
      } else {
        // --- In-play ball: check for out-of-bounds and respawn ---
        const p = ballRef.translation();
        if (isOutOfBounds(p) && heldBallRef.current !== i) {
          const sp = RACK_SLOT_POSITIONS[i];
          returnBallToRack(i);
          ballRef.setBodyType(
            rapier.RigidBodyType.KinematicPositionBased,
            true,
          );
          ballRef.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballRef.setAngvel({ x: 0, y: 0, z: 0 }, true);
          ballRef.setNextKinematicTranslation({
            x: sp[0],
            y: sp[1],
            z: sp[2],
          });
        }

        // Snapshot velocity after physics step — available as pre-collision speed next frame
        const v = ballRef.linvel();
        prevVelocities.current[i] = { x: v.x, y: v.y, z: v.z };
      }
    });
  });

  // Priority=1 runs AFTER the default priority=0 useFrame (PlayerController),
  // so heldBallVisualPos is already set for this frame. Directly setting the
  // RigidBody group's Three.js position overrides Rapier's own sync (which
  // happens at negative priority) and gives the held ball a zero-lag visual.
  useFrame(() => {
    const heldIdx = heldBallRef.current;
    if (heldIdx === -1) return;
    const mesh = mainMeshRefs.current[heldIdx];
    if (!mesh?.parent) return;
    const vp = heldBallVisualPos.current;
    mesh.parent.position.set(vp.x, vp.y, vp.z);
  }, 1);

  return (
    <>
      {RACK_SLOT_POSITIONS.map((pos, i) => (
        <RigidBody
          key={i}
          ref={(ref: RapierRigidBody | null) => {
            ballRefs.current[i] = ref;
          }}
          type="kinematicPosition"
          position={pos}
          colliders={false}
          mass={0.62} // NBA spec: 567–623g
          restitution={0.84} // drops 72" → bounces 49–54" (≈0.84)
          friction={0.8} // rubber on hardwood — friction transmits spin forces on contact
          linearDamping={0.07} // translational air drag
          angularDamping={0.4} // spin decays in air; Rapier friction handles spin↔surface interaction
          onCollisionEnter={() => {
            const now = Date.now();
            if (now - lastBounceMs.current[i] < 80) return; // debounce
            lastBounceMs.current[i] = now;

            const pv = prevVelocities.current[i];
            const impactSpeed = Math.sqrt(
              pv.x * pv.x + pv.y * pv.y + pv.z * pv.z,
            );

            const ballRef = ballRefs.current[i];
            if (!ballRef) return;
            const p = ballRef.translation();

            const surface = detectSurface(p);
            const bpos: [number, number, number] = [p.x, p.y, p.z];
            audioManager.playBounceSound(bpos, surface, impactSpeed);
            broadcastSoundEvent({
              id: (Date.now() * 1000 + Math.random() * 1000) | 0,
              pos: bpos,
              surface,
              speed: impactSpeed,
            });
          }}
        >
          <BallCollider args={[BALL_RADIUS]} collisionGroups={BALL_GROUPS} />

          <group
            ref={(r) => {
              mainMeshRefs.current[i] = r;
            }}
          >
            <Center scale={modelScale}>
              <Clone object={scene} castShadow receiveShadow />
            </Center>
          </group>

          <mesh
            ref={(ref) => {
              strokeRefs.current[i] = ref;
            }}
            visible={false}
            renderOrder={1}
            material={sharedStrokeMat}
          >
            <sphereGeometry args={[BALL_RADIUS, 12, 12]} />
          </mesh>
          <mesh
            ref={(ref) => {
              outlineRefs.current[i] = ref;
            }}
            visible={false}
            renderOrder={2}
            material={sharedOutlineMat}
          >
            <sphereGeometry args={[BALL_RADIUS, 12, 12]} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
