import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { Object3D, Quaternion, Vector3 } from "three";
import { HeldPose } from "./HeldPose";
import { HELD_PRESENTATION_PRIORITY, PHYSICS_PRIORITY } from "./frameOrder";

beforeAll(async () => {
  await RAPIER.init();
});
describe("held presentation after physics", () => {
  it.each([30, 60, 144, 240])(
    "stays camera-relative at %i Hz across fixed-step interpolation",
    (fps) => {
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased(),
      );
      const visual = new Object3D(),
        camera = new Object3D();
      const pose = new HeldPose();
      const offset = new Vector3(0.2, -0.3, -0.8);
      const position = new Vector3(),
        previous = new Vector3();
      let accumulator = 0;
      for (let frame = 0; frame < fps * 2; frame++) {
        camera.position.set(
          (frame / fps) * 7.5,
          1.8 + Math.sin(frame / fps) * 0.4,
          0,
        );
        camera.rotation.set(0.1, (frame / fps) * 0.7, 0);
        position
          .copy(offset)
          .applyQuaternion(camera.quaternion)
          .add(camera.position);
        pose.set(3, position, camera.quaternion);
        body.setNextKinematicTranslation(position);
        body.setNextKinematicRotation(camera.quaternion);
        // Reproduce Rapier's interpolation overwrite, including render frames
        // with zero physics steps. Execute using the app's actual phase priorities.
        const phases = [
          {
            priority: PHYSICS_PRIORITY,
            run() {
              accumulator += 1 / fps;
              while (accumulator >= 1 / 60) {
                previous.copy(body.translation());
                world.step();
                accumulator -= 1 / 60;
              }
              visual.position
                .copy(previous)
                .lerp(new Vector3().copy(body.translation()), accumulator * 60);
              const q = body.rotation();
              visual.quaternion.set(q.x, q.y, q.z, q.w);
            },
          },
          {
            priority: HELD_PRESENTATION_PRIORITY,
            run() {
              pose.present(3, visual);
            },
          },
        ];
        phases
          .sort((a, b) => a.priority - b.priority)
          .forEach((phase) => phase.run());
        const relative = visual.position
          .clone()
          .sub(camera.position)
          .applyQuaternion(camera.quaternion.clone().invert());
        expect(relative.distanceTo(offset)).toBeLessThan(1e-8);
        expect(visual.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-7);
      }
      world.free();
    },
  );

  it("hands off the visible pose when releasing between physics ticks", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased(),
    );
    const pose = new HeldPose();
    const position = new Vector3(8, 2, -4);
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      0.3,
    );
    pose.set(3, position, rotation);
    body.setNextKinematicTranslation(position);
    expect(body.translation().x).toBe(0);
    // Replication reads this same authored pose, not the older physics tick.
    expect(pose.get(3)?.position.x).toBe(8);
    expect(pose.release(3, body)).toBe(true);
    expect(
      new Vector3().copy(body.translation()).distanceTo(position),
    ).toBeLessThan(1e-6);
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setLinvel({ x: 2, y: 0, z: 0 }, true);
    world.step();
    expect(body.translation().x).toBeGreaterThan(8);
    expect(pose.present(3, new Object3D())).toBe(false);
    world.free();
  });

  it("does not overwrite a dropped, stolen, or unrelated item's visual", () => {
    const pose = new HeldPose();
    pose.set(3, new Vector3(8, 2, -4), new Quaternion());
    const visual = new Object3D();
    visual.position.set(20, 0, 0);
    expect(pose.present(-1, visual)).toBe(false);
    expect(pose.present(4, visual)).toBe(false);
    expect(visual.position.x).toBe(20);
  });

  it("resolves world-space held poses under a transformed scene parent", () => {
    const parent = new Object3D(),
      visual = new Object3D();
    parent.position.set(10, 0, -4);
    parent.rotation.y = 0.7;
    parent.scale.setScalar(2);
    parent.add(visual);
    const pose = new HeldPose();
    const position = new Vector3(1, 2, 3);
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      0.4,
    );
    pose.set(3, position, rotation);
    pose.present(3, visual);
    expect(
      visual.getWorldPosition(new Vector3()).distanceTo(position),
    ).toBeLessThan(1e-8);
    expect(
      visual.getWorldQuaternion(new Quaternion()).angleTo(rotation),
    ).toBeLessThan(1e-7);
  });
});
