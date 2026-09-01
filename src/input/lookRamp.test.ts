import { describe, it, expect } from "vitest";
import {
  advanceRamp,
  rampScale,
  DEFAULT_RAMP_SHAPE,
  type RampShape,
} from "./lookRamp";

describe("lookRamp", () => {
  const shape: RampShape = {
    startScale: 0.6,
    rampTime: 0.2,
    decayTime: 0.1,
    engageThreshold: 0.85,
  };

  it("reaches 1.0 after rampTime of sustained full deflection", () => {
    let progress = 0;
    progress = advanceRamp(progress, 1.0, 0.2, shape);
    expect(progress).toBeCloseTo(1.0, 5);
  });

  it("decays back to 0 on release after decayTime", () => {
    let progress = 1.0;
    progress = advanceRamp(progress, 0, 0.1, shape);
    expect(progress).toBeCloseTo(0, 5);
  });

  it("does not charge on partial deflection below the engage threshold", () => {
    // A deliberate slow tracking motion must not silently accelerate.
    let progress = 0;
    for (let i = 0; i < 40; i++) {
      progress = advanceRamp(progress, 0.25, 0.016, shape);
    }
    expect(progress).toBe(0);
    expect(rampScale(progress, shape)).toBeCloseTo(shape.startScale, 5);
  });

  it("decays when easing off a committed turn, without fully releasing the stick", () => {
    // Whip toward a target at full deflection, then settle onto it at 20%.
    let progress = advanceRamp(0, 1.0, 0.2, shape);
    expect(progress).toBeCloseTo(1.0, 5);

    progress = advanceRamp(progress, 0.2, 0.05, shape);
    expect(progress).toBeCloseTo(0.5, 5);

    progress = advanceRamp(progress, 0.2, 0.05, shape);
    expect(progress).toBe(0);
  });

  it("charges exactly at the engage threshold", () => {
    expect(advanceRamp(0, shape.engageThreshold, 0.1, shape)).toBeCloseTo(
      0.5,
      5,
    );
    expect(advanceRamp(0, shape.engageThreshold - 1e-6, 0.1, shape)).toBe(0);
  });

  it("is dt-invariant across step sizes", () => {
    // Single 0.2s step
    const singleStep = advanceRamp(0, 1.0, 0.2, shape);

    // Twenty 0.01s steps
    let multiStep = 0;
    for (let i = 0; i < 20; i++) {
      multiStep = advanceRamp(multiStep, 1.0, 0.01, shape);
    }

    expect(singleStep).toBeCloseTo(1.0, 5);
    expect(multiStep).toBeCloseTo(singleStep, 5);
  });

  it("never exceeds [0, 1]", () => {
    expect(advanceRamp(1.0, 1.0, 1.0, shape)).toBe(1.0);
    expect(advanceRamp(0, 0, 1.0, shape)).toBe(0);
    expect(advanceRamp(-0.5, 0, 0, shape)).toBe(0);
    expect(advanceRamp(1.5, 1.0, 0, shape)).toBe(1.0);
  });

  it("maps ramp progress to rate scale linearly between startScale and 1.0", () => {
    expect(rampScale(0, shape)).toBeCloseTo(0.6, 5);
    expect(rampScale(0.5, shape)).toBeCloseTo(0.8, 5);
    expect(rampScale(1.0, shape)).toBeCloseTo(1.0, 5);
  });

  it("uses DEFAULT_RAMP_SHAPE when optional shape is omitted", () => {
    const scale = rampScale(0);
    expect(scale).toBeCloseTo(DEFAULT_RAMP_SHAPE.startScale, 5);
  });
});
