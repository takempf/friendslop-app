import { beforeEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { TargetingSystem } from "@/targeting/TargetingSystem";
import { aimState } from "@/targeting/aimState";
import { worldToScreen } from "@/targeting/projection";
import type { AimState, TargetingConfig } from "@/targeting/types";
import { hitTarget, targetAt } from "@/games/firingRange/trials";
import { resolveEquipmentAim } from "./equipmentAim";

const config: TargetingConfig = {
  aimAssistDiameter: 0.3,
  aimAssistSmoothing: 12,
  aimAssistSlowdown: 0.45,
  aimAssistMouseScale: 0,
  aimAssistStrength: 0.5,
  aimAssistPitchStrength: 0.2,
  showAimAssistCircle: true,
  showTargetDebug: false,
};
const gun = { use() {}, aimTargetKind: "shooting-target" };
const emptyAim: AimState = {
  screenX: 0,
  screenY: 0,
  targetId: null,
  targetKind: null,
  targetIndex: -1,
  targetPoint: null,
  lock: 0,
  isManualAiming: false,
};
beforeEach(() => Object.assign(aimState, emptyAim));

describe("equipment aim used by the firing ray", () => {
  it.each(["keyboard", "gamepad"] as const)(
    "hits an off-center locked bullseye on %s",
    (device) => {
      const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
      camera.position.set(-8, 1.8, -21);
      camera.lookAt(-16, 1.8, -21); // Screen center misses the target by one metre.
      camera.updateMatrixWorld();
      const target = targetAt(0, undefined, 0);
      const system = new TargetingSystem();
      system.registerProvider({
        kind: "shooting-target",
        isActive: () => true,
        collect(_ctx, out) {
          out.push({
            id: "range:target:0",
            kind: "shooting-target",
            point: target.point,
          });
        },
      });
      for (let i = 0; i < 60; i++)
        system.update(
          {
            camera,
            aspect: camera.aspect,
            cameraPosition: camera.position,
            isHoldingEquipment: true,
            heldEquipmentKind: "gun",
          },
          config,
          1 / 60,
        );
      expect(aimState.targetId).toBe("range:target:0");
      expect(
        hitTarget(
          camera.position,
          camera.getWorldDirection(new Vector3()),
          target,
        ),
      ).toBeNull();
      const direction = resolveEquipmentAim(
        camera,
        camera.aspect,
        aimState,
        gun,
        device,
        config,
        new Vector3(),
      );
      expect(hitTarget(camera.position, direction, target)?.points).toBe(10);
    },
  );
  it.each([
    [75, 16 / 9],
    [40, 16 / 9],
    [75, 9 / 16],
  ])(
    "follows the visible reticle at FOV %s and aspect %s, even between locks",
    (fov, aspect) => {
      const camera = new PerspectiveCamera(fov, aspect, 0.1, 100);
      camera.position.set(-7, 1.8, -25);
      camera.lookAt(-20, 2, -23);
      camera.updateMatrixWorld();
      const aim = {
        ...emptyAim,
        screenX: 0.08,
        screenY: -0.06,
        targetKind: "shooting-target",
        targetPoint: new Vector3(-20, 2, -22),
      };
      const direction = resolveEquipmentAim(
        camera,
        aspect,
        aim,
        gun,
        "keyboard",
        config,
        new Vector3(),
      );
      const projected = { x: 0, y: 0, behind: false };
      worldToScreen(
        direction.multiplyScalar(10).add(camera.position),
        camera,
        aspect,
        projected,
      );
      expect(projected.x).toBeCloseTo(aim.screenX, 6);
      expect(projected.y).toBeCloseTo(aim.screenY, 6);
    },
  );
  it("preserves mouse throw correction and manual aim override", () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.updateMatrixWorld();
    const aim = {
      ...emptyAim,
      screenX: 0.1,
      screenY: 0.05,
      targetKind: "hoop",
      targetPoint: new Vector3(2, 1, -10),
    };
    const ball = { aimTargetKind: "hoop" };
    expect(
      resolveEquipmentAim(
        camera,
        camera.aspect,
        aim,
        ball,
        "keyboard",
        config,
        new Vector3(),
      ),
    ).toEqual(new Vector3(0, 0, -1));
    const manual = resolveEquipmentAim(
      camera,
      camera.aspect,
      { ...aim, isManualAiming: true },
      ball,
      "keyboard",
      config,
      new Vector3(),
    );
    expect(manual.x).toBeGreaterThan(0);
    expect(manual.y).toBeGreaterThan(0);
    const assisted = resolveEquipmentAim(
      camera,
      camera.aspect,
      aim,
      ball,
      "gamepad",
      config,
      new Vector3(),
    );
    expect(assisted.x).toBeGreaterThan(0);
    expect(assisted.y).toBeGreaterThan(0);
  });
  it("fires straight ahead once the reticle is centered and no target is selected", () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.lookAt(-10, 2, 1);
    camera.updateMatrixWorld();
    const ray = resolveEquipmentAim(
      camera,
      camera.aspect,
      emptyAim,
      gun,
      "keyboard",
      config,
      new Vector3(),
    );
    expect(
      ray.distanceTo(camera.getWorldDirection(new Vector3())),
    ).toBeLessThan(1e-8);
  });
});
