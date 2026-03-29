import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { SmoothedPointerLockControls } from "@/components/3d/SmoothedPointerLockControls/SmoothedPointerLockControls";
import {
  RigidBody,
  RapierRigidBody,
  CapsuleCollider,
  useRapier,
  interactionGroups,
  CoefficientCombineRule,
} from "@react-three/rapier";
import * as THREE from "three";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useGameSync } from "@/sync/GameSyncProvider";
import { audioManager } from "@/audio/AudioManager";
import { useBasketball } from "@/contexts/BasketballContext";
import {
  BALL_RADIUS,
  INTERACTION_RANGE,
  THREE_POINT_ARC_RADIUS,
  THREE_POINT_CORNER_X,
  HOOP_RIM_POS,
} from "@/constants/basketball";
import { debugConfig } from "@/debug/config";

// Group layout: 0 = environment, 1 = player, 2 = balls
// Player never interacts with balls (group 2), only environment
const PLAYER_GROUPS = interactionGroups([1], [0]);

const SPEED = 5;
const SPRINT_SPEED = 7.5;
const CROUCH_SPEED = 2.5;
const CROUCH_CAM_HEIGHT = 0.3; // eye level above body center when crouched (vs 0.83 standing)
// Throw params are now driven by debugConfig (see src/debug/config.ts)
const MAX_CHARGE_TIME = 2.5; // seconds to reach full charge

// Jump — gravity is -9.81. v²/2g gives peak height.
// JUMP_VELOCITY=4.4 → ~1.0m peak (full hold). Early release cuts vy → ~0.2m short hop.
const JUMP_VELOCITY = 4.4;
const JUMP_CUT_MULT = 0.35; // vy multiplier on early space release
// Ground ray: capsule halfHeight(0.5) + radius(0.5) + small epsilon
const GROUND_RAY_LEN = 1.07;

const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const _yawEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _holdPos = new THREE.Vector3();

// 12 equidistant spawn points in a circle centered in the gym (0,0,0)
const SPAWN_POINTS: [number, number, number][] = Array.from(
  { length: 12 },
  (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 6;
    return [Math.cos(angle) * radius, 3, Math.sin(angle) * radius];
  },
);

export function PlayerController() {
  const ref = useRef<RapierRigidBody>(null);
  const keys = useKeyboard();
  const {
    remoteBallStates,
    queuePresenceUpdate,
    broadcastReset,
    broadcastSoundEvent,
  } = useGameSync();
  const lastAudioSyncTime = useRef(0);
  const [spawnPoint] = useState(
    () => SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)],
  );

  const { camera } = useThree();

  // Basketball pick-up / throw state
  const { rapier, world } = useRapier();
  const {
    ballRefs,
    heldBallRef,
    ownedBallIds,
    ballOwnerVersions,
    grabCandidateRef,
    buttonCandidateRef,
    ballShotPoints,
    releaseBallFromRack,
  } = useBasketball();
  const prevE = useRef(false);
  const prevQ = useRef(false);
  const qPressTime = useRef(0);
  const throwCharge = useRef(0);
  const lastThrowRef = useRef<{ idx: number; time: number }>({
    idx: -1,
    time: 0,
  });

  // Camera lean (roll when strafing)
  const leanRef = useRef(0);

  // Sprint FOV — base derived from aspect ratio (targets ~90° horizontal FOV)
  const SPRINT_FOV_MULT = 1.15;
  const fovRef = useRef(90);

  // Dribble state
  const dribbleTime = useRef(0);
  const dribbleBlend = useRef(0); // 0 = held still, 1 = dribbling
  const dribbleSide = useRef(1); // -1 = left, 1 = right (smoothly interpolated)
  const holdLift = useRef(0); // 0 = idle (low), 1 = shooting (raised)
  const prevDribbleSin = useRef(0); // sign of sin(dribbleTime) last frame — for floor-contact detection

  // Crouch state (0 = standing, 1 = fully crouched)
  const crouchRef = useRef(0);

  // Jump state
  const prevSpace = useRef(false);

  // Last XZ position where the player was grounded — used to determine shot value (2 vs 3 pts)
  const lastGroundPos = useRef<[number, number]>([0, 0]);

  // DOM refs for throw meter — updated imperatively in useFrame (no re-renders)
  const meterEl = useRef<HTMLDivElement | null>(null);
  const meterFillEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    meterEl.current = document.getElementById("throw-meter") as HTMLDivElement;
    meterFillEl.current = document.getElementById(
      "throw-meter-fill",
    ) as HTMLDivElement;
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;

    // --- Movement ---
    frontVector.set(
      0,
      0,
      (keys.current.KeyS ? 1 : 0) - (keys.current.KeyW ? 1 : 0),
    );
    sideVector.set(
      (keys.current.KeyA ? 1 : 0) - (keys.current.KeyD ? 1 : 0),
      0,
      0,
    );

    // Smooth crouch interpolation
    const crouchTarget = keys.current.KeyC ? 1 : 0;
    crouchRef.current +=
      (crouchTarget - crouchRef.current) * Math.min(delta * 10, 1);

    const isCrouching = keys.current.KeyC;
    const speed = isCrouching
      ? CROUCH_SPEED
      : keys.current.ShiftLeft
        ? SPRINT_SPEED
        : SPEED;
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(speed)
      .applyEuler(
        (_forward.set(0, 0, -1).applyQuaternion(state.camera.quaternion),
        (_forward.y = 0),
        _forward.normalize(),
        (_yawEuler.y = Math.atan2(-_forward.x, -_forward.z)),
        _yawEuler),
      );

    const currentVelocity = ref.current.linvel();
    ref.current.setLinvel(
      { x: direction.x, y: currentVelocity.y, z: direction.z },
      true,
    );

    const pos = ref.current.translation();
    const camHeight =
      CROUCH_CAM_HEIGHT + (0.83 - CROUCH_CAM_HEIGHT) * (1 - crouchRef.current);
    state.camera.position.set(pos.x, pos.y + camHeight, pos.z);

    // --- Camera lean when strafing ---
    const MAX_LEAN = 0.035;
    const strafe = (keys.current.KeyA ? 1 : 0) - (keys.current.KeyD ? 1 : 0);
    const targetLean = strafe * MAX_LEAN;
    leanRef.current += (targetLean - leanRef.current) * Math.min(delta * 6, 1);

    // --- Sprint FOV (wider when sprinting, aspect-ratio-aware base) ---
    const perspCam = state.camera as THREE.PerspectiveCamera;
    const baseFov = 70;
    const targetFov =
      keys.current.ShiftLeft && !keys.current.KeyC
        ? baseFov * SPRINT_FOV_MULT
        : baseFov;
    fovRef.current += (targetFov - fovRef.current) * Math.min(delta * 5, 1);
    perspCam.fov = fovRef.current;
    console.log("current fov", fovRef.current);
    perspCam.updateProjectionMatrix();

    // --- Jump ---
    const spacePressed = keys.current.Space;
    const ray = new rapier.Ray(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(
      ray,
      GROUND_RAY_LEN,
      true,
      undefined,
      PLAYER_GROUPS,
    );
    const isGrounded = !!hit && hit.timeOfImpact <= GROUND_RAY_LEN;

    // Track the last XZ position where the player's feet touched the ground
    if (isGrounded) {
      lastGroundPos.current[0] = pos.x;
      lastGroundPos.current[1] = pos.z;
    }

    if (spacePressed && !prevSpace.current && isGrounded) {
      ref.current.setLinvel(
        { x: currentVelocity.x, y: JUMP_VELOCITY, z: currentVelocity.z },
        true,
      );
    } else if (!spacePressed && prevSpace.current) {
      // Early release — cut upward velocity for a short hop
      const vy = ref.current.linvel().y;
      if (vy > 0) {
        const v = ref.current.linvel();
        ref.current.setLinvel({ x: v.x, y: vy * JUMP_CUT_MULT, z: v.z }, true);
      }
    }
    prevSpace.current = spacePressed;

    // --- Grab candidate — updated every frame so outline renders correctly ---
    if (heldBallRef.current === -1) {
      state.camera.getWorldDirection(_forward);
      const eyeY = pos.y + 0.8;
      let candidateIdx = -1;
      let candidateDist = INTERACTION_RANGE;
      const now = performance.now();
      ballRefs.current.forEach((ballRef, i) => {
        if (!ballRef) return;
        if (
          i === lastThrowRef.current.idx &&
          now - lastThrowRef.current.time < 250
        )
          return;
        const bpos = ballRef.translation();
        const dx = bpos.x - pos.x;
        const dy = bpos.y - eyeY;
        const dz = bpos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < candidateDist) {
          const dot =
            (dx / dist) * _forward.x +
            (dy / dist) * _forward.y +
            (dz / dist) * _forward.z;
          if (dot > 0) {
            candidateDist = dist;
            candidateIdx = i;
          }
        }
      });
      grabCandidateRef.current = candidateIdx;
    } else {
      grabCandidateRef.current = -1;
    }

    // --- Basketball pick-up (E key) ---
    const ePressed = keys.current.KeyE;
    if (ePressed && !prevE.current) {
      if (heldBallRef.current !== -1) {
        // Drop the ball — restore dynamic physics
        const held = ballRefs.current[heldBallRef.current];
        if (held) {
          held.setBodyType(rapier.RigidBodyType.Dynamic, true);
          held.setGravityScale(1, true);
          held.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        heldBallRef.current = -1;
      } else {
        const nearestIdx = grabCandidateRef.current;

        if (nearestIdx !== -1) {
          releaseBallFromRack(nearestIdx);
          heldBallRef.current = nearestIdx;
          ownedBallIds.current.add(nearestIdx);

          const remoteVersion =
            remoteBallStates.current.get(nearestIdx)?.ownerVersion || 0;
          const localVersion = ballOwnerVersions.current.get(nearestIdx) || 0;
          const newVersion = Math.max(remoteVersion, localVersion) + 1;
          ballOwnerVersions.current.set(nearestIdx, newVersion);

          const ball = ballRefs.current[nearestIdx];
          if (ball) {
            // Switch to kinematic so physics doesn't fight our position updates
            ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          }
        } else if (buttonCandidateRef.current) {
          broadcastReset();
        }
      }
    }
    prevE.current = ePressed;

    // --- Throw charge (Q key) ---
    const qPressed = keys.current.KeyQ;
    if (qPressed && !prevQ.current) {
      // Q just pressed — start charging
      qPressTime.current = performance.now();
    }

    if (qPressed) {
      throwCharge.current = Math.min(
        (performance.now() - qPressTime.current) / 1000 / MAX_CHARGE_TIME,
        1,
      );
    }

    if (!qPressed && prevQ.current) {
      // Q just released — throw if holding a ball
      if (heldBallRef.current !== -1) {
        const ball = ballRefs.current[heldBallRef.current];
        if (ball) {
          const { minThrowSpeed, maxThrowSpeed, throwArcDeg, throwSpinMult } =
            debugConfig;
          const speed =
            minThrowSpeed +
            (maxThrowSpeed - minThrowSpeed) * throwCharge.current;
          _forward.set(0, 0, -1).applyEuler(state.camera.rotation);
          _right.set(1, 0, 0).applyEuler(state.camera.rotation);
          const arcRad = (throwArcDeg * Math.PI) / 180;
          const cosA = Math.cos(arcRad),
            sinA = Math.sin(arcRad);
          const upX = _right.y * _forward.z - _right.z * _forward.y;
          const upY = _right.z * _forward.x - _right.x * _forward.z;
          const upZ = _right.x * _forward.y - _right.y * _forward.x;
          ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
          ball.setGravityScale(1, true);
          ball.setLinvel(
            {
              x: (_forward.x * cosA + upX * sinA) * speed,
              y: (_forward.y * cosA + upY * sinA) * speed,
              z: (_forward.z * cosA + upZ * sinA) * speed,
            },
            true,
          );
          ball.setAngvel(
            {
              x: _right.x * speed * throwSpinMult,
              y: _right.y * speed * throwSpinMult,
              z: _right.z * speed * throwSpinMult,
            },
            true,
          );

          // Determine shot value based on where feet last touched the ground
          const [gx, gz] = lastGroundPos.current;
          const dx = gx - HOOP_RIM_POS.x;
          const dz = gz - HOOP_RIM_POS.z;
          const dist2D = Math.sqrt(dx * dx + dz * dz);
          const isThree =
            dist2D >= THREE_POINT_ARC_RADIUS ||
            Math.abs(dx) >= THREE_POINT_CORNER_X;
          ballShotPoints.current.set(heldBallRef.current, isThree ? 3 : 2);
        }
        lastThrowRef.current = {
          idx: heldBallRef.current,
          time: performance.now(),
        };
        heldBallRef.current = -1;
      }
      throwCharge.current = 0;
    }
    prevQ.current = qPressed;

    // --- Update held ball position (hold still or dribble) ---
    if (heldBallRef.current !== -1) {
      const ball = ballRefs.current[heldBallRef.current];
      if (ball) {
        const isMoving =
          Math.abs(direction.x) > 0.1 || Math.abs(direction.z) > 0.1;
        const targetBlend = isMoving && !qPressed ? 1 : 0;
        dribbleBlend.current +=
          (targetBlend - dribbleBlend.current) * Math.min(delta * 8, 1);

        _forward.set(0, 0, -1).applyEuler(state.camera.rotation);
        _right.set(1, 0, 0).applyEuler(state.camera.rotation);

        // Hold position: slightly in front of camera
        _holdPos
          .copy(state.camera.position)
          .addScaledVector(_forward, BALL_RADIUS * 2 + 0.55);
        const holdX = _holdPos.x;
        const targetLift = qPressed ? 1 : 0;
        holdLift.current +=
          (targetLift - holdLift.current) * Math.min(delta * 8, 1);
        const holdY = _holdPos.y - 0.15 - (1 - holdLift.current) * 0.2;
        const holdZ = _holdPos.z;

        // Determine dribble side: any strafing switches sides
        const strafingRight = keys.current.KeyD && !keys.current.KeyA;
        const strafingLeft = keys.current.KeyA && !keys.current.KeyD;
        let targetSide = dribbleSide.current;
        if (strafingRight) targetSide = 1;
        else if (strafingLeft) targetSide = -1;
        dribbleSide.current +=
          (targetSide - dribbleSide.current) * Math.min(delta * 5, 1);

        // Dribble position: to the side (based on dribbleSide), bouncing on the floor
        if (isMoving && !qPressed) dribbleTime.current += delta * Math.PI * 2.2;
        const bounceT = Math.pow(Math.abs(Math.sin(dribbleTime.current)), 0.4);
        const floorY = pos.y - 1 + BALL_RADIUS;
        const hipY = holdY;
        const side = dribbleSide.current;
        const dribbleX =
          state.camera.position.x + _right.x * 0.5 * side + _forward.x * 0.6;
        const dribbleY = floorY + (hipY - floorY) * bounceT;
        const dribbleZ =
          state.camera.position.z + _right.z * 0.5 * side + _forward.z * 0.6;

        // Floor-contact sound: detect when sin(dribbleTime) changes sign — one zero-crossing
        // per floor contact, guaranteed regardless of frame rate (threshold approach was unreliable
        // because the ^0.4 exponent makes the sub-threshold window only ~0.01 rad wide).
        const sinT = Math.sin(dribbleTime.current);
        if (prevDribbleSin.current * sinT < 0 && dribbleBlend.current > 0.25) {
          const impactSpeed = 3.2 + dribbleBlend.current * 1.2;
          const pos: [number, number, number] = [dribbleX, floorY, dribbleZ];
          audioManager.playBounceSound(pos, "floor", impactSpeed);
          broadcastSoundEvent({
            id: (Date.now() * 1000 + Math.random() * 1000) | 0,
            pos,
            surface: "floor",
            speed: impactSpeed,
          });
        }
        prevDribbleSin.current = sinT;

        const b = dribbleBlend.current;
        ball.setNextKinematicTranslation({
          x: holdX + (dribbleX - holdX) * b,
          y: holdY + (dribbleY - holdY) * b,
          z: holdZ + (dribbleZ - holdZ) * b,
        });
      }
    }

    // --- Throw meter UI (imperative DOM, no re-renders) ---
    if (meterEl.current && meterFillEl.current) {
      meterEl.current.style.display = throwCharge.current > 0 ? "flex" : "none";
      if (throwCharge.current > 0) {
        const pct = throwCharge.current * 100;
        meterFillEl.current.style.width = `${pct}%`;
        // hue: 120 (green) → 60 (yellow) → 0 (red) as charge grows
        const hue = Math.round((1 - throwCharge.current) * 120);
        meterFillEl.current.style.background = `hsl(${hue}, 90%, 45%)`;
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
  });

  return (
    <>
      <SmoothedPointerLockControls leanRef={leanRef} />
      <RigidBody
        ref={ref}
        position={spawnPoint}
        colliders={false}
        mass={1}
        type="dynamic"
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          args={[0.5, 0.5]}
          collisionGroups={PLAYER_GROUPS}
          restitution={0}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />
      </RigidBody>
    </>
  );
}
