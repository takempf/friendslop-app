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
import { useBasketball } from "@/contexts/BasketballContext";
import {
  BALL_RADIUS,
  BALL_GATHER_ROTATION,
  INTERACTION_RANGE,
  THREE_POINT_ARC_RADIUS,
  THREE_POINT_CORNER_X,
  HOOP_RIM_POS,
} from "@/constants/basketball";
import {
  PLAYER_COLLISION_GROUPS,
  BALL_COLLISION_GROUPS,
  HELD_BALL_COLLISION_GROUPS,
  GROUND_RAY_COLLISION_GROUPS,
  PLAYER_MASS,
} from "@/constants/physics";
import { gameConfig } from "@/config";

const SPEED = 5;
const SPRINT_SPEED = 7.5;
const CROUCH_SPEED = 2.5;
const CROUCH_CAM_HEIGHT = 0.3; // eye level above body center when crouched (vs 0.83 standing)
const MAX_CHARGE_TIME = 2.5; // seconds to reach full charge
const GATHER_DURATION = 0.1; // seconds to complete gather rotation (100ms)

// Jump - gravity is -9.81. v²/2g gives peak height.
// JUMP_VELOCITY=4.4 -> ~1.0m peak (full hold). Early release cuts vy -> ~0.2m short hop.
const JUMP_VELOCITY = 4.4;
const JUMP_CUT_MULT = 0.35; // vy multiplier on early space/button release
// Ground ray: capsule halfHeight(0.5) + radius(0.5) + small epsilon
const GROUND_RAY_LEN = 1.07;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _holdPos = new THREE.Vector3();
const _LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);
const _gatherQuat = new THREE.Quaternion();
const _heldBallRot = new THREE.Quaternion();
const _ballGrabQuat = new THREE.Quaternion();

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
  const input = useInput();
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
    mainMeshRefs,
    heldBallRef,
    ownedBallIds,
    ballOwnerVersions,
    grabCandidateRef,
    buttonCandidateRef,
    ballShotPoints,
    releaseBallFromRack,
  } = useBasketball();

  const qPressTime = useRef(0);
  const throwCharge = useRef(0);
  const heldBallRelativeQuat = useRef(new THREE.Quaternion());
  const lastThrowRef = useRef<{ idx: number; time: number }>({
    idx: -1,
    time: 0,
  });

  // Camera lean (roll when strafing)
  const leanRef = useRef(0);

  // Sprint toggle state (for gamepad stick click / toggle)
  const sprintToggleRef = useRef(false);

  // Sprint FOV - base derived from aspect ratio (targets ~90° horizontal FOV)
  const SPRINT_FOV_MULT = 1.15;
  const fovRef = useRef(90);

  // Dribble state
  const dribbleTime = useRef(0);
  const dribbleBlend = useRef(0); // 0 = held still, 1 = dribbling
  const dribbleSide = useRef(1); // -1 = left, 1 = right (smoothly interpolated)
  const holdLift = useRef(0); // 0 = idle (low), 1 = shooting (raised)
  const prevDribbleSin = useRef(0); // sign of sin(dribbleTime) last frame - for floor-contact detection

  // Crouch state (0 = standing, 1 = fully crouched)
  const crouchRef = useRef(0);

  // Last XZ position where the player was grounded - used to determine shot value (2 vs 3 pts)
  const lastGroundPos = useRef<[number, number]>([0, 0]);

  // DOM refs for throw meter - updated imperatively in useFrame (no re-renders)
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

    // --- Grab candidate - updated every frame so outline renders correctly ---
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

    // --- Basketball pick-up / drop / reset button (interact action) ---
    if (input.justPressed("interact")) {
      if (heldBallRef.current !== -1) {
        // Drop the ball - restore dynamic physics and ball collision groups
        const held = ballRefs.current[heldBallRef.current];
        if (held) {
          held.setBodyType(rapier.RigidBodyType.Dynamic, true);
          held.setGravityScale(1, true);
          held.setLinvel({ x: 0, y: 0, z: 0 }, true);
          held.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
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
            // Switch to kinematic and filter collisions against holder
            ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
            ball.collider(0)?.setCollisionGroups(HELD_BALL_COLLISION_GROUPS);
            const rot = ball.rotation();
            _ballGrabQuat.set(rot.x, rot.y, rot.z, rot.w);
            heldBallRelativeQuat.current
              .copy(state.camera.quaternion)
              .invert()
              .multiply(_ballGrabQuat);
          }
        } else if (buttonCandidateRef.current) {
          broadcastReset();
        }
      }
    }

    // --- Throw charge (chargeThrow action) ---
    const isHoldingBall = heldBallRef.current !== -1;
    const isCharging = input.pressed("chargeThrow") && isHoldingBall;

    if (input.justPressed("chargeThrow") && isHoldingBall) {
      qPressTime.current = performance.now();
    }

    if (isCharging) {
      throwCharge.current = Math.min(
        (performance.now() - qPressTime.current) / 1000 / MAX_CHARGE_TIME,
        1,
      );
    }

    if (input.justReleased("chargeThrow") && isHoldingBall) {
      // Throw ball
      const ball = ballRefs.current[heldBallRef.current];
      if (ball) {
        const { minThrowSpeed, maxThrowSpeed, throwArcDeg, throwSpinMult } =
          gameConfig;
        const throwSpeed =
          minThrowSpeed + (maxThrowSpeed - minThrowSpeed) * throwCharge.current;
        _forward.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
        _right.set(1, 0, 0).applyQuaternion(state.camera.quaternion);
        const arcRad = (throwArcDeg * Math.PI) / 180;
        const cosA = Math.cos(arcRad),
          sinA = Math.sin(arcRad);
        const upX = _right.y * _forward.z - _right.z * _forward.y;
        const upY = _right.z * _forward.x - _right.x * _forward.z;
        const upZ = _right.x * _forward.y - _right.y * _forward.x;
        ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
        ball.setGravityScale(1, true);
        ball.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
        ball.setLinvel(
          {
            x: (_forward.x * cosA + upX * sinA) * throwSpeed,
            y: (_forward.y * cosA + upY * sinA) * throwSpeed,
            z: (_forward.z * cosA + upZ * sinA) * throwSpeed,
          },
          true,
        );
        ball.setAngvel(
          {
            x: _right.x * throwSpeed * throwSpinMult,
            y: _right.y * throwSpeed * throwSpinMult,
            z: _right.z * throwSpeed * throwSpinMult,
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
      throwCharge.current = 0;
    } else if (!isHoldingBall) {
      throwCharge.current = 0;
    }

    // --- Update held ball position (hold still or dribble) ---
    if (heldBallRef.current !== -1) {
      const ball = ballRefs.current[heldBallRef.current];
      if (ball) {
        const isMoving = Math.abs(moveVel.x) > 0.1 || Math.abs(moveVel.z) > 0.1;
        const targetBlend = isMoving && !isCharging ? 1 : 0;
        dribbleBlend.current +=
          (targetBlend - dribbleBlend.current) * Math.min(delta * 8, 1);

        _forward.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
        _right.set(1, 0, 0).applyQuaternion(state.camera.quaternion);

        // Hold position: slightly in front of camera
        _holdPos
          .copy(state.camera.position)
          .addScaledVector(_forward, BALL_RADIUS * 2 + 0.55);
        const holdX = _holdPos.x;
        const targetLift = isCharging ? 1 : 0;
        holdLift.current +=
          (targetLift - holdLift.current) * Math.min(delta * 8, 1);
        const holdY = _holdPos.y - 0.15 - (1 - holdLift.current) * 0.2;
        const holdZ = _holdPos.z;

        // Determine dribble side: continuous from analog strafing
        let targetSide = dribbleSide.current;
        if (frame.moveX > 0.1) targetSide = 1;
        else if (frame.moveX < -0.1) targetSide = -1;
        dribbleSide.current +=
          (targetSide - dribbleSide.current) * Math.min(delta * 5, 1);

        // Dribble position: to the side (based on dribbleSide), bouncing on the floor
        if (isMoving && !isCharging) {
          dribbleTime.current += delta * Math.PI * 2.2;
        }
        const bounceT = Math.pow(Math.abs(Math.sin(dribbleTime.current)), 0.4);
        const floorY = pos.y - 1 + BALL_RADIUS;
        const hipY = holdY;
        const side = dribbleSide.current;
        const dribbleX =
          state.camera.position.x + _right.x * 0.5 * side + _forward.x * 0.6;
        const dribbleY = floorY + (hipY - floorY) * bounceT;
        const dribbleZ =
          state.camera.position.z + _right.z * 0.5 * side + _forward.z * 0.6;

        // Floor-contact sound: detect when sin(dribbleTime) changes sign
        const sinT = Math.sin(dribbleTime.current);
        if (prevDribbleSin.current * sinT < 0 && dribbleBlend.current > 0.25) {
          const impactSpeed = 3.2 + dribbleBlend.current * 1.2;
          const bouncePos: [number, number, number] = [
            dribbleX,
            floorY,
            dribbleZ,
          ];
          audioManager.playBounceSound(bouncePos, "floor", impactSpeed);
          broadcastSoundEvent({
            id: (Date.now() * 1000 + Math.random() * 1000) | 0,
            pos: bouncePos,
            surface: "floor",
            speed: impactSpeed,
          });
        }
        prevDribbleSin.current = sinT;

        const b = dribbleBlend.current;
        const finalX = holdX + (dribbleX - holdX) * b;
        const finalY = holdY + (dribbleY - holdY) * b;
        const finalZ = holdZ + (dribbleZ - holdZ) * b;
        ball.setNextKinematicTranslation({
          x: finalX,
          y: finalY,
          z: finalZ,
        });

        // Gather rotation: rotate backward around camera's horizontal axis
        const gatherProgress = isCharging
          ? Math.min(
              (performance.now() - qPressTime.current) / 1000 / GATHER_DURATION,
              1,
            )
          : 0;
        const gatherAngle = gatherProgress * BALL_GATHER_ROTATION;
        _gatherQuat.setFromAxisAngle(_LOCAL_X_AXIS, gatherAngle);
        _heldBallRot
          .copy(state.camera.quaternion)
          .multiply(_gatherQuat)
          .multiply(heldBallRelativeQuat.current);
        ball.setNextKinematicRotation(_heldBallRot);

        // Directly override Three.js group transform after Rapier's sync, eliminating the one-step render lag
        const mesh = mainMeshRefs.current[heldBallRef.current];
        if (mesh?.parent) {
          mesh.parent.position.set(finalX, finalY, finalZ);
          mesh.parent.quaternion.copy(_heldBallRot);
        }
      }
    }

    // --- Throw meter UI (imperative DOM, no re-renders) ---
    if (meterEl.current && meterFillEl.current) {
      meterEl.current.style.display = throwCharge.current > 0 ? "flex" : "none";
      if (throwCharge.current > 0) {
        const pct = throwCharge.current * 100;
        meterFillEl.current.style.width = `${pct}%`;
        // hue: 120 (green) -> 60 (yellow) -> 0 (red) as charge grows
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
