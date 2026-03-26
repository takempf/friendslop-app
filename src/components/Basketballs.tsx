import * as THREE from "three";
import {
  RigidBody,
  BallCollider,
  interactionGroups,
} from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useBasketball } from "../contexts/BasketballContext";
import { BALL_RADIUS } from "../constants/basketball";

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
  const outlineRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);

  useFrame(() => {
    const candidate = grabCandidateRef.current;
    outlineRefs.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = i === candidate;
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
        >
          <BallCollider args={[BALL_RADIUS]} collisionGroups={BALL_GROUPS} />
          <mesh castShadow>
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
            <meshStandardMaterial map={basketballTexture} roughness={0.7} />
          </mesh>
          <mesh
            ref={(ref) => {
              outlineRefs.current[i] = ref;
            }}
            visible={false}
          >
            <sphereGeometry args={[BALL_RADIUS + 0.02, 32, 32]} />
            <meshBasicMaterial color="white" side={THREE.BackSide} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
