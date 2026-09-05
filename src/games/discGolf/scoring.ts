import type { ISharedWorld, SessionRecord } from "@/sync/ISharedWorld";
import { HOLES, scoreLabel } from "./course";

export interface DiscShot extends Record<string, unknown> {
  kind: "disc-golf";
  player: number;
  hole: number;
  epoch: string;
  throwId: string;
}
export function readDiscShot(
  data: Record<string, unknown> | undefined,
): DiscShot | undefined {
  if (
    !data ||
    data.kind !== "disc-golf" ||
    !Number.isSafeInteger(data.player) ||
    !Number.isInteger(data.hole) ||
    Number(data.hole) < 0 ||
    Number(data.hole) >= HOLES.length ||
    typeof data.epoch !== "string" ||
    typeof data.throwId !== "string"
  )
    return undefined;
  return data as DiscShot;
}

export const DISC_GOLF_SCOPE = "disc-golf";
export interface Scorecard extends SessionRecord {
  name: string;
  hole: number;
  strokes: number;
  completed: number[];
  lastThrow: string;
  message: string;
}
export function beginThrow(
  world: ISharedWorld,
  player: number,
  name: string,
): DiscShot | undefined {
  const old = world.records<Scorecard>(DISC_GOLF_SCOPE).get(player);
  if (old && old.hole >= HOLES.length) return undefined;
  const hole = old?.hole ?? 0;
  const throwId = crypto.randomUUID();
  world.setRecord(DISC_GOLF_SCOPE, player, {
    name,
    hole,
    strokes: (old?.strokes ?? 0) + 1,
    completed: old?.completed ?? [],
    lastThrow: throwId,
    message: `Hole ${hole + 1} · Throw ${(old?.strokes ?? 0) + 1}`,
  });
  return {
    kind: "disc-golf",
    player,
    hole,
    epoch: world.epoch(DISC_GOLF_SCOPE),
    throwId,
  };
}
export function completeHole(
  world: ISharedWorld,
  shot: DiscShot,
  basket: number,
): boolean {
  if (shot.epoch !== world.epoch(DISC_GOLF_SCOPE) || shot.hole !== basket)
    return false;
  const card = world.records<Scorecard>(DISC_GOLF_SCOPE).get(shot.player);
  if (
    !card ||
    card.hole !== basket ||
    card.lastThrow !== shot.throwId ||
    card.strokes < 1
  )
    return false;
  const completed = [...card.completed, card.strokes];
  world.setRecord(DISC_GOLF_SCOPE, shot.player, {
    ...card,
    completed,
    hole: basket + 1,
    strokes: 0,
    message: `Hole ${basket + 1}: ${scoreLabel(card.strokes, HOLES[basket].par)} · ${card.strokes} ${card.strokes === 1 ? "throw" : "throws"}${basket === 5 ? " · ROUND COMPLETE" : ` · Next: tee ${basket + 2}`}`,
  });
  return true;
}
