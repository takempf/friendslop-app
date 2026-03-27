import * as THREE from "three";
import {
  RigidBody,
  BallCollider,
  interactionGroups,
} from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useBasketball } from "@/contexts/BasketballContext";
import { useGameSync } from "@/sync/GameSyncProvider";
import {
  BALL_RADIUS,
  RIM_Y,
  RIM_RADIUS,
  HOOP_RIM_POS,
  BOARD_FRONT_FACE_Z,
} from "@/constants/basketball";
import {
  sharedOutlineMat,
  sharedStrokeMat,
  updateOutlineResolution,
} from "@/utils/outlineMaterial";
import { audioManager } from "@/audio/AudioManager";

type BounceSurface = "floor" | "wall" | "backboard" | "rim";

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

  return "wall";
}

// Group layout:  0 = environment, 1 = player, 2 = balls
// Balls never interact with the player (group 1), only environment & each other
const BALL_GROUPS = interactionGroups([2], [0, 2]);

function createBasketballTexture(): THREE.CanvasTexture {
  const W = 512,
    H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Orange base
  ctx.fillStyle = "#e85d04";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#1a0800";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  const amp = H * 0.22; // ±22% vertical swing

  // Two sinusoidal horizontal seams (the "equatorial" great-circle pair)
  for (const phase of [0, Math.PI]) {
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const y = H / 2 + amp * Math.sin((x / W) * Math.PI * 2 + phase);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Two sinusoidal vertical seams (the perpendicular great-circle pair)
  // centered at u=0.25 and u=0.75, with slight horizontal curvature
  const ampU = W * 0.03;
  for (const uCenter of [W * 0.25, W * 0.75]) {
    ctx.beginPath();
    for (let y = 0; y <= H; y++) {
      const x = uCenter + ampU * Math.sin((y / H) * Math.PI * 2);
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

// Created once at module load — shared by all ball instances
const basketballTexture = createBasketballTexture();

const INITIAL_POSITIONS: [number, number, number][] = [
  [2, 0.6, 2],
  [-2, 0.6, 3],
  [1, 0.6, 5],
  [-3, 0.6, 1],
];

export function Basketballs() {
  const { ballRefs, grabCandidateRef } = useBasketball();
  const { broadcastSoundEvent } = useGameSync();
  const outlineRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  const strokeRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);

  // Velocity sampled at end of each frame — used as pre-collision speed estimate
  const prevVelocities = useRef(
    INITIAL_POSITIONS.map(() => ({ x: 0, y: 0, z: 0 })),
  );
  // Per-ball cooldown timestamp (ms) to suppress rapid-fire sounds from sustained contact
  const lastBounceMs = useRef(INITIAL_POSITIONS.map(() => 0));

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

    // Snapshot velocity after physics step — available as pre-collision speed next frame
    ballRefs.current.forEach((ballRef, i) => {
      if (ballRef) {
        const v = ballRef.linvel();
        prevVelocities.current[i] = { x: v.x, y: v.y, z: v.z };
      }
    });
  });

  return (
    <>
      {INITIAL_POSITIONS.map((pos, i) => (
        <RigidBody
          key={i}
          ref={(ref: RapierRigidBody | null) => {
            ballRefs.current[i] = ref;
          }}
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
            const pos: [number, number, number] = [p.x, p.y, p.z];
            audioManager.playBounceSound(pos, surface, impactSpeed);
            broadcastSoundEvent({
              id: (Date.now() * 1000 + Math.random() * 1000) | 0,
              pos,
              surface,
              speed: impactSpeed,
            });
          }}
        >
          <BallCollider args={[BALL_RADIUS]} collisionGroups={BALL_GROUPS} />
          <mesh castShadow>
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
            <meshStandardMaterial map={basketballTexture} roughness={0.7} />
          </mesh>
          <mesh
            ref={(ref) => {
              strokeRefs.current[i] = ref;
            }}
            visible={false}
            renderOrder={1}
            material={sharedStrokeMat}
          >
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          </mesh>
          <mesh
            ref={(ref) => {
              outlineRefs.current[i] = ref;
            }}
            visible={false}
            renderOrder={2}
            material={sharedOutlineMat}
          >
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
