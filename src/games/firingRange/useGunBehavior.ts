import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { EquipmentBehavior } from "@/gameplay/EquipmentBehavior";
import { useEquipment } from "@/gameplay/EquipmentContext";
import { EQUIPMENT } from "@/gameplay/equipment";
import { GROUND_RAY_COLLISION_GROUPS } from "@/constants/physics";
import { aimState } from "@/targeting/aimState";
import { useRangeSession } from "./FiringRangeProvider";
import {
  advanceWeapon,
  freshWeapon,
  reloadWeapon,
  WEAPONS,
  type WeaponState,
} from "./weapons";
import { targetAt } from "./trials";

const offset = new Vector3(),
  barrel = new Vector3(),
  shotDirection = new Vector3();
const orientation = new Quaternion(),
  poseEuler = new Euler();
export function useGunBehavior(): EquipmentBehavior {
  const { heldEntityRef, entityGameData } = useEquipment();
  const range = useRangeSession();
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const states = useRef(new Map<number, WeaponState>());
  const current = useRef(-1);
  const reset = useRef(0);
  const lock = useRef(-1);
  const whipUntil = useRef(0);
  const baseFov = useRef(camera instanceof PerspectiveCamera ? camera.fov : 75);
  useEffect(
    () => () => {
      if (camera instanceof PerspectiveCamera) {
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
      }
    },
    [camera],
  );
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const weapon = EQUIPMENT[heldEntityRef.current]?.variant;
    if (!weapon) current.current = -1;
    const zoom = weapon === "dragon" && aimState.isManualAiming;
    const fov = zoom
      ? (2 * Math.atan(Math.tan((baseFov.current * Math.PI) / 360) / 2) * 180) /
        Math.PI
      : baseFov.current;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-16 * delta));
      camera.updateProjectionMatrix();
    }
  }, -0.65);
  return {
    preserveStateOnTransfer: true,
    aimTargetKind: "shooting-target",
    hold(ctx, position, rotation) {
      const state = states.current.get(heldEntityRef.current);
      const recoil = state?.recoil ?? 0;
      const bob = ctx.moving ? Math.sin(performance.now() * 0.011) * 0.012 : 0;
      const swing = Math.max(0, whipUntil.current - Date.now() / 1000) / 0.35;
      offset.set(
        0.25,
        -0.26 + bob,
        -0.5 + recoil * 0.7 - Math.sin(swing * Math.PI) * 0.35,
      );
      if (state?.reloadUntil) offset.y -= 0.18;
      position
        .copy(offset.applyQuaternion(ctx.camera.quaternion))
        .add(ctx.camera.position);
      poseEuler.set(
        recoil * 1.6 + aimState.screenY * 0.5,
        -aimState.screenX * 0.5,
        state?.reloadUntil ? -0.4 : 0,
      );
      rotation
        .copy(ctx.camera.quaternion)
        .multiply(orientation.setFromEuler(poseEuler));
    },
    use(ctx) {
      const weapon = EQUIPMENT[ctx.id].variant!;
      const def = WEAPONS[weapon];
      const now = Date.now() / 1000;
      if (current.current !== ctx.id || reset.current !== range.resetWeapon) {
        const data = entityGameData.current.get(ctx.id);
        const fresh = freshWeapon(weapon);
        if (
          reset.current === range.resetWeapon &&
          data &&
          typeof data.ammo === "number" &&
          typeof data.reserve === "number"
        ) {
          fresh.ammo = Math.max(0, Math.min(def.magazine, data.ammo));
          fresh.reserve = Math.max(0, Math.min(def.reserve, data.reserve));
        }
        states.current.set(ctx.id, fresh);
        current.current = ctx.id;
        reset.current = range.resetWeapon;
        lock.current = -1;
      }
      const state = states.current.get(ctx.id)!;
      if (ctx.secondaryPressed) {
        state.secondary = !state.secondary;
        lock.current = -1;
      }
      if (ctx.reloadPressed) reloadWeapon(state, weapon, now);
      // Capture CMP follow-lock by pointing the manual reticle at a target.
      if (weapon === "cmp150" && state.secondary && aimState.isManualAiming) {
        const candidate = [0, 1, 2]
          .map((i) => targetAt(i, range.winner, now))
          .find((t) => {
            const direction = t.point
              .clone()
              .sub(ctx.camera.position)
              .normalize();
            return t.visible && direction.dot(ctx.direction) > 0.999;
          });
        if (candidate) lock.current = candidate.index;
      }
      const firing =
        ctx.firing &&
        (!range.winner ||
          range.winner.owner !== range.myId ||
          now >= range.winner.start);
      if (state.secondary && weapon !== "cmp150") {
        advanceWeapon(state, weapon, now, ctx.delta, false, false);
        if (
          firing &&
          ctx.firePressed &&
          now >= state.nextShot &&
          !state.reloadUntil
        ) {
          state.nextShot = now + 0.6;
          state.recoil = 0.2;
          if (weapon === "dragon" && state.ammo > 0) {
            const data = {
              ammo: 0,
              reserve: state.reserve,
              mine: true,
              armedAt: now + 0.8,
              expires: now + 8,
              trialId: range.winner?.id,
              mineId: `${ctx.id}:${now}`,
            };
            range.launchMine(data.mineId, now);
            entityGameData.current.set(ctx.id, data);
            ctx.release(
              ctx.direction
                .clone()
                .multiplyScalar(13)
                .add(new Vector3(0, 2.5, 0)),
            );
            current.current = -1;
            return;
          }
          if (weapon === "falcon9") whipUntil.current = now + 0.35;
          if (weapon === "falcon9")
            range.shoot(ctx.camera.position, ctx.direction, 1.8, now, weapon);
        }
      } else {
        const count = advanceWeapon(
          state,
          weapon,
          now,
          ctx.delta,
          firing,
          ctx.firePressed,
        );
        for (let i = 0; i < count; i++) {
          shotDirection.copy(ctx.direction);
          if (weapon === "cmp150" && state.secondary && lock.current >= 0) {
            const target = targetAt(lock.current, range.winner, now);
            const toward = target.point
              .clone()
              .sub(ctx.camera.position)
              .normalize();
            // Follow-lock retains a moving target, but never tracks behind the player.
            if (
              target.visible &&
              toward.dot(ctx.camera.getWorldDirection(barrel)) > 0.35
            )
              shotDirection.copy(toward);
            else lock.current = -1;
          }
          const spread =
            def.spread *
            (aimState.isManualAiming ? 0.3 : 1) *
            (1 + state.recoil * 5);
          const phase = (state.shots - count + i) * 2.399963;
          shotDirection.applyAxisAngle(
            new Vector3(0, 1, 0),
            Math.cos(phase) * spread,
          );
          shotDirection.y += Math.sin(phase) * spread;
          shotDirection.normalize();
          const ray = new rapier.Ray(ctx.camera.position, shotDirection);
          const wall = world.castRay(
            ray,
            100,
            true,
            undefined,
            GROUND_RAY_COLLISION_GROUPS,
          );
          const distance = wall?.timeOfImpact ?? 100;
          const hit = range.shoot(
            ctx.camera.position,
            shotDirection,
            distance,
            now,
            weapon,
          );
          const to =
            hit?.point ??
            shotDirection
              .clone()
              .multiplyScalar(distance)
              .add(ctx.camera.position);
          barrel
            .set(0.25, -0.22, -0.8)
            .applyQuaternion(ctx.camera.quaternion)
            .add(ctx.camera.position);
          range.effect(barrel, to, weapon, now);
        }
        if (count)
          entityGameData.current.set(ctx.id, {
            ...entityGameData.current.get(ctx.id),
            lastFire: now,
          });
      }
      entityGameData.current.set(ctx.id, {
        ...entityGameData.current.get(ctx.id),
        ammo: state.ammo,
        reserve: state.reserve,
        secondary: state.secondary,
      });
      const hud = document.getElementById("weapon-readout");
      if (hud)
        hud.textContent = `${def.name}   ${state.reloadUntil ? "RELOADING" : `${state.ammo} / ${state.reserve}`}   ${state.secondary ? def.secondary : "PRIMARY"}${lock.current >= 0 ? " [LOCKED]" : ""}`;
    },
  };
}
