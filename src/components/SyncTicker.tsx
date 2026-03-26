import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameSync } from "../sync/GameSyncProvider";

const TICK_MS = 50; // 20Hz

export function SyncTicker() {
  const { sync, pendingPresenceRef } = useGameSync();
  const lastTickTime = useRef(0);

  useFrame(() => {
    if (!sync) return;
    const now = performance.now();
    if (now - lastTickTime.current < TICK_MS) return;
    lastTickTime.current = now;

    const pending = pendingPresenceRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingPresenceRef.current = {};
    sync.updateMyPresence(pending);
  });

  return null;
}
