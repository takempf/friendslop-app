import { describe, it, expect } from "vitest";
import { resolveSlowdown, resolveAssistStrengths } from "./assistPolicy";

describe("resolveSlowdown", () => {
  const config = { aimAssistSlowdown: 0.45 };

  it("applies slowdown proportional to lock when target is hoop", () => {
    expect(
      resolveSlowdown({ targetKind: "hoop", lock: 1.0 }, config),
    ).toBeCloseTo(0.45, 5);
    expect(
      resolveSlowdown({ targetKind: "hoop", lock: 0.5 }, config),
    ).toBeCloseTo(0.225, 5);
  });

  it("returns 0 for non-hoop targets or when lock is 0", () => {
    expect(
      resolveSlowdown({ targetKind: "basketball", lock: 1.0 }, config),
    ).toBe(0);
    expect(
      resolveSlowdown({ targetKind: "resetButton", lock: 1.0 }, config),
    ).toBe(0);
    expect(resolveSlowdown({ targetKind: null, lock: 1.0 }, config)).toBe(0);
    expect(resolveSlowdown({ targetKind: "hoop", lock: 0 }, config)).toBe(0);
  });

  it("clamps slowdown between 0 and 1", () => {
    expect(
      resolveSlowdown(
        { targetKind: "hoop", lock: 1.0 },
        {
          aimAssistSlowdown: 1.5,
        },
      ),
    ).toBe(1.0);
    expect(resolveSlowdown({ targetKind: "hoop", lock: -0.5 }, config)).toBe(0);
  });
});

describe("resolveAssistStrengths", () => {
  const config = {
    aimAssistStrength: 0.5,
    aimAssistPitchStrength: 0.2,
    aimAssistMouseScale: 0,
  };

  it("returns full assist strengths for gamepad", () => {
    const strengths = resolveAssistStrengths("gamepad", config);
    expect(strengths.yaw).toBeCloseTo(0.5, 5);
    expect(strengths.pitch).toBeCloseTo(0.2, 5);
  });

  it("returns zero assist for keyboard when mouse scale is 0", () => {
    const strengths = resolveAssistStrengths("keyboard", config);
    expect(strengths.yaw).toBe(0);
    expect(strengths.pitch).toBe(0);
  });

  it("scales assist for keyboard by aimAssistMouseScale when configured", () => {
    const strengths = resolveAssistStrengths("keyboard", {
      ...config,
      aimAssistMouseScale: 0.5,
    });
    expect(strengths.yaw).toBeCloseTo(0.25, 5);
    expect(strengths.pitch).toBeCloseTo(0.1, 5);
  });
});
