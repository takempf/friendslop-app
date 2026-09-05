import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  discHoldPose,
  discReleaseSpin,
  DISC_CHARGE_SECONDS,
} from "./throwMotion";
import { discAcceleration, discAngularVelocity } from "./flight";

describe("right-handed disc motion", () => {
  it("winds up from the center to the left in camera space, including when looking sideways", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(12, 2, -40);
    camera.rotation.set(0.2, 1.3, 0);
    const position = new Vector3(),
      rotation = new Quaternion();
    const inverse = camera.quaternion.clone().invert();
    const xs = [0, 0.5, 1].map((charge) => {
      discHoldPose(camera, charge * DISC_CHARGE_SECONDS, position, rotation);
      return position.sub(camera.position).applyQuaternion(inverse).x;
    });
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeLessThan(xs[0]);
    expect(xs[2]).toBeLessThan(xs[1]);
    expect(xs[2]).toBeLessThan(-0.4);
    const poses = [0, 0.5, 1].map((t) => {
      const p = new Vector3();
      discHoldPose(
        new PerspectiveCamera(),
        t * DISC_CHARGE_SECONDS,
        p,
        new Quaternion(),
      );
      return p;
    });
    const chordMid = poses[0].clone().lerp(poses[2], 0.5);
    expect(poses[1].distanceTo(chordMid)).toBeGreaterThan(0.05);
  });

  it("banks and cocks the disc, then spins clockwise around its tilted normal", () => {
    const camera = new PerspectiveCamera();
    const rotation = new Quaternion();
    discHoldPose(camera, DISC_CHARGE_SECONDS, new Vector3(), rotation);
    const normal = new Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(normal.x).toBeLessThan(-0.08);
    const spin = discReleaseSpin(rotation, 1, new Vector3());
    expect(spin.dot(normal)).toBeCloseTo(-52);
    expect(spin.clone().cross(normal).length()).toBeCloseTo(0);
    expect(discReleaseSpin(rotation, 0, new Vector3()).length()).toBeLessThan(
      spin.length(),
    );
  });

  it("makes opposite banks bend flight in opposite directions", () => {
    const velocity = { x: 0, y: 0, z: -18 };
    function acceleration(bank: number) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), bank);
      return discAcceleration(
        velocity,
        q,
        discReleaseSpin(q, 1, new Vector3()),
      );
    }
    expect(acceleration(0.3).x).toBeLessThan(-1);
    expect(acceleration(-0.3).x).toBeGreaterThan(1);
    expect(acceleration(0).x).toBeCloseTo(0);
  });

  it("uses nose angle for drag and spin for lift stability and handed fade", () => {
    const flat = new Quaternion();
    const noseUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5);
    const velocity = { x: 0, y: 0, z: -8 };
    const stable = discAcceleration(velocity, flat, { x: 0, y: -35, z: 0 });
    const unspun = discAcceleration(velocity, flat, { x: 0, y: 0, z: 0 });
    const tilted = discAcceleration(
      velocity,
      noseUp,
      discReleaseSpin(noseUp, 1, new Vector3()),
    );
    expect(
      discAngularVelocity(velocity, flat, { x: 0, y: -35, z: 0 }).z,
    ).toBeGreaterThan(0);
    expect(stable.y).toBeGreaterThan(unspun.y);
    expect(tilted.z).toBeGreaterThan(stable.z);
    expect(
      discAngularVelocity(velocity, flat, { x: 0, y: 35, z: 0 }).z,
    ).toBeLessThan(0);
    expect(
      discAngularVelocity({ x: 0, y: 0, z: -23 }, flat, { x: 0, y: -35, z: 0 })
        .z,
    ).toBeLessThan(0);
  });
});
