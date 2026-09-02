import type { AimState } from "./types";

/**
 * Mutable singleton holding the current frame's aim result.
 * Written once per frame by TargetingSystem; read by the HUD and by gameplay.
 */
export const aimState: AimState = {
  screenX: 0,
  screenY: 0,
  targetId: null,
  targetKind: null,
  targetIndex: -1,
  targetPoint: null,
  lock: 0,
  isManualAiming: false,
};
