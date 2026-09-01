import * as THREE from "three";
import {
  TARGET_KINDS,
  type TargetCandidate,
  type TargetProvider,
  type TargetingContext,
} from "../types";
import { INTERACTION_RANGE, BALL_COUNT } from "@/constants/basketball";
import { gameConfig } from "@/config";
import type { RapierRigidBody } from "@react-three/rapier";

/** Ball world positions and ids, allocated once — candidates are rebuilt every frame. */
const _ballPoints: THREE.Vector3[] = Array.from(
  { length: BALL_COUNT },
  () => new THREE.Vector3(),
);
const BALL_IDS: string[] = Array.from(
  { length: BALL_COUNT },
  (_, i) => `ball:${i}`,
);

/** Window during which a just-thrown ball cannot be re-grabbed. */
const RETHROW_LOCKOUT_MS = 250;

export interface BasketballProviderOptions {
  ballRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;
}

export class BasketballProvider implements TargetProvider {
  public readonly kind = TARGET_KINDS.basketball;

  private ballRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  private lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;

  constructor(options: BasketballProviderOptions) {
    this.ballRefs = options.ballRefs;
    this.lastThrowRef = options.lastThrowRef;
  }

  public get assistDiameter(): number {
    return gameConfig.aimAssistGrabDiameter;
  }

  public isActive(ctx: TargetingContext): boolean {
    return !ctx.isHoldingBall;
  }

  public collect(ctx: TargetingContext, out: TargetCandidate[]): void {
    const balls = this.ballRefs.current;
    const lastThrow = this.lastThrowRef.current;
    const now = performance.now();

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball) continue;
      if (i === lastThrow.idx && now - lastThrow.time < RETHROW_LOCKOUT_MS) {
        continue;
      }

      const p = ball.translation();
      const point = _ballPoints[i].set(p.x, p.y, p.z);

      if (point.distanceTo(ctx.cameraPosition) <= INTERACTION_RANGE) {
        out.push({
          id: BALL_IDS[i],
          kind: this.kind,
          point,
          index: i,
        });
      }
    }
  }
}
