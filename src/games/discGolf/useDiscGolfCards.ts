import { useEffect, useState } from "react";
import { useGameSync } from "@/sync/GameSyncProvider";
import { DISC_GOLF_SCOPE, type Scorecard } from "./scoring";
export function useDiscGolfCards() {
  const { sync } = useGameSync();
  const [, update] = useState(0);
  useEffect(() => sync?.world.subscribe(() => update((n) => n + 1)), [sync]);
  return (
    sync?.world.records<Scorecard>(DISC_GOLF_SCOPE) ??
    new Map<number, Scorecard>()
  );
}
