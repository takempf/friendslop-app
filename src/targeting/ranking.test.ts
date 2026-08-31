import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { pickTarget } from "./ranking";
import type { TargetingContext, TargetingConfig } from "./types";

describe("pickTarget ranking", () => {
  let camera: THREE.PerspectiveCamera;
  let ctx: TargetingContext;
  let config: TargetingConfig;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(90, 1.0, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    ctx = {
      camera,
      aspect: 1.0,
      isHoldingBall: false,
      cameraPosition: new THREE.Vector3(0, 0, 0),
    };

    config = {
      aimAssistDiameter: 0.1,
      aimAssistGrabDiameter: 0.15,
      aimAssistSmoothing: 12,
      aimAssistStrength: 0,
      aimAssistPitchStrength: 0,
      showAimAssistCircle: false,
      showTargetDebug: false,
      tiebreakEpsilon: 0.05,
      releaseRadiusMult: 1.25,
    };
  });

  it("returns null for empty candidate set", () => {
    const result = pickTarget([], ctx, config, null);
    expect(result).toBeNull();
  });

  it("picks the candidate closest to screen center", () => {
    const items = [
      {
        candidate: {
          id: "ball:1",
          kind: "basketball",
          point: new THREE.Vector3(0.05, 0, -5),
        },
        diameter: 0.1,
      },
      {
        candidate: {
          id: "ball:2",
          kind: "basketball",
          point: new THREE.Vector3(0.15, 0, -5),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, null);
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("ball:1");
  });

  it("breaks ties within tiebreak epsilon using nearer world distance", () => {
    const items = [
      {
        candidate: {
          id: "far:1",
          kind: "basketball",
          point: new THREE.Vector3(0.01, 0, -10),
        },
        diameter: 0.1,
      },
      {
        candidate: {
          id: "near:2",
          kind: "basketball",
          point: new THREE.Vector3(0.006, 0, -3),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, null);
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("near:2");
  });

  it("rules by screen distance when outside tiebreak epsilon despite world distance", () => {
    const items = [
      {
        candidate: {
          id: "far:center",
          kind: "basketball",
          point: new THREE.Vector3(0, 0, -10),
        },
        diameter: 0.1,
      },
      {
        candidate: {
          id: "near:edge",
          kind: "basketball",
          point: new THREE.Vector3(0.25, 0, -3),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, null);
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("far:center");
  });

  it("retains lock on incumbent target as long as it remains within targeting radius", () => {
    // Incumbent is near edge of circle (x=0.35, z=-5 -> screenX = 0.035, radius = 0.05).
    // Challenger is dead center (x=0.0, z=-5 -> screenX = 0.0).
    // Because incumbent is still inside the targeting radius, lock is preserved!
    const items = [
      {
        candidate: {
          id: "incumbent",
          kind: "basketball",
          point: new THREE.Vector3(0.35, 0, -5),
        },
        diameter: 0.1,
      },
      {
        candidate: {
          id: "challenger",
          kind: "basketball",
          point: new THREE.Vector3(0.0, 0, -5),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, "incumbent");
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("incumbent");
  });

  it("switches to new candidate when incumbent leaves targeting radius", () => {
    // Incumbent is beyond release radius (x=0.7, z=-5 -> screenX = 0.07 > maxRadius 0.0625).
    // Challenger is inside targeting radius (x=0.05, z=-5 -> screenX = 0.005).
    const items = [
      {
        candidate: {
          id: "incumbent",
          kind: "basketball",
          point: new THREE.Vector3(0.7, 0, -5),
        },
        diameter: 0.1,
      },
      {
        candidate: {
          id: "challenger",
          kind: "basketball",
          point: new THREE.Vector3(0.05, 0, -5),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, "incumbent");
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("challenger");
  });

  it("drops the lock when a target leaves the release radius (Schmitt-trigger)", () => {
    const items = [
      {
        candidate: {
          id: "incumbent",
          kind: "basketball",
          point: new THREE.Vector3(0.7, 0, -5),
        },
        diameter: 0.1,
      },
    ];

    const result = pickTarget(items, ctx, config, "incumbent");
    expect(result).toBeNull();
  });

  it("normalizes scores across candidates from providers with different diameters", () => {
    const items = [
      {
        candidate: {
          id: "grab:1",
          kind: "basketball",
          point: new THREE.Vector3(0.6, 0, -5),
        },
        diameter: 0.15,
      }, // screenX = 0.06
      {
        candidate: {
          id: "shot:1",
          kind: "hoop",
          point: new THREE.Vector3(0.45, 0, -5),
        },
        diameter: 0.1,
      }, // screenX = 0.045
    ];

    const result = pickTarget(items, ctx, config, null);
    expect(result).not.toBeNull();
    expect(result?.candidate.id).toBe("grab:1");
  });
});
