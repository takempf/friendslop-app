import { HELD_PRESENTATION_PRIORITY } from "./frameOrder";
import { applyWorldPose } from "./HeldPose";
import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useAfterPhysicsStep, useRapier } from "@react-three/rapier";
import { Quaternion, Vector3 } from "three";
import { useInput } from "@/input/useInput";
import { useGameSync } from "@/sync/GameSyncProvider";
import { useEquipment } from "./EquipmentContext";
import { EQUIPMENT } from "./equipment";
import type { EquipmentBehaviors } from "./EquipmentBehavior";
import {
  BALL_COLLISION_GROUPS,
  HELD_BALL_COLLISION_GROUPS,
} from "@/constants/physics";
import { gameConfig } from "@/config";
import { resolveEquipmentAim } from "./equipmentAim";
import { aimState } from "@/targeting/aimState";

const forward = new Vector3(),
  right = new Vector3(),
  up = new Vector3(0, 1, 0);
const position = new Vector3(),
  rotation = new Quaternion();
const MAX_CHARGE_TIME = 2.5;

/** First-person equipment lifecycle. Game modules inject pose, launch tuning
 * and rules; locomotion, ownership, input, reticle and replication are shared. */
export function EquipmentController({
  lastGroundPos,
  behaviors,
  active,
}: {
  lastGroundPos: React.RefObject<[number, number]>;
  behaviors: EquipmentBehaviors;
  active: boolean;
}) {
  const input = useInput();
  const { rapier } = useRapier();
  const { myId, remoteEntityStates, broadcastReset } = useGameSync();
  const {
    bodyRefs,
    visualRefs,
    heldEntityRef,
    heldPose,
    ownedEntityIds,
    ownerVersions,
    ownerIds,
    grabCandidateRef,
    buttonCandidateRef,
    lastThrowRef,
    releaseFromSpawn,
    entityGameData,
  } = useEquipment();
  const charge = useRef(0);
  const releasedVisual = useRef(-1);
  useAfterPhysicsStep(() => {
    releasedVisual.current = -1;
  });
  const relativeRotation = useRef(new Quaternion());
  const meter = useRef<HTMLElement | null>(null),
    fill = useRef<HTMLElement | null>(null);
  useEffect(() => {
    meter.current = document.getElementById("throw-meter");
    fill.current = document.getElementById("throw-meter-fill");
  }, []);
  useFrame(({ camera, size }, delta) => {
    if (!active) {
      charge.current = 0;
      if (meter.current) meter.current.style.display = "none";
      return;
    }
    const frame = input.getFrame();
    if (
      input.justPressed("interact") &&
      aimState.targetKind !== "world-action"
    ) {
      const held = bodyRefs.current[heldEntityRef.current];
      if (held) {
        const id = heldEntityRef.current;
        heldPose.current.release(id, held);
        releasedVisual.current = id;
        held.setBodyType(rapier.RigidBodyType.Dynamic, true);
        held.setGravityScale(1, true);
        held.setLinvel({ x: 0, y: 0, z: 0 }, true);
        held.setAngvel({ x: 0, y: 0, z: 0 }, true);
        held.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
        // Dropping is not a throw and cannot complete a hole.
        if (!behaviors[EQUIPMENT[id].kind].preserveStateOnTransfer)
          entityGameData.current.delete(id);
        heldEntityRef.current = -1;
        charge.current = 0;
      } else {
        const id = grabCandidateRef.current;
        const body = bodyRefs.current[id];
        if (body) {
          releaseFromSpawn(id);
          heldEntityRef.current = id;
          ownerIds.current.set(id, myId);
          ownedEntityIds.current.add(id);
          ownerVersions.current.set(
            id,
            Math.max(
              remoteEntityStates.current.get(id)?.ownerVersion ?? 0,
              ownerVersions.current.get(id) ?? 0,
            ) + 1,
          );
          body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          body.collider(0)?.setCollisionGroups(HELD_BALL_COLLISION_GROUPS);
          const q = body.rotation();
          relativeRotation.current
            .copy(camera.quaternion)
            .invert()
            .multiply(rotation.set(q.x, q.y, q.z, q.w));
          if (!behaviors[EQUIPMENT[id].kind].preserveStateOnTransfer)
            entityGameData.current.delete(id);
          charge.current = 0;
        } else if (buttonCandidateRef.current) broadcastReset();
      }
    }
    const id = heldEntityRef.current;
    const body = bodyRefs.current[id];
    const behavior = EQUIPMENT[id] ? behaviors[EQUIPMENT[id].kind] : undefined;
    const charging = Boolean(
      body && !behavior?.use && input.pressed("chargeThrow"),
    );
    if (charging)
      charge.current = Math.min(
        MAX_CHARGE_TIME,
        charge.current + Math.min(delta, 0.05),
      );
    if (body && behavior) {
      // Evaluate the current camera pose once, including on the release frame.
      behavior.hold(
        {
          camera,
          delta,
          moving: Math.hypot(frame.moveX, frame.moveY) > 0.1,
          moveX: frame.moveX,
          charging: charging || input.justReleased("chargeThrow"),
          chargeSeconds: charge.current,
          bodyY: camera.position.y - 0.83,
          relativeRotation: relativeRotation.current,
        },
        position,
        rotation,
      );
      heldPose.current.set(id, position, rotation);
      if (behavior.use || input.justReleased("chargeThrow")) {
        resolveEquipmentAim(
          camera,
          size.width / (size.height || 1),
          aimState,
          behavior,
          input.getActiveDevice(),
          gameConfig,
          forward,
        );
      }

      if (behavior.use) {
        charge.current = 0;
        body.setNextKinematicTranslation(position);
        body.setNextKinematicRotation(rotation);
        behavior.use({
          camera,
          id,
          direction: forward,
          delta,
          firing: input.pressed("fire") || input.pressed("chargeThrow"),
          firePressed:
            input.justPressed("fire") || input.justPressed("chargeThrow"),
          reloadPressed: input.justPressed("reload"),
          secondaryPressed: input.justPressed("secondary"),
          release(velocity) {
            heldPose.current.release(id, body);
            releasedVisual.current = id;
            body.setBodyType(rapier.RigidBodyType.Dynamic, true);
            body.setGravityScale(1, true);
            body.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
            body.setLinvel(velocity, true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            heldEntityRef.current = -1;
            lastThrowRef.current = { idx: id, time: performance.now() };
          },
        });
      } else if (input.justReleased("chargeThrow")) {
        const settings = behavior.throwSettings();
        const speed =
          settings.minThrowSpeed +
          ((settings.maxThrowSpeed - settings.minThrowSpeed) * charge.current) /
            MAX_CHARGE_TIME;
        right.crossVectors(forward, up).normalize();
        forward.applyAxisAngle(right, (settings.throwArcDeg * Math.PI) / 180);
        heldPose.current.release(id, body);
        releasedVisual.current = id;
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
        body.setGravityScale(1, true);
        body.collider(0)?.setCollisionGroups(BALL_COLLISION_GROUPS);
        body.setLinvel(
          { x: forward.x * speed, y: forward.y * speed, z: forward.z * speed },
          true,
        );
        body.setAngvel(
          {
            x: right.x * speed * settings.throwSpinMult,
            y: right.y * speed * settings.throwSpinMult,
            z: right.z * speed * settings.throwSpinMult,
          },
          true,
        );
        behavior.onThrow({
          camera,
          id,
          body,
          direction: forward,
          chargeRatio: charge.current / MAX_CHARGE_TIME,
          groundPosition: lastGroundPos.current,
        });
        lastThrowRef.current = { idx: id, time: performance.now() };
        heldEntityRef.current = -1;
        charge.current = 0;
      } else {
        body.setNextKinematicTranslation(position);
        body.setNextKinematicRotation(rotation);
      }
    } else charge.current = 0;
    if (meter.current && fill.current) {
      const ratio = charge.current / MAX_CHARGE_TIME;
      meter.current.style.display = ratio > 0 ? "flex" : "none";
      fill.current.style.width = `${ratio * 100}%`;
      fill.current.style.background = `hsl(${Math.round((1 - ratio) * 120)}, 90%, 45%)`;
    }
  }, -0.2);
  // Rapier overwrites body objects during its render-frame interpolation, even
  // on frames with no fixed step. Restore only the local held presentation last.
  useFrame(() => {
    const id = heldEntityRef.current;
    heldPose.current.present(id, visualRefs.current[id]?.parent);
    const released = releasedVisual.current;
    if (released < 0 || !ownedEntityIds.current.has(released)) return;
    const body = bodyRefs.current[released];
    const visual = visualRefs.current[released]?.parent;
    if (body && visual)
      applyWorldPose(visual, body.translation(), body.rotation());
  }, HELD_PRESENTATION_PRIORITY);
  return null;
}
