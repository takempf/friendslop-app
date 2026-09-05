import { useRef } from "react";
import * as THREE from "three";
import { useGameSync } from "@/sync/GameSyncProvider";
import { useBasketballShotPoints } from "./BasketballRules";
import type { EquipmentBehavior } from "@/gameplay/EquipmentBehavior";
import { audioManager } from "@/audio/AudioManager";
import {
  BALL_RADIUS,
  BALL_GATHER_ROTATION,
  THREE_POINT_ARC_RADIUS,
  THREE_POINT_CORNER_X,
  HOOP_RIM_POS,
} from "@/constants/basketball";
import { gameConfig } from "@/config";
import { TARGET_KINDS } from "@/targeting/types";
const GATHER_DURATION = 0.1;
const _forward = new THREE.Vector3(),
  _right = new THREE.Vector3(),
  _holdPos = new THREE.Vector3();
const _LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);
const _gatherQuat = new THREE.Quaternion(),
  _heldBallRot = new THREE.Quaternion();
export function useBasketballBehavior(): EquipmentBehavior {
  const { broadcastSoundEvent } = useGameSync();
  const ballShotPoints = useBasketballShotPoints();
  const dribbleTime = useRef(0),
    dribbleBlend = useRef(0),
    dribbleSide = useRef(1),
    holdLift = useRef(0),
    prevDribbleSin = useRef(0);
  return {
    throwSettings: () => gameConfig,
    aimTargetKind: TARGET_KINDS.hoop,
    onThrow({ id, groundPosition: [gx, gz] }) {
      const dx = gx - HOOP_RIM_POS.x,
        dz = gz - HOOP_RIM_POS.z;
      ballShotPoints.current.set(
        id,
        Math.hypot(dx, dz) >= THREE_POINT_ARC_RADIUS ||
          Math.abs(dx) >= THREE_POINT_CORNER_X
          ? 3
          : 2,
      );
    },
    hold(
      {
        camera,
        delta,
        moving,
        moveX,
        charging: isCharging,
        chargeSeconds,
        bodyY,
        relativeRotation,
      },
      position,
      rotation,
    ) {
      const isMoving = moving;
      const targetBlend = isMoving && !isCharging ? 1 : 0;
      dribbleBlend.current +=
        (targetBlend - dribbleBlend.current) * Math.min(delta * 8, 1);

      _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);

      // Hold position: slightly in front of camera
      _holdPos
        .copy(camera.position)
        .addScaledVector(_forward, BALL_RADIUS * 2 + 0.55);
      const holdX = _holdPos.x;
      const targetLift = isCharging ? 1 : 0;
      holdLift.current +=
        (targetLift - holdLift.current) * Math.min(delta * 8, 1);
      const holdY = _holdPos.y - 0.15 - (1 - holdLift.current) * 0.2;
      const holdZ = _holdPos.z;

      // Determine dribble side: continuous from analog strafing
      let targetSide = dribbleSide.current;
      if (moveX > 0.1) targetSide = 1;
      else if (moveX < -0.1) targetSide = -1;
      dribbleSide.current +=
        (targetSide - dribbleSide.current) * Math.min(delta * 5, 1);

      // Dribble position: to the side (based on dribbleSide), bouncing on the floor
      if (isMoving && !isCharging) {
        dribbleTime.current += delta * Math.PI * 2.2;
      }
      const bounceT = Math.pow(Math.abs(Math.sin(dribbleTime.current)), 0.4);
      const floorY = bodyY - 1 + BALL_RADIUS;
      const hipY = holdY;
      const side = dribbleSide.current;
      const dribbleX =
        camera.position.x + _right.x * 0.5 * side + _forward.x * 0.6;
      const dribbleY = floorY + (hipY - floorY) * bounceT;
      const dribbleZ =
        camera.position.z + _right.z * 0.5 * side + _forward.z * 0.6;

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
      position.set(finalX, finalY, finalZ);

      // Gather rotation: rotate backward around camera's horizontal axis
      const gatherProgress = isCharging
        ? Math.min(chargeSeconds / GATHER_DURATION, 1)
        : 0;
      const gatherAngle = gatherProgress * BALL_GATHER_ROTATION;
      _gatherQuat.setFromAxisAngle(_LOCAL_X_AXIS, gatherAngle);
      _heldBallRot
        .copy(camera.quaternion)
        .multiply(_gatherQuat)
        .multiply(relativeRotation);
      rotation.copy(_heldBallRot);
    },
  };
}
