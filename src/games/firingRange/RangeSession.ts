import type { ISharedWorld } from "@/sync/ISharedWorld";
import { Vector3 } from "three";
import {
  activeTrial,
  createTrial,
  finishTrial,
  hitTarget,
  inFiringBay,
  RANGE_SCOPE,
  recordShot,
  targetAt,
  type TargetHit,
  type Tier,
  type Trial,
} from "./trials";
import type { WeaponId } from "./weapons";

export const SHOT_SCOPE = "firing-range-shots:v1";
export class RangeSession {
  world: ISharedWorld | null = null;
  myId = -1;
  name = "Player";
  connected = new Set<number>();
  winner: Trial | undefined;
  notice = "Pick up a weapon, then use a trial button.";
  resetWeapon = 0;
  lastHitUntil = 0;
  lastHitPoints = 0;
  recoverUntil = 0;
  effectSequence = 0;
  get mine(): Trial | undefined {
    return this.world?.records<Trial>(RANGE_SCOPE).get(this.myId);
  }
  attach(world: ISharedWorld | null, id: number, name: string) {
    this.world = world;
    this.myId = id;
    this.name = name;
  }
  setConnected(ids: Iterable<number>) {
    this.connected = new Set([this.myId, ...ids]);
  }
  update(
    now: number,
    position: Vector3,
    heldWeapon: WeaponId | undefined,
    armed = false,
  ) {
    const records =
      this.world?.records<Trial>(RANGE_SCOPE) ?? new Map<number, Trial>();
    this.winner = activeTrial(records.values(), now, this.connected);
    const mine = records.get(this.myId);
    if (!mine || mine.status !== "active") return;
    let result = mine;
    if (now >= mine.end) result = finishTrial(mine);
    else if (!inFiringBay(position))
      result = finishTrial(mine, "Left the firing bay");
    // Dragon self-destruct deliberately leaves the hands empty until detonation.
    else if (
      (!heldWeapon && !armed && now >= this.recoverUntil) ||
      (heldWeapon && heldWeapon !== mine.weapon)
    )
      result = finishTrial(mine, "Dropped or changed weapon");
    else if (this.winner && this.winner.owner !== this.myId)
      result = finishTrial(mine, "Range reserved by another player");
    if (result !== mine) this.save(result);
  }
  save(trial: Trial) {
    this.world?.setRecord(RANGE_SCOPE, this.myId, trial);
    if (this.winner?.owner === this.myId)
      this.winner = trial.status === "active" ? trial : undefined;
  }
  start(
    weapon: WeaponId | undefined,
    tier: Tier,
    now: number,
    position: Vector3,
  ) {
    if (!weapon) {
      this.notice = "Pick up a gun first (E / X).";
      return;
    }
    if (!this.world || !inFiringBay(position)) return;
    const winner = activeTrial(
      this.world.records<Trial>(RANGE_SCOPE).values(),
      now,
      this.connected,
    );
    if (winner) {
      this.notice = `${winner.name} is using the range. Wait for the result.`;
      return;
    }
    const trial = createTrial(this.myId, this.name, weapon, tier, now);
    this.world.setRecord(RANGE_SCOPE, this.myId, trial);
    this.winner = trial;
    this.resetWeapon++;
    this.recoverUntil = 0;
    this.notice = "Trial begins in 3 seconds. Face downrange.";
  }
  canScore(now: number) {
    return (
      this.winner?.owner === this.myId &&
      this.winner.status === "active" &&
      now >= this.winner.start &&
      now < this.winner.end
    );
  }
  shoot(
    origin: Vector3,
    direction: Vector3,
    limit: number,
    now: number,
    weapon: WeaponId,
  ): TargetHit | null {
    const hits = [0, 1, 2]
      .map((i) =>
        hitTarget(origin, direction, targetAt(i, this.winner, now), limit),
      )
      .filter((h): h is TargetHit => h !== null)
      .sort((a, b) => a.distance - b.distance);
    const hit = hits[0] ?? null;
    if (hit) {
      this.lastHitUntil = now + 0.2;
      this.lastHitPoints = hit.points;
    }
    if (this.canScore(now) && this.winner?.weapon === weapon)
      this.save(recordShot(this.winner, hit ? [hit] : [], now));
    return hit;
  }
  launchMine(token: string, now: number) {
    if (!this.canScore(now) || !this.winner) return;
    const trial = recordShot(this.winner, [], now);
    this.save({ ...trial, pendingMines: [...trial.pendingMines, token] });
  }
  explode(
    position: Vector3,
    now: number,
    trialId: string | undefined,
    token?: string,
  ) {
    if (
      this.canScore(now) &&
      this.winner &&
      this.winner.id === trialId &&
      token &&
      this.winner.pendingMines.includes(token)
    ) {
      const hits = [0, 1, 2]
        .map((i) => targetAt(i, this.winner, now))
        .filter((t) => t.visible && t.point.distanceTo(position) <= 4)
        .map((t) => ({
          index: t.index,
          points: 10,
          distance: t.point.distanceTo(position),
          point: t.point,
        }));
      const trial = {
        ...this.winner,
        damage: [...this.winner.damage],
        pendingMines: this.winner.pendingMines.filter((id) => id !== token),
      };
      for (const hit of hits) trial.damage[hit.index] = 3;
      this.save(recordShot(trial, hits, now, false));
      this.recoverUntil = now + 10;
    }
    this.effect(position, position, "dragon", now, true);
  }
  effect(
    from: Vector3,
    to: Vector3,
    weapon: WeaponId,
    now: number,
    explosion = false,
  ) {
    this.world?.setRecord(SHOT_SCOPE, this.myId, {
      id: `${this.myId}:${++this.effectSequence}:${now}`,
      from: from.toArray(),
      to: to.toArray(),
      weapon,
      time: now,
      explosion,
    });
  }
}
