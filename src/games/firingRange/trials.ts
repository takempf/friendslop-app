import { Vector3 } from "three";
import type { SessionRecord } from "@/sync/ISharedWorld";
import type { WeaponId } from "./weapons";

export const RANGE_SCOPE = "firing-range:v1";
export type Tier = "bronze" | "silver" | "gold";
export const TIERS: Record<
  Tier,
  { seconds: number; score: number; accuracy: number; destroyed: number }
> = {
  bronze: { seconds: 40, score: 80, accuracy: 30, destroyed: 2 },
  silver: { seconds: 30, score: 150, accuracy: 50, destroyed: 4 },
  gold: { seconds: 30, score: 220, accuracy: 65, destroyed: 6 },
};
export interface Trial extends SessionRecord {
  id: string;
  owner: number;
  name: string;
  weapon: WeaponId;
  tier: Tier;
  start: number;
  end: number;
  status: "active" | "passed" | "failed" | "aborted";
  reason: string;
  shots: number;
  hits: number;
  score: number;
  destroyed: number;
  damage: number[];
  downUntil: number[];
  pendingMines: string[];
}
export function createTrial(
  owner: number,
  name: string,
  weapon: WeaponId,
  tier: Tier,
  now: number,
): Trial {
  const start = now + 3;
  return {
    id: `${owner}:${now}`,
    owner,
    name,
    weapon,
    tier,
    start,
    end: start + TIERS[tier].seconds,
    status: "active",
    reason: "",
    shots: 0,
    hits: 0,
    score: 0,
    destroyed: 0,
    damage: [0, 0, 0],
    downUntil: [0, 0, 0],
    pendingMines: [],
  };
}
export function accuracy(trial: Trial): number {
  return trial.shots ? (100 * trial.hits) / trial.shots : 0;
}
export function finishTrial(trial: Trial, reason = ""): Trial {
  if (trial.status !== "active") return trial;
  const goal = TIERS[trial.tier];
  const passed =
    trial.score >= goal.score &&
    accuracy(trial) >= goal.accuracy &&
    trial.destroyed >= goal.destroyed;
  return {
    ...trial,
    status: reason ? "aborted" : passed ? "passed" : "failed",
    reason,
  };
}
/** A deterministic winner for simultaneous P2P starts; departed/expired runs cannot hold the range. */
export function activeTrial(
  records: Iterable<Trial>,
  now: number,
  connected: ReadonlySet<number>,
): Trial | undefined {
  return [...records]
    .filter(
      (t) => t.status === "active" && now < t.end && connected.has(t.owner),
    )
    .sort((a, b) => a.start - b.start || a.owner - b.owner)[0];
}
export function inRange(p: { x: number; z: number }): boolean {
  return p.x < -2.25 && p.x > -38 && p.z > -29.75 && p.z < -20.25;
}
export function inFiringBay(p: { x: number; z: number }): boolean {
  return inRange(p) && p.x > -10;
}
export interface RangeTarget {
  index: number;
  point: Vector3;
  angle: number;
  visible: boolean;
}
export function targetAt(
  index: number,
  trial: Trial | undefined,
  now: number,
): RangeTarget {
  const elapsed = trial ? Math.max(0, now - trial.start) : 0;
  const tier = trial?.tier ?? "bronze";
  const moving = tier !== "bronze";
  const angle = moving
    ? Math.PI *
      Math.max(
        0,
        Math.sin(elapsed * (tier === "gold" ? 1.8 : 1.1) + index * 1.6),
      )
    : 0;
  return {
    index,
    point: new Vector3(
      -16 -
        index * 7 +
        (tier === "gold" ? 2 * Math.sin(elapsed * 0.7 + index) : 0),
      1.8 + (tier === "gold" ? 0.35 * Math.sin(elapsed * 1.6 + index) : 0),
      -22 -
        index * 3 +
        (moving ? 0.8 * Math.sin(elapsed * 1.2 + index * 2) : 0),
    ),
    angle,
    visible:
      !trial ||
      (now >= trial.start && now < trial.end && now >= trial.downUntil[index]),
  };
}
export interface TargetHit {
  index: number;
  points: number;
  distance: number;
  point: Vector3;
}
/** Intersect the actual rotating target plane, not a generous invisible hit sphere. */
export function hitTarget(
  origin: Vector3,
  direction: Vector3,
  target: RangeTarget,
  limit = 100,
): TargetHit | null {
  if (!target.visible) return null;
  const normal = new Vector3(
    Math.cos(target.angle),
    0,
    -Math.sin(target.angle),
  );
  const denominator = direction.dot(normal);
  // Back faces and edge-on plates cannot earn points.
  if (denominator >= -0.2) return null;
  const distance = target.point.clone().sub(origin).dot(normal) / denominator;
  if (distance < 0 || distance > limit) return null;
  const point = direction.clone().multiplyScalar(distance).add(origin);
  const offset = point.clone().sub(target.point);
  const horizontal = offset.dot(
    new Vector3(Math.sin(target.angle), 0, Math.cos(target.angle)),
  );
  const radius = Math.hypot(horizontal / 0.6, offset.y / 0.75);
  if (radius > 1) return null;
  return {
    index: target.index,
    points: radius <= 0.2 ? 10 : radius <= 0.5 ? 5 : radius <= 0.8 ? 2 : 1,
    distance,
    point,
  };
}
export function recordShot(
  trial: Trial,
  hits: TargetHit[],
  now: number,
  addShot = true,
): Trial {
  if (trial.status !== "active" || now < trial.start || now >= trial.end)
    return trial;
  const next = {
    ...trial,
    shots: trial.shots + Number(addShot),
    hits: trial.hits + Number(hits.length > 0),
    damage: [...trial.damage],
    downUntil: [...trial.downUntil],
  };
  for (const hit of hits) {
    if (now < next.downUntil[hit.index]) continue;
    next.score += hit.points;
    next.damage[hit.index]++;
    if (next.damage[hit.index] >= 4) {
      next.destroyed++;
      next.damage[hit.index] = 0;
      next.downUntil[hit.index] = now + 1.5;
    }
  }
  return next;
}
