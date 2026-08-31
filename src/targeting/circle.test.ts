import { describe, it, expect } from "vitest";
import { screenDistance } from "./circle";

describe("circle math", () => {
  it("calculates Euclidean distance in height-relative units", () => {
    expect(screenDistance(0.03, 0.04)).toBeCloseTo(0.05, 6);
    expect(screenDistance(0, 0)).toBe(0);
    expect(screenDistance(-0.06, 0.08)).toBeCloseTo(0.1, 6);
  });
});
