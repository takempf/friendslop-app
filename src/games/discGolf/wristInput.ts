import { MathUtils } from "three";
import type { InputFrame } from "@/input/actions";

// Deliberately conservative gameplay wrist envelope, not anatomical ROM claims.
export const WRIST_BANK_LIMIT = MathUtils.degToRad(35);
export const WRIST_NOSE_LIMIT = MathUtils.degToRad(20);
export interface WristAngles {
  bank: number;
  nose: number;
}

/** Per-player, per-charge state. Input deltas already include device sensitivity. */
export class DiscWristInput {
  readonly angles: WristAngles = { bank: 0, nose: 0 };
  private entity = -1;
  private charging = false;

  capture(frame: InputFrame, heldId: number): boolean {
    if (heldId < 0 || heldId !== this.entity) {
      this.angles.bank = 0;
      this.angles.nose = 0;
      this.charging = false;
      this.entity = heldId;
    }
    if (heldId < 0) return false;
    const held = frame.buttons.chargeThrow;
    // Consume release-frame motion too: it adjusts the release, never the camera.
    if (!held && !this.charging) return false;
    if (held && !this.charging) {
      this.angles.bank = 0;
      this.angles.nose = 0;
    }
    this.angles.bank += frame.lookYaw;
    this.angles.nose += frame.lookPitch;
    const reach = Math.hypot(
      this.angles.bank / WRIST_BANK_LIMIT,
      this.angles.nose / WRIST_NOSE_LIMIT,
    );
    if (reach > 1) {
      this.angles.bank /= reach;
      this.angles.nose /= reach;
    }
    this.charging = held;
    return true;
  }
}
