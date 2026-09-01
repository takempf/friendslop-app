import * as THREE from "three";
import type {
  TargetCandidate,
  TargetProvider,
  TargetingContext,
} from "../types";
import {
  HOOP_AIM_POINT,
  BOARD_FRONT_FACE_Z,
  RIM_Y,
  BACKBOARD_SQUARE_WIDTH,
  BACKBOARD_SQUARE_HEIGHT,
} from "@/constants/basketball";
import { gameConfig } from "@/config";

const HALF_SQUARE_WIDTH = BACKBOARD_SQUARE_WIDTH / 2;
const HALF_PI = Math.PI / 2;
const AIM_POINT_Y = RIM_Y + BACKBOARD_SQUARE_HEIGHT;
const AIM_POINT_Z = BOARD_FRONT_FACE_Z - 0.05;

/**
 * Computes the assisted hoop aim point horizontally adjusted based on the player's angle
 * relative to the backboard's outward normal (-90° to 0° to 90°).
 *
 * @param cameraPosition World position of the player/camera.
 * @param out Vector3 into which the computed aim point is written.
 * @returns The computed aim point Vector3.
 */
export function computeHoopAimPoint(
  cameraPosition: THREE.Vector3,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const dx = cameraPosition.x;
  const depth = BOARD_FRONT_FACE_Z - cameraPosition.z;

  // Angle between -PI/2 (-90°) and PI/2 (+90°) relative to the backboard normal
  const angle = Math.atan2(dx, Math.max(0, depth));
  const normalizedAngle = angle / HALF_PI;

  const targetX = normalizedAngle * HALF_SQUARE_WIDTH;

  return out.set(targetX, AIM_POINT_Y, AIM_POINT_Z);
}

export class HoopProvider implements TargetProvider {
  public readonly kind = "hoop";
  private readonly aimPoint = new THREE.Vector3().copy(HOOP_AIM_POINT);

  public get assistDiameter(): number {
    return gameConfig.aimAssistDiameter;
  }

  public isActive(ctx: TargetingContext): boolean {
    return ctx.isHoldingBall;
  }

  public collect(ctx: TargetingContext, out: TargetCandidate[]): void {
    computeHoopAimPoint(ctx.cameraPosition, this.aimPoint);
    out.push({
      id: "hoop",
      kind: this.kind,
      point: this.aimPoint,
    });
  }
}
