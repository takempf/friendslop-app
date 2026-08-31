import type {
  TargetCandidate,
  TargetProvider,
  TargetingContext,
} from "../types";
import { HOOP_AIM_POINT } from "@/constants/basketball";
import { gameConfig } from "@/config";

export class HoopProvider implements TargetProvider {
  public readonly kind = "hoop";

  public get assistDiameter(): number {
    return gameConfig.aimAssistDiameter;
  }

  public isActive(ctx: TargetingContext): boolean {
    return ctx.isHoldingBall;
  }

  public collect(_ctx: TargetingContext, out: TargetCandidate[]): void {
    out.push({
      id: "hoop",
      kind: this.kind,
      point: HOOP_AIM_POINT,
    });
  }
}
