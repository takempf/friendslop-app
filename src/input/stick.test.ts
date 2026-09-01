import { describe, it, expect } from "vitest";
import {
  shapeStick,
  applyResponseCurve,
  STICK_SATURATION,
  type StickShape,
} from "./stick";

describe("shapeStick", () => {
  const standardShape: StickShape = {
    deadzone: 0.15,
    saturation: STICK_SATURATION,
    curve: 1.6,
  };

  it("returns [0, 0] below the deadzone", () => {
    expect(shapeStick(0, 0, standardShape)).toEqual([0, 0]);
    expect(shapeStick(0.05, 0.05, standardShape)).toEqual([0, 0]);
    expect(shapeStick(0.14, 0, standardShape)).toEqual([0, 0]);
  });

  it("preserves stick direction at 18°, 45°, and 70° across various curve exponents", () => {
    const anglesDeg = [18, 45, 70];
    const curves = [1.0, 1.6, 2.0, 2.5];

    for (const angleDeg of anglesDeg) {
      const rad = (angleDeg * Math.PI) / 180;
      const rawX = Math.cos(rad) * 0.7;
      const rawY = Math.sin(rad) * 0.7;
      const expectedAngle = Math.atan2(rawY, rawX);

      for (const curve of curves) {
        const [outX, outY] = shapeStick(rawX, rawY, {
          deadzone: 0.15,
          saturation: 0.95,
          curve,
        });
        const outAngle = Math.atan2(outY, outX);

        expect(outAngle).toBeCloseTo(expectedAngle, 5);
      }
    }
  });

  it("reaches magnitude 1.0 at full cardinal and diagonal deflections at or above saturation", () => {
    // Cardinal X
    const [cardX, cardY] = shapeStick(1.0, 0, standardShape);
    expect(cardX).toBeCloseTo(1.0, 5);
    expect(cardY).toBeCloseTo(0, 5);

    // Cardinal Y
    const [cardYx, cardYy] = shapeStick(0, -1.0, standardShape);
    expect(cardYx).toBeCloseTo(0, 5);
    expect(cardYy).toBeCloseTo(-1.0, 5);

    // Diagonal (hypot > saturation)
    const [diagX, diagY] = shapeStick(0.7071, 0.7071, standardShape);
    const diagMag = Math.hypot(diagX, diagY);
    expect(diagMag).toBeCloseTo(1.0, 5);
  });

  it("is continuous just past the deadzone boundary without snapping", () => {
    const dz = 0.15;
    const eps = 0.001;
    const [x, y] = shapeStick(dz + eps, 0, {
      deadzone: dz,
      saturation: 0.95,
      curve: 1.6,
    });
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.01);
    expect(y).toBe(0);
  });

  it("is monotonic from deadzone to saturation", () => {
    const dz = 0.15;
    const sat = 0.95;
    const steps = 20;
    let prevMag = 0;

    for (let i = 0; i <= steps; i++) {
      const r = dz + ((sat - dz) * i) / steps;
      const [x, y] = shapeStick(r, 0, standardShape);
      const mag = Math.hypot(x, y);
      expect(mag).toBeGreaterThanOrEqual(prevMag);
      prevMag = mag;
    }
    expect(prevMag).toBeCloseTo(1.0, 5);
  });
});

describe("applyResponseCurve", () => {
  it("satisfies f(0) = 0 and f(1) = 1 and f(-1) = -1", () => {
    expect(applyResponseCurve(0, 2)).toBe(0);
    expect(applyResponseCurve(1, 2)).toBe(1);
    expect(applyResponseCurve(-1, 2)).toBe(-1);
  });

  it("is monotonic across [-1, 1]", () => {
    const exponent = 2.0;
    const samples = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    const outputs = samples.map((s) => applyResponseCurve(s, exponent));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
    }
  });

  it("provides finer control near center for exponent > 1", () => {
    const linear = 0.5;
    const curved = applyResponseCurve(0.5, 2.0);
    expect(curved).toBe(0.25);
    expect(curved).toBeLessThan(linear);
  });
});
