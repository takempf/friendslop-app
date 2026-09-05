// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { gameConfig, updateConfig, subscribeToConfig } from "@/config";
import { ditherVert, fragDither } from "@/components/3d/Dither/ditherShader";

describe("dither configuration & shader", () => {
  beforeEach(() => {
    localStorage.clear();
    updateConfig("ditherEnabled", true);
  });

  it("defaults ditherEnabled to true", () => {
    expect(gameConfig.ditherEnabled).toBe(true);
  });

  it("updates ditherEnabled and notifies subscribers", () => {
    const subscriber = vi.fn();
    const unsub = subscribeToConfig(subscriber);

    updateConfig("ditherEnabled", false);
    expect(gameConfig.ditherEnabled).toBe(false);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("friendslop_graphics_ditherEnabled")).toBe(
      "false",
    );

    updateConfig("ditherEnabled", true);
    expect(gameConfig.ditherEnabled).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("friendslop_graphics_ditherEnabled")).toBe(
      "true",
    );

    unsub();
  });

  it("exports valid dither GLSL vertex and fragment shaders", () => {
    expect(typeof ditherVert).toBe("string");
    expect(typeof fragDither).toBe("string");
    expect(fragDither).toContain("applyDither");
    expect(fragDither).toContain("ps1Offset");
    expect(fragDither).toContain("ditherEnabled");
    expect(fragDither).toContain("toLinear");
    expect(fragDither).toContain("applyFXAA");
  });
});
