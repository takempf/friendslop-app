import {
  DISC_MASS,
  DISC_ANGULAR_DAMPING,
  discAcceleration,
  discAngularVelocity,
} from "./flight";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
} from "@react-three/rapier";
import { LatheGeometry, Vector2, Mesh, MeshLambertMaterial } from "three";
import { useEquipment } from "@/gameplay/EquipmentContext";
import { DISCS } from "@/gameplay/equipment";
import { useGameSync } from "@/sync/GameSyncProvider";
import { BALL_COLLISION_GROUPS } from "@/constants/physics";
import { caughtBasket, COURSE_BOUNDS, HOLES } from "./course";
import { completeHole, readDiscShot } from "./scoring";

// A rounded flight plate and rolled rim: 48 radial segments, ~1,150 triangles.
// One shared geometry for all discs; collision stays a inexpensive cylinder.
const discGeometry = new LatheGeometry(
  [
    new Vector2(0, -0.017),
    new Vector2(0.15, -0.017),
    new Vector2(0.192, -0.024),
    new Vector2(0.207, -0.031),
    new Vector2(0.22, -0.026),
    new Vector2(0.229, -0.014),
    new Vector2(0.23, 0),
    new Vector2(0.222, 0.015),
    new Vector2(0.203, 0.025),
    new Vector2(0.17, 0.031),
    new Vector2(0.1, 0.035),
    new Vector2(0, 0.035),
  ],
  48,
);

const COLORS = [
  "#efab38",
  "#45bfc2",
  "#e86a57",
  "#bab8f2",
  "#b7d34c",
  "#f1d5a4",
  "#eb80b3",
  "#619bdd",
];
export function Discs() {
  const {
    bodyRefs,
    visualRefs,
    heldEntityRef,
    ownedEntityIds,
    grabCandidateRef,
    entityGameData,
  } = useEquipment();
  const { sync } = useGameSync();
  const previous = useRef(new Map<number, [number, number, number]>());
  const meshes = useRef(new Map<number, Mesh>());
  useFrame(() => {
    meshes.current.forEach((mesh, id) => {
      (mesh.material as MeshLambertMaterial).emissive.set(
        grabCandidateRef.current === id ? "#74672c" : "#000000",
      );
    });
  });
  useBeforePhysicsStep((world) => {
    for (const disc of DISCS) {
      const body = bodyRefs.current[disc.id];
      if (
        !body ||
        !ownedEntityIds.current.has(disc.id) ||
        heldEntityRef.current === disc.id
      ) {
        previous.current.delete(disc.id);
        continue;
      }
      const p = body.translation();
      previous.current.set(disc.id, [p.x, p.y, p.z]);
      if (body.isSleeping()) continue;
      // Grass dissipates rim rolling; airborne spin decays much more slowly.
      body.setAngularDamping(p.y <= 0.26 ? 2.8 : DISC_ANGULAR_DAMPING);
      body.setLinearDamping(p.y <= 0.26 ? 1.4 : 0.12);
      const v = body.linvel();
      // Arcade aerodynamics: forward speed creates bounded lift; drag and
      // a slight late-flight fade produce a readable, controllable disc arc.
      if (p.y > 0.26) {
        body.setAngvel(
          discAngularVelocity(v, body.rotation(), body.angvel()),
          true,
        );
        const acceleration = discAcceleration(
          v,
          body.rotation(),
          body.angvel(),
        );
        body.applyImpulse(
          {
            x: acceleration.x * DISC_MASS * world.timestep,
            y: acceleration.y * DISC_MASS * world.timestep,
            z: acceleration.z * DISC_MASS * world.timestep,
          },
          true,
        );
        for (const hole of HOLES) {
          if (
            p.y > 1.05 &&
            p.y < 1.9 &&
            Math.hypot(p.x - hole.basket[0], p.z - hole.basket[1]) < 0.44
          ) {
            const damping = Math.exp(-18 * world.timestep);
            body.setLinvel(
              { x: v.x * damping, y: Math.min(v.y, -0.6), z: v.z * damping },
              true,
            );
          }
        }
      }
      if (
        p.y < -2 ||
        p.x < COURSE_BOUNDS.minX - 3 ||
        p.x > COURSE_BOUNDS.maxX + 3 ||
        p.z < COURSE_BOUNDS.minZ - 3 ||
        p.z > -29
      ) {
        // Recover to the current hole's tee, without silently adding penalties.
        const shot = readDiscShot(entityGameData.current.get(disc.id));
        const tee = HOLES[shot?.hole ?? 0].tee;
        body.setTranslation({ x: tee[0], y: 0.2, z: tee[1] }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        previous.current.delete(disc.id);
      }
    }
  });
  useAfterPhysicsStep(() => {
    if (!sync) return;
    for (const disc of DISCS) {
      const body = bodyRefs.current[disc.id];
      const prev = previous.current.get(disc.id);
      const shot = readDiscShot(entityGameData.current.get(disc.id));
      if (
        !body ||
        !prev ||
        !shot ||
        !ownedEntityIds.current.has(disc.id) ||
        heldEntityRef.current === disc.id
      )
        continue;
      const p = body.translation();
      const hole = HOLES[shot.hole];
      if (
        hole &&
        caughtBasket(prev, [p.x, p.y, p.z], hole) &&
        completeHole(sync.world, shot, shot.hole)
      ) {
        entityGameData.current.delete(disc.id);
        body.setTranslation(
          { x: hole.basket[0] + 0.15, y: 0.89, z: hole.basket[1] },
          true,
        );
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  });
  return (
    <>
      {DISCS.map((disc, i) => (
        <RigidBody
          key={disc.id}
          ref={(body) => {
            bodyRefs.current[disc.id] = body;
          }}
          position={disc.spawn}
          colliders={false}
          type="dynamic"
          ccd
          friction={1.5}
          restitution={0.08}
          linearDamping={0.12}
          angularDamping={DISC_ANGULAR_DAMPING}
        >
          <CylinderCollider
            args={[0.035, 0.22]}
            mass={DISC_MASS}
            collisionGroups={BALL_COLLISION_GROUPS}
          />
          <group
            ref={(group) => {
              visualRefs.current[disc.id] = group;
            }}
          >
            <mesh
              ref={(mesh) => {
                if (mesh) meshes.current.set(disc.id, mesh);
                else meshes.current.delete(disc.id);
              }}
              geometry={discGeometry}
              castShadow
              receiveShadow
            >
              <meshLambertMaterial color={COLORS[i]} />
            </mesh>
            <mesh position={[0, 0.036, 0]}>
              <cylinderGeometry args={[0.085, 0.085, 0.002, 48]} />
              <meshLambertMaterial color="#f8edd4" />
            </mesh>
            {/* Asymmetric stamp makes the wrist motion and spin legible. */}
            <mesh position={[0.105, 0.036, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.11, 0.025]} />
              <meshLambertMaterial color="#f8edd4" />
            </mesh>
          </group>
        </RigidBody>
      ))}
    </>
  );
}
