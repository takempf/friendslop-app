import type { EntitySnapshot } from "@/sync/IGameSync";

export type OwnedSnapshot = EntitySnapshot & { ownerId: number };

/** Lamport ownership epoch + peer id resolves simultaneous grabs identically.
 * Sequence prevents delayed motion packets from reversing time within an epoch. */
export function compareSnapshots(a: OwnedSnapshot, b: OwnedSnapshot): number {
  return (
    (a.ownerVersion ?? 0) - (b.ownerVersion ?? 0) ||
    a.ownerId - b.ownerId ||
    (a.sequence ?? 0) - (b.sequence ?? 0)
  );
}

export function validSnapshot(value: unknown): value is EntitySnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as EntitySnapshot;
  return (
    [s.pos, s.rot, s.vel, s.angvel].every(
      (v, i) =>
        Array.isArray(v) &&
        v.length === (i === 1 ? 4 : 3) &&
        v.every(Number.isFinite),
    ) &&
    Number.isSafeInteger(s.ownerVersion) &&
    (s.ownerVersion ?? -1) >= 0 &&
    Number.isSafeInteger(s.sequence) &&
    (s.sequence ?? -1) >= 0 &&
    (s.gameData === undefined ||
      (s.gameData !== null &&
        typeof s.gameData === "object" &&
        !Array.isArray(s.gameData)))
  );
}
