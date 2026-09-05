import { MathUtils } from "three";
import type { WristAngles } from "./wristInput";
import { WRIST_BANK_LIMIT, WRIST_NOSE_LIMIT } from "./wristInput";

export interface WristIndicatorSnapshot {
  bank: number;
  nose: number;
  x: number;
  y: number;
  atLimit: boolean;
}
let snapshot: WristIndicatorSnapshot | null = null;
const listeners = new Set<() => void>();
export const wristIndicatorState = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  publish(angles: WristAngles | null) {
    const next = angles
      ? {
          bank: Math.round(MathUtils.radToDeg(angles.bank)),
          nose: Math.round(MathUtils.radToDeg(angles.nose)),
          x: Math.round((-angles.bank / WRIST_BANK_LIMIT) * 64),
          y: Math.round((-angles.nose / WRIST_NOSE_LIMIT) * 40),
          atLimit:
            Math.hypot(
              angles.bank / WRIST_BANK_LIMIT,
              angles.nose / WRIST_NOSE_LIMIT,
            ) >= 0.98,
        }
      : null;
    // React only updates for visible pixel/degree changes, not every render tick.
    if (
      snapshot === next ||
      (snapshot &&
        next &&
        snapshot.bank === next.bank &&
        snapshot.nose === next.nose &&
        snapshot.x === next.x &&
        snapshot.y === next.y &&
        snapshot.atLimit === next.atLimit)
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  },
};
