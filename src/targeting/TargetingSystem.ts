import * as THREE from "three";
import type {
  TargetCandidate,
  TargetProvider,
  TargetingContext,
  TargetingConfig,
  AimState,
  ScoredCandidate,
} from "./types";
import { pickTarget, type CandidateWithRadius } from "./ranking";
import { aimState } from "./aimState";
import type { OcclusionPredicate } from "./occlusion";

interface LockedTarget {
  id: string;
  kind: string;
}

export class TargetingSystem {
  private providers: Set<TargetProvider> = new Set();
  private lockedTarget: LockedTarget | null = null;

  // Scratch buffers reused across frames so the steady-state loop stays allocation-free.
  private candidatesScratch: TargetCandidate[] = [];
  private itemsScratch: CandidateWithRadius[] = [];
  private scoredScratch: ScoredCandidate[] = [];
  private targetPointScratch: THREE.Vector3 = new THREE.Vector3();

  public registerProvider(provider: TargetProvider): () => void {
    this.providers.add(provider);
    return () => {
      this.unregisterProvider(provider);
    };
  }

  public unregisterProvider(provider: TargetProvider): void {
    this.providers.delete(provider);
    if (this.lockedTarget?.kind === provider.kind) {
      this.lockedTarget = null;
    }
  }

  public getProviders(): ReadonlySet<TargetProvider> {
    return this.providers;
  }

  public getLockedTargetId(): string | null {
    return this.lockedTarget?.id ?? null;
  }

  /** Scored candidates from the last update, occluded ones included. Debug HUD only. */
  public getScoredCandidates(): readonly ScoredCandidate[] {
    return this.scoredScratch;
  }

  /**
   * Runs the targeting pipeline:
   * gather -> project -> filter -> rank -> smooth
   */
  public update(
    ctx: TargetingContext,
    config: TargetingConfig,
    dt: number,
    isOccluded?: OcclusionPredicate,
  ): AimState {
    // 1. Gather candidates from active providers, stamping each with its provider's circle size.
    let itemCount = 0;
    for (const provider of this.providers) {
      if (!provider.isActive(ctx)) continue;

      const startIndex = this.candidatesScratch.length;
      provider.collect(ctx, this.candidatesScratch);
      const diameter = provider.assistDiameter ?? config.aimAssistDiameter;

      for (let i = startIndex; i < this.candidatesScratch.length; i++) {
        const item = (this.itemsScratch[itemCount] ??= {
          candidate: this.candidatesScratch[i],
          diameter,
        });
        item.candidate = this.candidatesScratch[i];
        item.diameter = diameter;
        itemCount++;
      }
    }
    this.itemsScratch.length = itemCount;
    this.candidatesScratch.length = 0;

    // 2-4. Project, filter, and rank.
    const winner = pickTarget(
      this.itemsScratch,
      ctx,
      config,
      this.lockedTarget?.id ?? null,
      isOccluded,
      this.scoredScratch,
    );

    // 5. Smooth.
    const smoothing = config.aimAssistSmoothing;

    if (winner) {
      const { id, kind, index, point } = winner.candidate;
      this.lockedTarget = { id, kind };
      aimState.targetId = id;
      aimState.targetKind = kind;
      aimState.targetIndex = index ?? -1;
      aimState.targetPoint = this.targetPointScratch.copy(point);

      // Lock position directly onto the target so it sticks without lagging behind camera motion
      aimState.screenX = winner.screenX;
      aimState.screenY = winner.screenY;
      aimState.lock = THREE.MathUtils.damp(aimState.lock, 1, smoothing, dt);
    } else {
      this.lockedTarget = null;
      aimState.targetId = null;
      aimState.targetKind = null;
      aimState.targetIndex = -1;
      aimState.targetPoint = null;

      // When no target is locked, smoothly ease reticle back to center
      aimState.screenX = THREE.MathUtils.damp(
        aimState.screenX,
        0,
        smoothing,
        dt,
      );
      aimState.screenY = THREE.MathUtils.damp(
        aimState.screenY,
        0,
        smoothing,
        dt,
      );
      aimState.lock = THREE.MathUtils.damp(aimState.lock, 0, smoothing, dt);
    }

    return aimState;
  }
}

export const targetingSystem = new TargetingSystem();
