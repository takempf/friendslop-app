import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { TargetingSystem } from "./TargetingSystem";
import { aimState } from "./aimState";
import { screenToWorldDirection } from "./screenRay";
import type {
  TargetingContext,
  TargetingConfig,
  TargetProvider,
  TargetCandidate,
} from "./types";
import { TARGET_KINDS } from "./types";

function createMockCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  camera.position.set(0, 1.6, 0);
  camera.quaternion.set(0, 0, 0, 1);
  camera.updateMatrixWorld();
  return camera;
}

const mockConfig: TargetingConfig = {
  aimAssistDiameter: 0.25,
  aimAssistSmoothing: 12,
  aimAssistSlowdown: 0.45,
  aimAssistMouseScale: 0,
  aimAssistStrength: 0.5,
  aimAssistPitchStrength: 0.2,
  showAimAssistCircle: false,
  showTargetDebug: false,
};

function createContext(
  overrides: Partial<TargetingContext> = {},
): TargetingContext {
  const camera = createMockCamera();
  return {
    camera,
    aspect: 16 / 9,
    isHoldingBall: true,
    cameraPosition: camera.position,
    ...overrides,
  };
}

/** A provider that always offers one candidate dead ahead. */
function createStubProvider(collectSpy: () => void): TargetProvider {
  return {
    kind: TARGET_KINDS.hoop,
    isActive: () => true,
    collect: (_ctx: TargetingContext, out: TargetCandidate[]) => {
      collectSpy();
      out.push({
        id: "hoop-0",
        kind: TARGET_KINDS.hoop,
        index: 0,
        point: new THREE.Vector3(0, 1.6, -5),
      });
    },
  } as unknown as TargetProvider;
}

describe("Manual Aiming Mode", () => {
  beforeEach(() => {
    // aimState is a shared mutable singleton; tests must not inherit each other.
    aimState.screenX = 0;
    aimState.screenY = 0;
    aimState.lock = 0;
    aimState.targetId = null;
    aimState.targetKind = null;
    aimState.targetIndex = -1;
    aimState.targetPoint = null;
    aimState.isManualAiming = false;
  });

  it("mirrors ctx.isManualAiming onto aimState", () => {
    const system = new TargetingSystem();
    const ctx = createContext({ isManualAiming: true });

    system.update(ctx, mockConfig, 0.016);
    expect(aimState.isManualAiming).toBe(true);

    ctx.isManualAiming = false;
    system.update(ctx, mockConfig, 0.016);
    expect(aimState.isManualAiming).toBe(false);
  });

  it("drives reticle screenX and screenY to manualAimX and manualAimY", () => {
    const system = new TargetingSystem();
    const ctx = createContext({
      isManualAiming: true,
      manualAimX: 0.15,
      manualAimY: -0.1,
    });

    for (let i = 0; i < 30; i++) {
      system.update(ctx, mockConfig, 0.016);
    }

    expect(aimState.screenX).toBeCloseTo(0.15, 2);
    expect(aimState.screenY).toBeCloseTo(-0.1, 2);
    expect(aimState.lock).toBeGreaterThan(0.9);
  });

  it("skips candidate gathering entirely while manually aiming", () => {
    const system = new TargetingSystem();
    let collectCount = 0;
    system.registerProvider(createStubProvider(() => collectCount++));

    system.update(createContext(), mockConfig, 0.016);
    expect(collectCount).toBe(1);

    system.update(
      createContext({ isManualAiming: true, manualAimX: 0.2 }),
      mockConfig,
      0.016,
    );
    expect(collectCount).toBe(1);
  });

  it("releases any existing lock when manual aim takes over", () => {
    const system = new TargetingSystem();
    system.registerProvider(createStubProvider(() => {}));

    system.update(createContext(), mockConfig, 0.016);
    expect(aimState.targetId).toBe("hoop-0");
    expect(system.getLockedTargetId()).toBe("hoop-0");

    system.update(createContext({ isManualAiming: true }), mockConfig, 0.016);
    expect(aimState.targetId).toBeNull();
    expect(aimState.targetPoint).toBeNull();
    expect(system.getLockedTargetId()).toBeNull();
  });
});

describe("screenToWorldDirection", () => {
  const out = new THREE.Vector3();

  it("points straight down the camera axis at screen centre", () => {
    const camera = createMockCamera();
    const dir = screenToWorldDirection(camera, 0, 0, 16 / 9, out);

    expect(dir.x).toBeCloseTo(0, 4);
    expect(dir.y).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(-1, 4);
  });

  it("deflects up and to the right for a positive reticle offset", () => {
    const camera = createMockCamera();
    const dir = screenToWorldDirection(camera, 0.1, 0.1, 16 / 9, out);

    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeGreaterThan(0);
    expect(dir.z).toBeLessThan(0);
    expect(dir.length()).toBeCloseTo(1, 6);
  });

  it("keeps equal on-screen offsets at equal angles regardless of aspect", () => {
    const aimAt = (aspect: number): THREE.Vector3 => {
      const camera = createMockCamera();
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return screenToWorldDirection(camera, 0.2, 0, aspect, out).clone();
    };

    // Height-relative units mean the same cursor position is the same angle,
    // so the aspect divide has to cancel the projection's own aspect scaling.
    expect(aimAt(21 / 9).angleTo(aimAt(4 / 3))).toBeCloseTo(0, 4);
  });

  it("follows the camera's own orientation", () => {
    const camera = createMockCamera();
    camera.rotateY(Math.PI / 2);
    camera.updateMatrixWorld();

    const dir = screenToWorldDirection(camera, 0, 0, 16 / 9, out);

    expect(dir.x).toBeCloseTo(-1, 4);
    expect(dir.z).toBeCloseTo(0, 4);
  });
});
