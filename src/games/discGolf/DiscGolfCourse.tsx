import { useInput } from "@/input/useInput";
import { GoalBeacon } from "./GoalBeacon";
import { teeHeading, teeChevron } from "./wayfinding";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from "@react-three/rapier";
import { WorldSign } from "@/gameplay/WorldSign";
import { useEquipment } from "@/gameplay/EquipmentContext";
import { EQUIPMENT } from "@/gameplay/equipment";
import { aimState } from "@/targeting/aimState";
import { DiscGolfScoreboard } from "./DiscGolfScores";
import { Discs } from "./Discs";
import { HOLES, type Hole } from "./course";

function Tree({
  x,
  z,
  scale = 1,
  variant = 0,
}: {
  x: number;
  z: number;
  scale?: number;
  variant?: number;
}) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1.7, 0.25]} position={[0, 1.7, 0]} />
        <mesh position={[0, 1.7, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.3, 3.4, 6]} />
          <meshLambertMaterial color="#755638" flatShading />
        </mesh>
      </RigidBody>
      {variant % 3 === 0 ? (
        <mesh position={[0, 4, 0]} castShadow>
          <icosahedronGeometry args={[2.2, 1]} />
          <meshLambertMaterial color="#718653" flatShading />
        </mesh>
      ) : (
        [0, 1, 2].map((tier) => (
          <mesh key={tier} position={[0, 2.7 + tier * 1.1, 0]} castShadow>
            <coneGeometry args={[2 - tier * 0.45, 2.8 - tier * 0.3, 7]} />
            <meshLambertMaterial
              color={["#365f46", "#46734c", "#668953"][tier]}
              flatShading
            />
          </mesh>
        ))
      )}
    </group>
  );
}

function Basket({ hole }: { hole: Hole }) {
  return (
    <group position={[hole.basket[0], 0, hole.basket[1]]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.9, 0.035]} position={[0, 0.9, 0]} />
        <CylinderCollider args={[0.025, 0.5]} position={[0, 0.83, 0]} />
        <CylinderCollider args={[0.055, 0.44]} position={[0, 1.94, 0]} />
        <mesh position={[0, 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 1.9, 8]} />
          <meshLambertMaterial color="#b4babc" />
        </mesh>
        <mesh position={[0, 0.83, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.38, 0.06, 16]} />
          <meshLambertMaterial color="#87999b" flatShading />
        </mesh>
        <mesh position={[0, 1.94, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.12, 16]} />
          <meshLambertMaterial color="#f2b641" flatShading />
        </mesh>
      </RigidBody>
      {[0.91, 1.05].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.48, 0.018, 4, 16]} />
          <meshLambertMaterial color="#a7b7b6" />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * Math.PI) / 6;
        return (
          <group key={i}>
            <mesh
              position={[Math.cos(angle) * 0.28, 1.48, Math.sin(angle) * 0.28]}
              rotation={[Math.sin(angle) * -0.2, 0, Math.cos(angle) * 0.2]}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.82, 4]} />
              <meshLambertMaterial color={i % 2 ? "#c7d0c6" : "#8d9b9b"} />
            </mesh>
            <mesh
              position={[Math.cos(angle) * 0.47, 0.94, Math.sin(angle) * 0.47]}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.23, 4]} />
              <meshLambertMaterial color="#a7b7b6" />
            </mesh>
          </group>
        );
      })}
      <group position={[0, 2.3, 0]}>
        <WorldSign
          lines={[String(hole.number).padStart(2, "0")]}
          width={0.55}
          height={0.4}
        />
      </group>
    </group>
  );
}

function Tee({ hole }: { hole: Hole }) {
  const angle = teeHeading(hole);
  const length = Math.round(
    Math.hypot(hole.basket[0] - hole.tee[0], hole.basket[1] - hole.tee[1]),
  );
  return (
    <group position={[hole.tee[0], 0, hole.tee[1]]}>
      <group rotation={[0, angle, 0]}>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.016, 0]}
          receiveShadow
        >
          <planeGeometry args={[1.8, 3.2]} />
          <meshLambertMaterial color="#c0b997" />
        </mesh>
        {[-0.75, 0, 0.75].map((z) => (
          <mesh
            key={z}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.025, z]}
          >
            <shapeGeometry args={[teeChevron]} />
            <meshBasicMaterial color="#344731" />
          </mesh>
        ))}
      </group>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-1.6, 0.75, 0]}>
          <boxGeometry args={[0.12, 1.5, 0.12]} />
          <meshLambertMaterial color="#7a5b3c" />
        </mesh>
      </RigidBody>
      <group position={[-1.6, 1.55, 0.05]}>
        <WorldSign
          lines={[
            `${String(hole.number).padStart(2, "0")} / ${hole.name}`,
            `PAR ${hole.par}    ${length}m`,
            `BASKET ${hole.number} AHEAD`,
          ]}
          width={1.5}
          height={0.9}
        />
      </group>
    </group>
  );
}

// Deterministic scenery: every peer has identical collision geometry.
const TREES = Array.from({ length: 76 }, (_, i) => {
  const x = ((i * 37 + 11) % 89) - 44;
  const z = -42 - ((i * 29 + 7) % 80);
  return { x, z, scale: 0.8 + (i % 5) * 0.13, variant: i };
}).filter((tree) =>
  HOLES.every(
    (h) =>
      Math.hypot(tree.x - h.tee[0], tree.z - h.tee[1]) > 4 &&
      Math.hypot(tree.x - h.basket[0], tree.z - h.basket[1]) > 3,
  ),
);

export function DiscGolfCourse() {
  const input = useInput();
  const { heldEntityRef, grabCandidateRef } = useEquipment();
  const hud = useRef<HTMLElement | null>(null);
  useFrame(({ camera }) => {
    hud.current ??= document.getElementById("disc-golf-hud");
    if (hud.current)
      hud.current.style.display = camera.position.z < -30 ? "block" : "none";
    const hint = document.getElementById("disc-golf-hint");
    if (hint)
      hint.textContent =
        aimState.targetId === "disc-golf:reset"
          ? "E / X · Clear everyone's course scores"
          : EQUIPMENT[heldEntityRef.current]?.kind === "disc"
            ? input.pressed("chargeThrow")
              ? "Mouse / right stick: ← hyzer · → anhyzer · ↑ nose up · ↓ nose down · Release to throw"
              : "Aim first · Hold Q / RT, then move mouse / right stick to tilt · Release to throw"
            : EQUIPMENT[grabCandidateRef.current]?.kind === "disc"
              ? "E / X · Pick up disc"
              : "Play holes 1–6 in order · Walk freely · Retrieve your disc after each throw";
  });
  return (
    <group>
      <RigidBody
        type="fixed"
        colliders={false}
        friction={1.5}
        restitution={0.02}
      >
        <CuboidCollider args={[46, 0.3, 48]} position={[0, -0.3, -78]} />
        <mesh position={[0, -0.3, -78]} receiveShadow>
          <boxGeometry args={[92, 0.6, 96]} />
          <meshLambertMaterial color="#829358" flatShading />
        </mesh>
        {/* Low timber perimeter keeps discs and players on the course. */}
        {[
          [-46, -78, 0.3, 96],
          [46, -78, 0.3, 96],
          [0, -126, 92, 0.3],
          [-24, -30, 44, 0.3],
          [24, -30, 44, 0.3],
        ].map(([x, z, w, d], i) => (
          <group key={i}>
            <CuboidCollider
              args={[w / 2, 0.65, d / 2]}
              position={[x, 0.65, z]}
            />
            <mesh position={[x, 0.65, z]}>
              <boxGeometry args={[w, 1.3, d]} />
              <meshLambertMaterial color="#5a6342" />
            </mesh>
          </group>
        ))}
      </RigidBody>
      {/* Broad, irregular grass patches evoke vertex-colored cartridge landscapes. */}
      {Array.from({ length: 28 }, (_, i) => (
        <mesh
          key={i}
          position={[((i * 17) % 82) - 41, 0.004, -39 - ((i * 23) % 80)]}
          rotation={[-Math.PI / 2, 0, i * 0.7]}
        >
          <circleGeometry args={[3 + (i % 4), 7]} />
          <meshLambertMaterial color={i % 2 ? "#899b5e" : "#788c50"} />
        </mesh>
      ))}
      <mesh position={[0, 0.009, -34]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, 8]} />
        <meshLambertMaterial color="#b7aa7c" />
      </mesh>
      {TREES.map((tree, i) => (
        <Tree key={i} {...tree} />
      ))}
      {HOLES.map((hole) => (
        <group key={hole.number}>
          <Tee hole={hole} />
          <Basket hole={hole} />
        </group>
      ))}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-2.5, 0.55, -34.35]}>
          <boxGeometry args={[3.1, 0.15, 1.65]} />
          <meshLambertMaterial color="#8c6d49" />
        </mesh>
      </RigidBody>
      {/* Face west toward the entrance path, with clearance from the school wall. */}
      <group position={[3.9, 2, -33]} rotation={[0, -Math.PI / 2, 0]}>
        <WorldSign
          lines={[
            "WELCOME TO PINE SIX",
            "6 HOLES / WOODLAND DISC GOLF",
            "1. Pick up a disc at the bench",
            "2. Start at the numbered tee",
            "3. Hold throw, then release",
            "4. Retrieve it; aim for the basket",
            "Play your own lies. Keep it friendly.",
            "Follow tees 1–6 back to the lodge.",
          ]}
          width={3.6}
          height={2.6}
        />
      </group>
      <GoalBeacon />
      <DiscGolfScoreboard />
      <Discs />
    </group>
  );
}
