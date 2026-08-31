import { describe, it, expect } from "vitest";
import { applyRadialDeadzone, applyResponseCurve } from "./deadzone";

describe("applyRadialDeadzone", () => {
  it("returns [0, 0] below the deadzone", () => {
    expect(applyRadialDeadzone(0, 0, 0.15)).toEqual([0, 0]);
    expect(applyRadialDeadzone(0.05, 0.05, 0.15)).toEqual([0, 0]);
    expect(applyRadialDeadzone(0.1, 0, 0.15)).toEqual([0, 0]);
  });

  it("returns unit vector at full cardinal deflection", () => {
    const [x, y] = applyRadialDeadzone(1, 0, 0.15);
    expect(x).toBeCloseTo(1, 5);
    expect(y).toBeCloseTo(0, 5);

    const [nx, ny] = applyRadialDeadzone(0, -1, 0.15);
    expect(nx).toBeCloseTo(0, 5);
    expect(ny).toBeCloseTo(-1, 5);
  });

  it("is continuous just past the deadzone boundary without snapping", () => {
    const dz = 0.2;
    const eps = 0.001;
    const [x, y] = applyRadialDeadzone(dz + eps, 0, dz);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.01);
    expect(y).toBe(0);
  });

  it("preserves stick direction", () => {
    const rawX = 0.6;
    const rawY = 0.4;
    const [outX, outY] = applyRadialDeadzone(rawX, rawY, 0.15);
    const rawRatio = rawX / rawY;
    const outRatio = outX / outY;
    expect(outRatio).toBeCloseTo(rawRatio, 5);
  });

  it("clamps uncalibrated diagonal deflections exceeding length 1 to 1", () => {
    const [x, y] = applyRadialDeadzone(1, 1, 0.15);
    const len = Math.hypot(x, y);
    expect(len).toBeCloseTo(1, 5);
    expect(x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(y).toBeCloseTo(Math.SQRT1_2, 5);
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
