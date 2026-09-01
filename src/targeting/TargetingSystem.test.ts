import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { TargetingSystem } from "./TargetingSystem";
import type {
  TargetProvider,
  TargetingContext,
  TargetingConfig,
} from "./types";

describe("TargetingSystem", () => {
  let system: TargetingSystem;
  let camera: THREE.PerspectiveCamera;
  let ctx: TargetingContext;
  let config: TargetingConfig;

  beforeEach(() => {
    system = new TargetingSystem();

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
      aimAssistSlowdown: 0.45,
      aimAssistMouseScale: 0,
      aimAssistStrength: 0,
      aimAssistPitchStrength: 0,
      showAimAssistCircle: false,
      showTargetDebug: false,
      tiebreakEpsilon: 0.05,
      releaseRadiusMult: 1.25,
    };
  });

  it("handles provider registration and unregistration", () => {
    const provider: TargetProvider = {
      kind: "test",
      isActive: () => true,
      collect: (_ctx, out) => {
        out.push({
          id: "test:1",
          kind: "test",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    const unreg = system.registerProvider(provider);
    expect(system.getProviders().has(provider)).toBe(true);

    const state = system.update(ctx, config, 0.016);
    expect(state.targetId).toBe("test:1");

    unreg();
    expect(system.getProviders().has(provider)).toBe(false);

    const stateAfter = system.update(ctx, config, 0.016);
    expect(stateAfter.targetId).toBeNull();
  });

  it("swaps active providers when hold state changes", () => {
    const ballProvider: TargetProvider = {
      kind: "basketball",
      isActive: (c) => !c.isHoldingBall,
      collect: (_ctx, out) => {
        out.push({
          id: "ball:0",
          kind: "basketball",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    const hoopProvider: TargetProvider = {
      kind: "hoop",
      isActive: (c) => c.isHoldingBall,
      collect: (_ctx, out) => {
        out.push({
          id: "hoop",
          kind: "hoop",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    system.registerProvider(ballProvider);
    system.registerProvider(hoopProvider);

    // Empty handed
    ctx.isHoldingBall = false;
    let state = system.update(ctx, config, 0.016);
    expect(state.targetId).toBe("ball:0");
    expect(state.targetKind).toBe("basketball");

    // Holding ball -> switches to hoop
    ctx.isHoldingBall = true;
    state = system.update(ctx, config, 0.016);
    expect(state.targetId).toBe("hoop");
    expect(state.targetKind).toBe("hoop");
  });

  it("skips an occluded candidate in favor of the next best candidate", () => {
    const provider: TargetProvider = {
      kind: "mixed",
      isActive: () => true,
      collect: (_ctx, out) => {
        // Candidate 1 is dead center but occluded
        out.push({
          id: "blocked:1",
          kind: "mixed",
          point: new THREE.Vector3(0, 0, -5),
        });
        // Candidate 2 is slightly off center and not occluded
        out.push({
          id: "visible:2",
          kind: "mixed",
          point: new THREE.Vector3(0.05, 0, -5),
        });
      },
    };

    system.registerProvider(provider);

    const isOccluded = (_from: THREE.Vector3, to: THREE.Vector3): boolean => {
      // Block Candidate 1
      return to.x === 0;
    };

    const state = system.update(ctx, config, 0.016, isOccluded);
    expect(state.targetId).toBe("visible:2");
  });

  it("drops the locked target when it becomes occluded", () => {
    let occlude = false;
    const provider: TargetProvider = {
      kind: "test",
      isActive: () => true,
      collect: (_ctx, out) => {
        out.push({
          id: "target:1",
          kind: "test",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    system.registerProvider(provider);

    const isOccluded = () => occlude;

    let state = system.update(ctx, config, 0.016, isOccluded);
    expect(state.targetId).toBe("target:1");
    expect(system.getLockedTargetId()).toBe("target:1");

    // Occlude target on next frame
    occlude = true;
    state = system.update(ctx, config, 0.016, isOccluded);
    expect(state.targetId).toBeNull();
    expect(system.getLockedTargetId()).toBeNull();
  });
  it("clears the lock when the owning provider unregisters, even though ids are not kind-prefixed", () => {
    const provider: TargetProvider = {
      kind: "basketball",
      isActive: () => true,
      collect: (_ctx, out) => {
        out.push({
          id: "ball:3",
          kind: "basketball",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    const unreg = system.registerProvider(provider);
    system.update(ctx, config, 0.016);
    expect(system.getLockedTargetId()).toBe("ball:3");

    unreg();
    expect(system.getLockedTargetId()).toBeNull();
  });

  it("reports occluded candidates for the debug HUD without letting them win", () => {
    const provider: TargetProvider = {
      kind: "test",
      isActive: () => true,
      collect: (_ctx, out) => {
        out.push({
          id: "blocked",
          kind: "test",
          point: new THREE.Vector3(0, 0, -5),
        });
      },
    };

    system.registerProvider(provider);

    const state = system.update(ctx, config, 0.016, () => true);
    expect(state.targetId).toBeNull();

    const scored = system.getScoredCandidates();
    expect(scored).toHaveLength(1);
    expect(scored[0].candidate.id).toBe("blocked");
    expect(scored[0].occluded).toBe(true);
  });
});
