import {
  WRIST_BANK_LIMIT,
  WRIST_NOSE_LIMIT,
  type WristAngles,
} from "./wristInput";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Camera } from "three";

export const DISC_CHARGE_SECONDS = 2.5;
const pitch = new Quaternion(),
  bank = new Quaternion(),
  wrist = new Quaternion();
const xAxis = new Vector3(1, 0, 0),
  yAxis = new Vector3(0, 1, 0),
  zAxis = new Vector3(0, 0, 1);

/** The exact clamped angles shared by the held pose, release, and HUD. */
export function resolveDiscWristAngles(
  chargeSeconds: number,
  adjustment?: WristAngles,
): WristAngles {
  const progress = MathUtils.clamp(chargeSeconds / DISC_CHARGE_SECONDS, 0, 1);
  const t = progress * progress * (3 - 2 * progress);
  let bankAngle = 0.04 + 0.08 * t + (adjustment?.bank ?? 0);
  let noseAngle = 0.06 + 0.06 * t + (adjustment?.nose ?? 0);
  // Clamp the final orientation, including the animated wind-up's base angles.
  const reach = Math.hypot(
    bankAngle / WRIST_BANK_LIMIT,
    noseAngle / WRIST_NOSE_LIMIT,
  );
  if (reach > 1) {
    bankAngle /= reach;
    noseAngle /= reach;
  }
  return { bank: bankAngle, nose: noseAngle };
}

/** Right-handed backhand reach-back: across the chest toward the left,
 * with the outside edge lowered and the wrist cocked as power builds. */
export function discHoldPose(
  camera: Camera,
  chargeSeconds: number,
  position: Vector3,
  rotation: Quaternion,
  adjustment?: WristAngles,
): void {
  const progress = MathUtils.clamp(chargeSeconds / DISC_CHARGE_SECONDS, 0, 1);
  const t = progress * progress * (3 - 2 * progress);
  // Horizontal shoulder/elbow sweep, rather than interpolating a straight line.
  // Pivot is to the right of the chest; the hand travels left and inward.
  const sweep = 0.85 * t;
  position
    .set(
      0.25 - 0.25 * Math.cos(sweep) - 0.69 * Math.sin(sweep),
      -0.36 + 0.1 * Math.sin(sweep),
      -0.16 + 0.25 * Math.sin(sweep) - 0.69 * Math.cos(sweep),
    )
    .applyQuaternion(camera.quaternion)
    .add(camera.position);
  const angles = resolveDiscWristAngles(chargeSeconds, adjustment);
  const bankAngle = angles.bank,
    noseAngle = angles.nose;
  bank.setFromAxisAngle(zAxis, bankAngle);
  pitch.setFromAxisAngle(xAxis, noseAngle);
  wrist.setFromAxisAngle(yAxis, -0.95 * t);
  rotation
    .copy(camera.quaternion)
    .multiply(bank)
    .multiply(pitch)
    .multiply(wrist);
}

/** Clockwise viewed from above, around the actual tilted disc normal. */
export function discReleaseSpin(
  rotation: Quaternion,
  chargeRatio: number,
  out: Vector3,
): Vector3 {
  return out
    .set(0, -(16 + 36 * MathUtils.clamp(chargeRatio, 0, 1)), 0)
    .applyQuaternion(rotation);
}
