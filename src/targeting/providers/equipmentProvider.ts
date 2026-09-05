import { EQUIPMENT_COUNT } from "@/gameplay/equipment";
import * as THREE from "three";
import {
  TARGET_KINDS,
  type TargetCandidate,
  type TargetProvider,
  type TargetingContext,
} from "../types";
import { INTERACTION_RANGE } from "@/constants/basketball";
import { gameConfig } from "@/config";
import type { RapierRigidBody } from "@react-three/rapier";

/** Ball world positions and ids, allocated once — candidates are rebuilt every frame. */
const _ballPoints: THREE.Vector3[] = Array.from(
  { length: EQUIPMENT_COUNT },
  () => new THREE.Vector3(),
);
const BALL_IDS: string[] = Array.from(
  { length: EQUIPMENT_COUNT },
  (_, i) => `equipment:${i}`,
);

/** Window during which a just-thrown ball cannot be re-grabbed. */
const RETHROW_LOCKOUT_MS = 250;

export interface EquipmentProviderOptions {
  bodyRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;
}

export class EquipmentProvider implements TargetProvider {
  public readonly kind = TARGET_KINDS.equipment;

  private bodyRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  private lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;

  constructor(options: EquipmentProviderOptions) {
    this.bodyRefs = options.bodyRefs;
    this.lastThrowRef = options.lastThrowRef;
  }

  public get assistDiameter(): number {
    return gameConfig.aimAssistGrabDiameter;
  }

  public isActive(ctx: TargetingContext): boolean {
    return !ctx.isHoldingEquipment;
  }

  public collect(ctx: TargetingContext, out: TargetCandidate[]): void {
    const balls = this.bodyRefs.current;
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
