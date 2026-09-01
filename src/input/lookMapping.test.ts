import { describe, it, expect } from "vitest";
import {
  mapLookRates,
  PITCH_RATE_RATIO,
  type LookMappingConfig,
} from "./lookMapping";

describe("mapLookRates", () => {
  const baseConfig: LookMappingConfig = {
    sensitivity: 3.0,
    invertY: false,
  };

  it("calculates rates with PITCH_RATE_RATIO applied to pitch", () => {
    const [yawRate, pitchRate] = mapLookRates(1.0, 1.0, 1.0, baseConfig);

    expect(yawRate).toBeCloseTo(3.0, 5);
    expect(pitchRate).toBeCloseTo(3.0 * PITCH_RATE_RATIO, 5);
  });

  it("scales rates proportionally with ramp multiplier", () => {
    const [yawRate, pitchRate] = mapLookRates(1.0, 1.0, 0.6, baseConfig);

    expect(yawRate).toBeCloseTo(1.8, 5);
    expect(pitchRate).toBeCloseTo(1.8 * PITCH_RATE_RATIO, 5);
  });

  it("inverts pitch rate when invertY is enabled", () => {
    const invertConfig: LookMappingConfig = {
      sensitivity: 3.0,
      invertY: true,
    };

    const [, pitchRateNormal] = mapLookRates(0, 1.0, 1.0, baseConfig);
    const [, pitchRateInverted] = mapLookRates(0, 1.0, 1.0, invertConfig);

    expect(pitchRateInverted).toBeCloseTo(-pitchRateNormal, 5);
  });

  it("applies slowdown modulation (1 - slowdown) to both yaw and pitch", () => {
    const [yawFull, pitchFull] = mapLookRates(1.0, 1.0, 1.0, baseConfig, {
      slowdown: 0,
    });
    const [yawSlow, pitchSlow] = mapLookRates(1.0, 1.0, 1.0, baseConfig, {
      slowdown: 0.5,
    });

    expect(yawSlow).toBeCloseTo(yawFull * 0.5, 5);
    expect(pitchSlow).toBeCloseTo(pitchFull * 0.5, 5);
  });

  it("stops look rotation completely when slowdown is 1.0", () => {
    const [yawStop, pitchStop] = mapLookRates(1.0, 1.0, 1.0, baseConfig, {
      slowdown: 1.0,
    });

    expect(yawStop).toBe(0);
    expect(pitchStop).toBe(0);
  });
});
