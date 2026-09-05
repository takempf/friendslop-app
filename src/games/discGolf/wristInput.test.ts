import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { createEmptyFrame } from "@/input/actions";
import {
  DiscWristInput,
  WRIST_BANK_LIMIT,
  WRIST_NOSE_LIMIT,
} from "./wristInput";
import {
  discHoldPose,
  discReleaseSpin,
  DISC_CHARGE_SECONDS,
} from "./throwMotion";
import { discAcceleration } from "./flight";

function motion(held: boolean, yaw = 0, pitch = 0) {
  const frame = createEmptyFrame();
  frame.buttons.chargeThrow = held;
  frame.lookYaw = yaw;
  frame.lookPitch = pitch;
  return frame;
}
describe("charging wrist input", () => {
  it("leaves ordinary look alone until a disc is charging", () => {
    const wrist = new DiscWristInput();
    expect(wrist.capture(motion(false, 0.2, 0.1), 12)).toBe(false);
    expect(wrist.capture(motion(true, 0.2, 0.1), -1)).toBe(false);
    expect(wrist.angles).toEqual({ bank: 0, nose: 0 });
  });
  it("captures horizontal bank and vertical nose inputs without mutating movement or aim", () => {
    const wrist = new DiscWristInput();
    const frame = motion(true, -0.2, 0.1);
    frame.moveX = 1;
    frame.buttons.aim = true;
    const original = structuredClone(frame);
    expect(wrist.capture(frame, 12)).toBe(true);
    expect(wrist.angles).toEqual({ bank: -0.2, nose: 0.1 });
    expect(frame).toEqual(original);
  });
  it("consumes final mouse movement on release and restores camera input afterward", () => {
    const wrist = new DiscWristInput();
    wrist.capture(motion(true, 0.1, 0), 12);
    expect(wrist.capture(motion(false, 0.1, 0.05), 12)).toBe(true);
    expect(wrist.angles).toEqual({ bank: 0.2, nose: 0.05 });
    expect(wrist.capture(motion(false, 0.5, 0.5), -1)).toBe(false);
    expect(wrist.angles).toEqual({ bank: 0, nose: 0 });
  });
  it("clears wrist offsets after cancellation, changing discs, and a new charge", () => {
    const wrist = new DiscWristInput();
    wrist.capture(motion(true, 0.3, 0.1), 12);
    wrist.capture(motion(false), -1);
    wrist.capture(motion(true), 12);
    expect(wrist.angles).toEqual({ bank: 0, nose: 0 });
    wrist.capture(motion(true, 0.3, 0.1), 12);
    wrist.capture(motion(true), 13);
    expect(wrist.angles).toEqual({ bank: 0, nose: 0 });
    wrist.capture(motion(true, 0.3, 0.1), 13);
    wrist.capture(motion(false), 13);
    wrist.capture(motion(true), 13);
    expect(wrist.angles).toEqual({ bank: 0, nose: 0 });
  });
  it("bounds extreme diagonal input and allows moving away from the stop immediately", () => {
    const wrist = new DiscWristInput();
    wrist.capture(motion(true, 100, 100), 12);
    expect(
      Math.hypot(
        wrist.angles.bank / WRIST_BANK_LIMIT,
        wrist.angles.nose / WRIST_NOSE_LIMIT,
      ),
    ).toBeCloseTo(1);
    const old = { ...wrist.angles };
    wrist.capture(motion(true, -0.01, -0.01), 12);
    expect(wrist.angles.bank).toBeLessThan(old.bank);
    expect(wrist.angles.nose).toBeLessThan(old.nose);
  });
  it("keeps the final animated orientation inside the combined wrist limits", () => {
    const camera = new PerspectiveCamera();
    for (const bank of [-100, 100])
      for (const nose of [-100, 100]) {
        const rotation = new Quaternion();
        discHoldPose(camera, DISC_CHARGE_SECONDS, new Vector3(), rotation, {
          bank,
          nose,
        });
        const normal = new Vector3(0, 1, 0).applyQuaternion(rotation);
        const actualBank = Math.atan2(-normal.x, normal.y);
        const actualNose = Math.asin(normal.z);
        expect(
          Math.hypot(
            actualBank / WRIST_BANK_LIMIT,
            actualNose / WRIST_NOSE_LIMIT,
          ),
        ).toBeLessThanOrEqual(1.000001);
      }
  });
  it("lets opposite wrist banks produce opposite flight curvature without changing aim", () => {
    const direction = new Vector3(0, 0, -20);
    const camera = new PerspectiveCamera();
    const acceleration = (bank: number) => {
      const q = new Quaternion();
      discHoldPose(camera, DISC_CHARGE_SECONDS, new Vector3(), q, {
        bank,
        nose: -0.12,
      });
      return discAcceleration(
        direction,
        q,
        discReleaseSpin(q, 1, new Vector3()),
      );
    };
    expect(acceleration(0.3).x).toBeLessThan(0);
    expect(acceleration(-0.3).x).toBeGreaterThan(0);
    expect(direction.toArray()).toEqual([0, 0, -20]);
  });
});
