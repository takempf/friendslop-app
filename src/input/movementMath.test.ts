import { describe, it, expect } from "vitest";
import { computeMoveDirection } from "./movementMath";

describe("computeMoveDirection", () => {
  const SPEED = 5;

  it("produces equal magnitude for cardinal vs diagonal keyboard deflections", () => {
    const cardinal = computeMoveDirection(0, -1, 0, SPEED);
    const diagonal = computeMoveDirection(1, -1, 0, SPEED);

    const cardinalMag = Math.hypot(cardinal.x, cardinal.z);
    const diagonalMag = Math.hypot(diagonal.x, diagonal.z);

    expect(cardinalMag).toBeCloseTo(SPEED, 5);
    expect(diagonalMag).toBeCloseTo(SPEED, 5);
  });

  it("yields half velocity for half-deflected analog stick", () => {
    const halfStick = computeMoveDirection(0, -0.5, 0, SPEED);
    const mag = Math.hypot(halfStick.x, halfStick.z);
    expect(mag).toBeCloseTo(SPEED * 0.5, 5);
    expect(halfStick.z).toBeCloseTo(-SPEED * 0.5, 5);
    expect(halfStick.x).toBe(0);
  });

  it("returns zero vector when input or speed is zero", () => {
    expect(computeMoveDirection(0, 0, 0, SPEED)).toEqual({ x: 0, y: 0, z: 0 });
    expect(computeMoveDirection(1, 0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("correctly rotates world movement by camera yaw", () => {
    // Looking East (-PI/2 yaw in Three.js coordinates)
    const yawEast = -Math.PI / 2;
    const movingForward = computeMoveDirection(0, -1, yawEast, SPEED);

    expect(movingForward.x).toBeCloseTo(SPEED, 5);
    expect(movingForward.z).toBeCloseTo(0, 5);

    // Looking South (PI yaw)
    const yawSouth = Math.PI;
    const movingForwardSouth = computeMoveDirection(0, -1, yawSouth, SPEED);

    expect(movingForwardSouth.x).toBeCloseTo(0, 5);
    expect(movingForwardSouth.z).toBeCloseTo(SPEED, 5);
  });
});
