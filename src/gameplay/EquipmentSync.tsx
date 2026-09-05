import { EQUIPMENT_REPLICATION_PRIORITY } from "./frameOrder";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Quaternion } from "three";
import { useEquipment } from "./EquipmentContext";
import { useGameSync } from "@/sync/GameSyncProvider";
import {
  BALL_COLLISION_GROUPS,
  HELD_BALL_COLLISION_GROUPS,
} from "@/constants/physics";
import { compareSnapshots, type OwnedSnapshot } from "./replication";
import type { EntitySnapshot } from "@/sync/IGameSync";

const rotation = new Quaternion();
const targetRotation = new Quaternion();

export function EquipmentSync() {
  const { rapier } = useRapier();
  const {
    bodyRefs,
    heldEntityRef,
    heldPose,
    ownedEntityIds,
    ownerVersions,
    ownerIds,
    entityGameData,
    releaseFromSpawn,
  } = useEquipment();
  const { sync, myId, getPlayers, remoteEntityStates, queuePresenceUpdate } =
    useGameSync();
  const sequence = useRef(0);
  const tick = useRef(0);
  const checkpoints = useRef(
    new Map<
      number,
      { version: number; held: boolean; sleeping: boolean; time: number }
    >(),
  );
  const orphanSince = useRef(new Map<number, number>());

  useFrame((_, delta) => {
    if (!sync) return;
    const now = performance.now();
    const peers = getPlayers();
    const elected = Math.min(myId, ...peers.keys());
    remoteEntityStates.current.forEach((remote, id) => {
      const body = bodyRefs.current[id];
      if (!body) return;
      const local: OwnedSnapshot = {
        ...remote,
        ownerId: ownerIds.current.get(id) ?? -1,
        ownerVersion: ownerVersions.current.get(id) ?? 0,
        sequence: 0,
      };
      if (
        ownedEntityIds.current.has(id) &&
        compareSnapshots(remote, local) <= 0
      )
        return;
      // Compare ownership separately from motion sequence for local authorities.
      if (
        ownedEntityIds.current.has(id) &&
        remote.ownerVersion === local.ownerVersion &&
        remote.ownerId === myId
      )
        return;
      if (compareSnapshots(remote, local) < 0) return;
      if (heldEntityRef.current === id) heldEntityRef.current = -1;
      ownedEntityIds.current.delete(id);
      ownerVersions.current.set(id, remote.ownerVersion ?? 0);
      ownerIds.current.set(id, remote.ownerId);
      entityGameData.current.set(id, remote.gameData);
      releaseFromSpawn(id);

      // Give awareness time to discover a late-joining checkpoint's owner.
      if (!peers.has(remote.ownerId) && elected === myId) {
        const since = orphanSince.current.get(id) ?? now;
        orphanSince.current.set(id, since);
        if (now - since > 3000) {
          ownerVersions.current.set(id, (remote.ownerVersion ?? 0) + 1);
          ownerIds.current.set(id, myId);
          ownedEntityIds.current.add(id);
          body.setBodyType(rapier.RigidBodyType.Dynamic, true);
          body.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
          body.setLinvel(
            { x: remote.vel[0], y: remote.vel[1], z: remote.vel[2] },
            true,
          );
          remoteEntityStates.current.delete(id);
          orphanSince.current.delete(id);
          return;
        }
      } else orphanSince.current.delete(id);
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body
        .collider(0)
        ?.setCollisionGroups(
          remote.held ? HELD_BALL_COLLISION_GROUPS : BALL_COLLISION_GROUPS,
        );
      const p = body.translation();
      const alpha = 1 - Math.exp(-18 * delta);
      const distance = Math.hypot(
        p.x - remote.pos[0],
        p.y - remote.pos[1],
        p.z - remote.pos[2],
      );
      const blend = distance > 5 ? 1 : alpha;
      body.setNextKinematicTranslation({
        x: p.x + (remote.pos[0] - p.x) * blend,
        y: p.y + (remote.pos[1] - p.y) * blend,
        z: p.z + (remote.pos[2] - p.z) * blend,
      });
      const q = body.rotation();
      rotation.set(q.x, q.y, q.z, q.w);
      targetRotation.fromArray(remote.rot);
      body.setNextKinematicRotation(rotation.slerp(targetRotation, blend));
    });

    if (now - tick.current < 50) return;
    tick.current = now;
    const states: Record<number, EntitySnapshot> = {};
    ownedEntityIds.current.forEach((id) => {
      const body = bodyRefs.current[id];
      if (!body) return;
      const authoredPose =
        heldEntityRef.current === id ? heldPose.current.get(id) : null;
      const p = authoredPose?.position ?? body.translation(),
        r = authoredPose?.rotation ?? body.rotation(),
        v = body.linvel(),
        a = body.angvel();
      const held = heldEntityRef.current === id;
      const snapshot: OwnedSnapshot = {
        ownerId: myId,
        ownerVersion: ownerVersions.current.get(id) ?? 0,
        sequence: ++sequence.current,
        pos: [p.x, p.y, p.z],
        rot: [r.x, r.y, r.z, r.w],
        vel: [v.x, v.y, v.z],
        angvel: [a.x, a.y, a.z],
        held,
        ...(entityGameData.current.get(id)
          ? { gameData: entityGameData.current.get(id) }
          : {}),
      };
      const sleeping =
        !held &&
        (body.isSleeping() || Math.hypot(v.x, v.y, v.z, a.x, a.y, a.z) < 0.05);
      const old = checkpoints.current.get(id);
      if (!sleeping || !old?.sleeping) states[id] = snapshot;
      if (
        !old ||
        old.version !== snapshot.ownerVersion ||
        old.held !== held ||
        old.sleeping !== sleeping ||
        (!sleeping && now - old.time > 1000)
      ) {
        sync.world.checkpoint(id, snapshot);
        checkpoints.current.set(id, {
          version: snapshot.ownerVersion ?? 0,
          held,
          sleeping,
          time: now,
        });
      }
    });
    queuePresenceUpdate({ entityStates: states });
  }, EQUIPMENT_REPLICATION_PRIORITY);
  return null;
}
