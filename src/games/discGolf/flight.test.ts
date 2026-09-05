import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  discHoldPose,
  discReleaseSpin,
  DISC_CHARGE_SECONDS,
} from "./throwMotion";
import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  DISC_MASS,
  DISC_ANGULAR_DAMPING,
  discAcceleration,
  discAngularVelocity,
} from "./flight";
import { caughtBasket, HOLES } from "./course";
beforeAll(async () => {
  await RAPIER.init();
});
function worldWithDisc(x = 0, y = 1.6, z = 0) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(100, 0.3, 150)
      .setTranslation(0, -0.3, -50)
      .setFriction(1.5),
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.12)
      .setAngularDamping(DISC_ANGULAR_DAMPING)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.035, 0.22)
      .setMass(DISC_MASS)
      .setRestitution(0.08)
      .setFriction(1.5),
    body,
  );
  return { world, body };
}
describe("Rapier disc flight", () => {
  it("glides farther at higher charge, lands and comes to rest", () => {
    function launch(speed: number) {
      const { world, body } = worldWithDisc();
      const camera = new PerspectiveCamera();
      camera.rotation.x = 0.3;
      const release = new Quaternion();
      const charge = (speed - 4) / 19;
      discHoldPose(
        camera,
        charge * DISC_CHARGE_SECONDS,
        new Vector3(),
        release,
      );
      body.setRotation(release, true);
      body.setLinvel(
        { x: 0, y: Math.sin(0.387) * speed, z: -Math.cos(0.387) * speed },
        true,
      );
      body.setAngvel(discReleaseSpin(release, charge, new Vector3()), true);
      let range = 0,
        rightTurn = 0,
        leftFade = 0;
      for (let i = 0; i < 1200; i++) {
        body.setAngularDamping(
          body.translation().y <= 0.26 ? 2.8 : DISC_ANGULAR_DAMPING,
        );
        body.setLinearDamping(body.translation().y <= 0.26 ? 1.4 : 0.12);
        if (body.translation().y > 0.26 && !body.isSleeping()) {
          body.setAngvel(
            discAngularVelocity(body.linvel(), body.rotation(), body.angvel()),
            true,
          );
          const a = discAcceleration(
            body.linvel(),
            body.rotation(),
            body.angvel(),
          );
          body.applyImpulse(
            {
              x: a.x * DISC_MASS * world.timestep,
              y: a.y * DISC_MASS * world.timestep,
              z: a.z * DISC_MASS * world.timestep,
            },
            true,
          );
        }
        if (body.translation().y > 0.3) {
          rightTurn = Math.max(rightTurn, body.linvel().x);
          if (Math.hypot(body.linvel().x, body.linvel().z) < 15)
            leftFade = Math.min(leftFade, body.linvel().x);
        }
        world.step();
        range = Math.max(range, -body.translation().z);
      }
      expect(body.mass()).toBeCloseTo(DISC_MASS, 4);
      expect(body.translation().y).toBeGreaterThan(0);
      // A freely rotating disc can finish flat or balanced on its rim.
      expect(body.translation().y).toBeLessThan(0.24);
      expect(
        Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z),
      ).toBeLessThan(0.1);
      world.free();
      return { range, rightTurn, leftFade };
    }
    const putt = launch(4),
      drive = launch(23);
    expect(drive.range).toBeGreaterThan(putt.range * 3);
    expect(drive.range).toBeGreaterThan(20);
    expect(drive.range).toBeLessThan(80);
    expect(drive.rightTurn).toBeGreaterThan(0.3);
    expect(drive.leftFade).toBeLessThan(-0.3);
  });
  it("detects a downward catch above a physical basket tray", () => {
    const hole = HOLES[0],
      [x, z] = hole.basket;
    const { world, body } = worldWithDisc(x + 0.3, 1.4, z);
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.025, 0.5).setTranslation(x, 0.83, z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.9, 0.035).setTranslation(x, 0.9, z),
    );
    let caught = 0;
    for (let i = 0; i < 120; i++) {
      const p = body.translation();
      world.step();
      const n = body.translation();
      if (caughtBasket([p.x, p.y, p.z], [n.x, n.y, n.z], hole)) caught++;
    }
    expect(caught).toBe(1);
    expect(body.translation().y).toBeCloseTo(0.885, 1);
    world.free();
  });
});
