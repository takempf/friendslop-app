import {
  TARGET_KINDS,
  type TargetCandidate,
  type TargetProvider,
  type TargetingContext,
} from "../types";
import { INTERACTION_RANGE, RESET_BUTTON_POS } from "@/constants/basketball";

export class ResetButtonProvider implements TargetProvider {
  public readonly kind = TARGET_KINDS.resetButton;

  public isActive(ctx: TargetingContext): boolean {
    return !ctx.isHoldingEquipment;
  }

  public collect(ctx: TargetingContext, out: TargetCandidate[]): void {
    if (RESET_BUTTON_POS.distanceTo(ctx.cameraPosition) <= INTERACTION_RANGE) {
      out.push({
        id: "button:reset",
        kind: this.kind,
        point: RESET_BUTTON_POS,
      });
    }
  }
}
