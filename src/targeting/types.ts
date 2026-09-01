import type * as THREE from "three";

/** One thing the player could be aiming at, this frame. */
export interface TargetCandidate {
  /** Stable identity across frames — required for hysteresis. e.g. "ball:3", "hoop", "button:reset". */
  id: string;
  /** Provider that emitted it, so consumers can filter by kind. */
  kind: string;
  /** World-space point the reticle should converge on (ball geometry center, rim center, …). */
  point: THREE.Vector3;
  /** Provider-local numeric handle (e.g. ball index), so consumers need not parse `id`. */
  index?: number;
  /** Optional per-candidate priority bump applied before ranking. */
  weight?: number;
}

export interface TargetingContext {
  camera: THREE.Camera;
  aspect: number;
  isHoldingBall: boolean;
  /** Camera/eye world position, resolved once per frame and shared by every stage. */
  cameraPosition: THREE.Vector3;
}

export interface TargetProvider {
  readonly kind: string;
  /** Assist circle diameter for this provider's candidates, as a fraction of
   *  viewport height. Falls back to `gameConfig.aimAssistDiameter` when omitted. */
  readonly assistDiameter?: number;
  /** Whether this provider contributes candidates at all this frame. */
  isActive(ctx: TargetingContext): boolean;
  /** Called once per frame. Push into `out`. */
  collect(ctx: TargetingContext, out: TargetCandidate[]): void;
}

export interface AimState {
  /** Reticle circle position, height-relative normalized, smoothed. */
  screenX: number;
  screenY: number;
  /** The current locked target, or null. */
  targetId: string | null;
  targetKind: string | null;
  /** Provider-local handle of the locked target, or -1. */
  targetIndex: number;
  /** World point of the current target — what gameplay aims at. */
  targetPoint: THREE.Vector3 | null;
  /** 0..1 — how converged the circle is on the target. Drives HUD emphasis. */
  lock: number;
}

export interface TargetingConfig {
  aimAssistDiameter: number;
  aimAssistGrabDiameter?: number;
  aimAssistSmoothing: number;
  aimAssistSlowdown: number;
  aimAssistMouseScale: number;
  aimAssistStrength: number;
  aimAssistPitchStrength: number;
  showAimAssistCircle: boolean;
  showTargetDebug: boolean;
  tiebreakEpsilon?: number;
  releaseRadiusMult?: number;
}

export interface ProjectedScreenPoint {
  x: number;
  y: number;
  behind: boolean;
}

export interface ScoredCandidate {
  candidate: TargetCandidate;
  screenX: number;
  screenY: number;
  score: number;
  worldDistance: number;
  /** Considered but rejected for line-of-sight — retained so the debug HUD can show it. */
  occluded: boolean;
}
