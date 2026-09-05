import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { Group, Vector3 } from "three";
import { useEquipment } from "@/gameplay/EquipmentContext";
import { GUNS } from "@/gameplay/equipment";
import { BALL_COLLISION_GROUPS } from "@/constants/physics";
import { WEAPONS, type WeaponId } from "./weapons";
import { useRangeSession } from "./FiringRangeProvider";
import { targetAt } from "./trials";

function Part({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.65} metalness={0.45} />
    </mesh>
  );
}
function GunModel({ weapon }: { weapon: WeaponId }) {
  const pistol = weapon === "falcon9";
  const rifle = weapon === "dragon";
  const color = WEAPONS[weapon].color;
  return (
    <group>
      <Part
        position={[0, 0, 0]}
        size={[0.09, 0.11, pistol ? 0.26 : rifle ? 0.58 : 0.38]}
        color={color}
      />
      <group rotation={[0.2, 0, 0]}>
        <Part
          position={[0, -0.12, 0.06]}
          size={[0.075, 0.19, 0.095]}
          color="#242b32"
        />
      </group>
      <Part
        position={[0, -0.065, -0.075]}
        size={[0.065, 0.025, 0.16]}
        color="#272d32"
      />
      <Part
        position={[0, 0.065, 0.08]}
        size={[0.045, 0.025, 0.03]}
        color="#131d25"
      />
      <Part
        position={[0, 0.065, pistol ? -0.1 : -0.19]}
        size={[0.016, 0.026, 0.025]}
        color="#92e4d4"
      />
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.015, pistol ? -0.15 : rifle ? -0.37 : -0.23]}
      >
        <cylinderGeometry args={[0.025, 0.028, pistol ? 0.05 : 0.2, 10]} />
        <meshStandardMaterial
          color="#18232c"
          metalness={0.65}
          roughness={0.45}
        />
      </mesh>
      {!pistol && (
        <>
          <Part
            position={[0, -0.12, rifle ? 0.18 : -0.08]}
            size={[0.065, 0.18, 0.1]}
            color="#30383e"
          />
          <Part
            position={[0, -0.015, rifle ? 0.34 : 0.22]}
            size={[0.08, 0.12, 0.16]}
            color={color}
          />
          {[0, 1, 2, 3].map((i) => (
            <Part
              key={i}
              position={[0, 0.057, -0.11 - i * 0.035]}
              size={[0.1, 0.015, 0.012]}
              color="#262c31"
            />
          ))}
        </>
      )}
      {rifle && (
        <mesh position={[0, 0.1, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.19, 10]} />
          <meshStandardMaterial color="#25312c" />
        </mesh>
      )}
      {weapon === "cmp150" && (
        <Part
          position={[0.047, 0.005, -0.04]}
          size={[0.007, 0.035, 0.1]}
          color="#50b7dd"
        />
      )}
    </group>
  );
}
function Gun({
  id,
  weapon,
  spawn,
}: {
  id: number;
  weapon: WeaponId;
  spawn: [number, number, number];
}) {
  const {
    bodyRefs,
    registerBody,
    registerVisual,
    heldEntityRef,
    entityGameData,
    ownedEntityIds,
    grabCandidateRef,
  } = useEquipment();
  const range = useRangeSession();
  const flash = useRef<Group>(null);
  const glow = useRef<Group>(null);
  const hand = useRef<Group>(null);
  useFrame(() => {
    const now = Date.now() / 1000;
    if (hand.current) hand.current.visible = heldEntityRef.current === id;
    const data = entityGameData.current.get(id);
    if (flash.current)
      flash.current.visible =
        typeof data?.lastFire === "number" && now - data.lastFire < 0.065;
    if (glow.current)
      glow.current.visible =
        grabCandidateRef.current === id || data?.mine === true;
    const body = bodyRefs.current[id];
    if (
      !body ||
      !ownedEntityIds.current.has(id) ||
      heldEntityRef.current === id
    )
      return;
    const p = body.translation();
    const position = new Vector3(p.x, p.y, p.z);
    if (data?.mine && typeof data.armedAt === "number" && now >= data.armedAt) {
      const near = [0, 1, 2].some((i) => {
        const t = targetAt(i, range.winner, now);
        return t.visible && t.point.distanceTo(position) < 3;
      });
      if (near || (typeof data.expires === "number" && now >= data.expires)) {
        range.explode(
          position,
          now,
          typeof data.trialId === "string" ? data.trialId : undefined,
          typeof data.mineId === "string" ? data.mineId : undefined,
        );
        entityGameData.current.set(id, {
          ammo: 0,
          reserve: data.reserve ?? WEAPONS[weapon].reserve,
        });
        body.setTranslation(new Vector3(...spawn), true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    if (p.y < -4) {
      body.setTranslation(new Vector3(...spawn), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  });
  return (
    <RigidBody
      ref={(body) => {
        registerBody(id, body);
      }}
      position={spawn}
      colliders={false}
      ccd
      restitution={0.1}
      friction={1}
    >
      <CuboidCollider
        args={[0.06, 0.1, weapon === "falcon9" ? 0.16 : 0.37]}
        mass={0.8}
        collisionGroups={BALL_COLLISION_GROUPS}
      />
      <group
        ref={(group) => {
          registerVisual(id, group);
        }}
      >
        <GunModel weapon={weapon} />
        <group ref={hand} visible={false}>
          <Part
            position={[0.012, -0.14, 0.07]}
            size={[0.11, 0.105, 0.12]}
            color="#333f48"
          />
          <Part
            position={[0.04, -0.17, 0.18]}
            size={[0.085, 0.085, 0.18]}
            color="#435b6b"
          />
          <Part
            position={[-0.055, -0.075, 0.03]}
            size={[0.035, 0.035, 0.08]}
            color="#be9174"
          />
        </group>
        <group
          ref={flash}
          visible={false}
          position={[
            0,
            0.015,
            weapon === "dragon" ? -0.49 : weapon === "cmp150" ? -0.34 : -0.2,
          ]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.075, 0.16, 5]} />
            <meshBasicMaterial color="#fff1a0" />
          </mesh>
        </group>
        <group ref={glow} visible={false}>
          <mesh>
            <boxGeometry args={[0.13, 0.25, 0.6]} />
            <meshBasicMaterial
              color="#6ce5e9"
              wireframe
              transparent
              opacity={0.45}
            />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
export function Guns() {
  return (
    <>
      {GUNS.map((g) => (
        <Gun key={g.id} id={g.id} weapon={g.variant!} spawn={g.spawn} />
      ))}
    </>
  );
}
