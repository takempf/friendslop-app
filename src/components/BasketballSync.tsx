import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { useBasketball } from "../contexts/BasketballContext";
import { useGameSync } from "../sync/GameSyncProvider";
import type { RemoteBallState } from "../sync/IGameSync";

const SETTLE_MS = 2000; // stop broadcasting after 2s of stillness
const SETTLE_SPEED_SQ = 0.05 * 0.05; // squared threshold for speed + angspeed

const _curQuat = new THREE.Quaternion();
const _tgtQuat = new THREE.Quaternion();

export function BasketballSync() {
  const { rapier } = useRapier();
  const { ballRefs, heldBallRef, ownedBallIds, ballOwnerVersions } =
    useBasketball();
  const { sync, remoteBallStates, queuePresenceUpdate } = useGameSync();
  const settleTimers = useRef<Map<number, number>>(new Map());

  useFrame(() => {
    // --- Apply remote ball states every frame ---
    remoteBallStates.current.forEach((state, ballId) => {
      const ball = ballRefs.current[ballId];
      if (!ball) return;
      const remoteOwnerVersion = state.ownerVersion || 0;
      const localOwnerVersion = ballOwnerVersions.current.get(ballId) || 0;

      // Surrender logic for steals
      if (remoteOwnerVersion > localOwnerVersion) {
        if (heldBallRef.current === ballId) {
          heldBallRef.current = -1;
        }
        ownedBallIds.current.delete(ballId);
        ballOwnerVersions.current.set(ballId, remoteOwnerVersion);
      } else {
        // Never override a ball we're holding or currently own (threw/dropped)
        // Also clear any stale remote state so it doesn't snap back when we let go
        if (heldBallRef.current === ballId) {
          remoteBallStates.current.delete(ballId);
          return;
        }
        if (ownedBallIds.current.has(ballId)) {
          remoteBallStates.current.delete(ballId);
          return;
        }
      }

      if (state.held) {
        // Remote player is holding this ball — kinematic so it follows them smoothly
        if (ball.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        }
        ball.setNextKinematicTranslation({
          x: state.pos[0],
          y: state.pos[1],
          z: state.pos[2],
        });
      } else {
        // Ball in flight or at rest — kinematic with lerped position/rotation
        // so it tracks the owner smoothly instead of snapping each network tick.
        if (ball.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        }
        const cur = ball.translation();
        const [tx, ty, tz] = state.pos;
        ball.setNextKinematicTranslation({
          x: cur.x + (tx - cur.x) * 0.3,
          y: cur.y + (ty - cur.y) * 0.3,
          z: cur.z + (tz - cur.z) * 0.3,
        });
        if (state.rot) {
          const r = ball.rotation();
          _curQuat.set(r.x, r.y, r.z, r.w);
          _tgtQuat.set(state.rot[0], state.rot[1], state.rot[2], state.rot[3]);
          _curQuat.slerp(_tgtQuat, 0.3);
          ball.setNextKinematicRotation(_curQuat);
        }
      }
    });

    // --- Queue owned ball states for the unified sync tick ---
    if (!sync || ownedBallIds.current.size === 0) return;

    const now = performance.now();
    const ballStates: Record<number, RemoteBallState> = {};
    const toRemove: number[] = [];

    ownedBallIds.current.forEach((ballId) => {
      const ball = ballRefs.current[ballId];
      if (!ball) {
        toRemove.push(ballId);
        return;
      }

      const pos = ball.translation();
      const rot = ball.rotation();
      const vel = ball.linvel();
      const angvel = ball.angvel();
      const isHeld = heldBallRef.current === ballId;

      ballStates[ballId] = {
        pos: [pos.x, pos.y, pos.z],
        rot: [rot.x, rot.y, rot.z, rot.w],
        vel: [vel.x, vel.y, vel.z],
        angvel: [angvel.x, angvel.y, angvel.z],
        held: isHeld || undefined,
        ownerVersion: ballOwnerVersions.current.get(ballId) || 0,
      };

      // Settle detection: stop broadcasting once ball is still for SETTLE_MS
      if (!isHeld) {
        const speedSq = vel.x ** 2 + vel.y ** 2 + vel.z ** 2;
        const angSpeedSq = angvel.x ** 2 + angvel.y ** 2 + angvel.z ** 2;
        if (speedSq < SETTLE_SPEED_SQ && angSpeedSq < SETTLE_SPEED_SQ) {
          const firstStill = settleTimers.current.get(ballId) ?? now;
          settleTimers.current.set(ballId, firstStill);
          if (now - firstStill >= SETTLE_MS) {
            toRemove.push(ballId);
            settleTimers.current.delete(ballId);
          }
        } else {
          settleTimers.current.delete(ballId);
        }
      }
    });

    toRemove.forEach((id) => {
      ownedBallIds.current.delete(id);
      remoteBallStates.current.delete(id);
    });

    queuePresenceUpdate({ ballStates });
  });

  return null;
}
