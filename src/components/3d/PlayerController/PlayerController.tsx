import { useEquipment } from "@/gameplay/EquipmentContext";
import { EQUIPMENT } from "@/gameplay/equipment";
import type { EquipmentBehaviors } from "@/gameplay/EquipmentBehavior";
import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { SmoothedPointerLockControls } from "@/components/3d/SmoothedPointerLockControls/SmoothedPointerLockControls";
import {
  RigidBody,
  RapierRigidBody,
  CapsuleCollider,
  useRapier,
  CoefficientCombineRule,
} from "@react-three/rapier";
import * as THREE from "three";
import { useInput } from "@/input/useInput";
import { computeMoveDirection } from "@/input/movementMath";
import { useGameSync } from "@/sync/GameSyncProvider";
import { audioManager } from "@/audio/AudioManager";
import {
  PLAYER_COLLISION_GROUPS,
  GROUND_RAY_COLLISION_GROUPS,
  PLAYER_MASS,
} from "@/constants/physics";
import { EquipmentController } from "@/gameplay/EquipmentController";

const SPEED = 5;
const SPRINT_SPEED = 7.5;
const CROUCH_SPEED = 2.5;
const CROUCH_CAM_HEIGHT = 0.3; // eye level above body center when crouched (vs 0.83 standing)

// Jump - gravity is -9.81. v²/2g gives peak height.
// JUMP_VELOCITY=4.4 -> ~1.0m peak (full hold). Early release cuts vy -> ~0.2m short hop.
const JUMP_VELOCITY = 4.4;
const JUMP_CUT_MULT = 0.35; // vy multiplier on early space/button release
// Ground ray: capsule halfHeight(0.5) + radius(0.5) + small epsilon
const GROUND_RAY_LEN = 1.07;

const _forward = new THREE.Vector3();
// 12 equidistant spawn points in a circle centered in the gym (0,0,0)
const SPAWN_POINTS: [number, number, number][] = Array.from(
  { length: 12 },
  (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 6;
    return [Math.cos(angle) * radius, 3, Math.sin(angle) * radius];
  },
);

export function PlayerController({
  behaviors,
  active,
}: {
  behaviors: EquipmentBehaviors;
  active: boolean;
}) {
  const ref = useRef<RapierRigidBody>(null);
  const input = useInput();
  const { heldEntityRef } = useEquipment();
  const { queuePresenceUpdate } = useGameSync();
  const lastAudioSyncTime = useRef(0);
  const [spawnPoint] = useState(
    () => SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)],
  );

  const { camera } = useThree();

  const { rapier, world } = useRapier();

  // Camera lean (roll when strafing)
  const leanRef = useRef(0);

  // Sprint toggle state (for gamepad stick click / toggle)
  const sprintToggleRef = useRef(false);

  // Sprint FOV - base derived from aspect ratio (targets ~90° horizontal FOV)
  const SPRINT_FOV_MULT = 1.15;
  const fovRef = useRef(90);

  // Crouch state (0 = standing, 1 = fully crouched)
  const crouchRef = useRef(0);

  // Last XZ position where the player was grounded - used to determine shot value (2 vs 3 pts)
  const lastGroundPos = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  useFrame((state, delta) => {
    if (!ref.current) return;

    if (!active) {
      const v = ref.current.linvel();
      ref.current.setLinvel({ x: 0, y: v.y, z: 0 }, true);
      return;
    }
    const frame = input.getFrame();
    const isMoving = Math.hypot(frame.moveX, frame.moveY) > 0.1;

    // Smooth crouch interpolation
    const isCrouching = input.pressed("crouch");
    const crouchTarget = isCrouching ? 1 : 0;
    crouchRef.current +=
      (crouchTarget - crouchRef.current) * Math.min(delta * 10, 1);

    // Sprint toggle handling (e.g. left stick click)
    if (input.justPressed("sprint")) {
      if (sprintToggleRef.current) {
        sprintToggleRef.current = false;
      } else if (isMoving) {
        sprintToggleRef.current = true;
      }
    }

    // Reset sprint toggle if player stops moving or crouches
    if (!isMoving || isCrouching) {
      sprintToggleRef.current = false;
    }

    const isSprinting =
      (input.pressed("sprint") || sprintToggleRef.current) &&
      !isCrouching &&
      isMoving;

    const speed = isCrouching
      ? CROUCH_SPEED
      : isSprinting
        ? SPRINT_SPEED
        : SPEED;

    // Camera yaw in horizontal plane
    _forward.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
    _forward.y = 0;
    _forward.normalize();
    const cameraYaw = Math.atan2(-_forward.x, -_forward.z);

    // Compute analog 3D movement velocity
    const moveVel = computeMoveDirection(
      frame.moveX,
      frame.moveY,
      cameraYaw,
      speed,
    );

    const currentVelocity = ref.current.linvel();
    ref.current.setLinvel(
      { x: moveVel.x, y: currentVelocity.y, z: moveVel.z },
      true,
    );

    const pos = ref.current.translation();
    if (pos.y < -8) {
      ref.current.setTranslation({ x: 0, y: 3, z: 0 }, true);
      ref.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const camHeight =
      CROUCH_CAM_HEIGHT + (0.83 - CROUCH_CAM_HEIGHT) * (1 - crouchRef.current);
    state.camera.position.set(pos.x, pos.y + camHeight, pos.z);

    // --- Camera lean when strafing (continuous from analog moveX) ---
    const MAX_LEAN = 0.035;
    const targetLean = -frame.moveX * MAX_LEAN;
    leanRef.current += (targetLean - leanRef.current) * Math.min(delta * 6, 1);

    // --- Sprint FOV (wider when sprinting, aspect-ratio-aware base) ---
    const perspCam = state.camera as THREE.PerspectiveCamera;
    const baseFov = 70;
    const targetFov = isSprinting ? baseFov * SPRINT_FOV_MULT : baseFov;
    fovRef.current += (targetFov - fovRef.current) * Math.min(delta * 5, 1);
    perspCam.fov = fovRef.current;
    perspCam.updateProjectionMatrix();

    // --- Jump ---
    const ray = new rapier.Ray(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(
      ray,
      GROUND_RAY_LEN,
      true,
      undefined,
      GROUND_RAY_COLLISION_GROUPS,
    );
    const isGrounded = Boolean(hit && hit.timeOfImpact <= GROUND_RAY_LEN);

    // Track the last XZ position where the player's feet touched the ground
    if (isGrounded) {
      lastGroundPos.current[0] = pos.x;
      lastGroundPos.current[1] = pos.z;
    }

    if (input.justPressed("jump") && isGrounded) {
      ref.current.setLinvel(
        { x: currentVelocity.x, y: JUMP_VELOCITY, z: currentVelocity.z },
        true,
      );
    } else if (input.justReleased("jump")) {
      // Early release - cut upward velocity for a short hop
      const vy = ref.current.linvel().y;
      if (vy > 0) {
        const v = ref.current.linvel();
        ref.current.setLinvel({ x: v.x, y: vy * JUMP_CUT_MULT, z: v.z }, true);
      }
    }

    // --- Sync & audio ---
    const now = performance.now();
    const p = state.camera.position;
    const r = state.camera.rotation;
    queuePresenceUpdate({
      position: [p.x, p.y, p.z],
      rotation: [r.x, r.y, r.z],
    });

    if (now - lastAudioSyncTime.current > 50) {
      lastAudioSyncTime.current = now;
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(r);
      const up = new THREE.Vector3(0, 1, 0).applyEuler(r);
      audioManager.updateListener(
        [p.x, p.y, p.z],
        [forward.x, forward.y, forward.z],
        [up.x, up.y, up.z],
      );

      if (p.z < -15) {
        audioManager.setRoom("classroom");
      } else {
        audioManager.setRoom("gym");
      }
    }
  }, -0.8);

  return (
    <>
      <EquipmentController
        active={active}
        lastGroundPos={lastGroundPos}
        behaviors={behaviors}
      />
      <SmoothedPointerLockControls
        leanRef={leanRef}
        captureLook={(frame) => {
          const heldId = active ? heldEntityRef.current : -1;
          const kind = EQUIPMENT[heldId]?.kind;
          let captured = false;
          for (const [key, behavior] of Object.entries(behaviors)) {
            captured =
              (behavior.captureLook?.(frame, key === kind ? heldId : -1) ??
                false) ||
              captured;
          }
          return captured;
        }}
      />
      <RigidBody
        ref={ref}
        position={spawnPoint}
        colliders={false}
        mass={PLAYER_MASS}
        type="dynamic"
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          args={[0.5, 0.5]}
          collisionGroups={PLAYER_COLLISION_GROUPS}
          restitution={0}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />
      </RigidBody>
    </>
  );
}
