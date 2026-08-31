import type {
  TargetCandidate,
  TargetingContext,
  TargetingConfig,
  ScoredCandidate,
  ProjectedScreenPoint,
} from "./types";
import { worldToScreen } from "./projection";
import { screenDistance } from "./circle";
import type { OcclusionPredicate } from "./occlusion";

const DEFAULT_TIEBREAK_EPSILON = 0.05;
const DEFAULT_RELEASE_RADIUS_MULT = 1.25;
const DEFAULT_WORLD_TIEBREAK_EPSILON = 0.2; // 20cm depth difference to trigger world distance tiebreak

const _projectedScratch: ProjectedScreenPoint = {
  x: 0,
  y: 0,
  behind: false,
};

export interface CandidateWithRadius {
  candidate: TargetCandidate;
  diameter: number;
}

/**
 * Compares two scored candidates for ranking.
 * Lowest score wins. Within tiebreakEpsilon, the nearer candidate in world space wins if there is a depth difference.
 */
function compareScoredCandidates(
  a: ScoredCandidate,
  b: ScoredCandidate,
  tiebreakEpsilon: number = DEFAULT_TIEBREAK_EPSILON,
  worldTiebreakEpsilon: number = DEFAULT_WORLD_TIEBREAK_EPSILON,
): number {
  const diff = a.score - b.score;
  if (Math.abs(diff) <= tiebreakEpsilon) {
    if (Math.abs(a.worldDistance - b.worldDistance) > worldTiebreakEpsilon) {
      return a.worldDistance - b.worldDistance;
    }
  }
  return diff;
}

/** Reuses the pooled entry at `i`, allocating only when the buffer needs to grow. */
function poolEntry(pool: ScoredCandidate[], i: number): ScoredCandidate {
  const existing = pool[i];
  if (existing) return existing;
  const created: ScoredCandidate = {
    candidate: null as unknown as TargetCandidate,
    screenX: 0,
    screenY: 0,
    score: 0,
    worldDistance: 0,
    occluded: false,
  };
  pool[i] = created;
  return created;
}

/**
 * Evaluates, filters, and ranks candidate targets according to screen-center proximity,
 * lock retention (incumbent target remains locked while within its release radius), and tiebreak criteria.
 *
 * Occluded candidates are scored and reported in `outScored` for the debug HUD, but can
 * never win. `outScored` is reused across calls — treat its entries as valid only until
 * the next call.
 */
export function pickTarget(
  items: CandidateWithRadius[],
  ctx: TargetingContext,
  config: TargetingConfig,
  lockedTargetId: string | null,
  isOccluded?: OcclusionPredicate,
  outScored: ScoredCandidate[] = [],
): ScoredCandidate | null {
  const tiebreakEpsilon = config.tiebreakEpsilon ?? DEFAULT_TIEBREAK_EPSILON;
  const releaseRadiusMult =
    config.releaseRadiusMult ?? DEFAULT_RELEASE_RADIUS_MULT;

  const cameraPosition = ctx.cameraPosition;
  let scoredCount = 0;
  let incumbent: ScoredCandidate | null = null;
  let best: ScoredCandidate | null = null;

  for (let i = 0; i < items.length; i++) {
    const { candidate, diameter } = items[i];
    const radius = diameter * 0.5;
    if (radius <= 0) continue;

    worldToScreen(candidate.point, ctx.camera, ctx.aspect, _projectedScratch);
    if (_projectedScratch.behind) continue;

    const dist = screenDistance(_projectedScratch.x, _projectedScratch.y);
    const isLocked = lockedTargetId !== null && candidate.id === lockedTargetId;

    // Schmitt trigger: a locked target keeps its lock out to a wider release radius.
    if (dist > (isLocked ? radius * releaseRadiusMult : radius)) continue;

    const occluded = isOccluded
      ? isOccluded(cameraPosition, candidate.point)
      : false;

    let score = dist / radius;
    if (candidate.weight !== undefined && candidate.weight > 0) {
      score /= candidate.weight;
    }

    const scored = poolEntry(outScored, scoredCount++);
    scored.candidate = candidate;
    scored.screenX = _projectedScratch.x;
    scored.screenY = _projectedScratch.y;
    scored.score = score;
    scored.worldDistance = candidate.point.distanceTo(cameraPosition);
    scored.occluded = occluded;

    if (occluded) continue;

    if (isLocked) {
      incumbent = scored;
    } else if (
      best === null ||
      compareScoredCandidates(scored, best, tiebreakEpsilon) < 0
    ) {
      best = scored;
    }
  }

  outScored.length = scoredCount;

  // Once locked onto a target, retain the lock until it leaves the release radius.
  return incumbent ?? best;
}
