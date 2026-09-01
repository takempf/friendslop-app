import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { computeHoopAimPoint, HoopProvider } from "./hoopProvider";
import {
  BACKBOARD_SQUARE_WIDTH,
  BACKBOARD_SQUARE_HEIGHT,
  BOARD_FRONT_FACE_Z,
  RIM_Y,
} from "@/constants/basketball";
import type { TargetingContext } from "../types";

describe("computeHoopAimPoint", () => {
  const halfSquareWidth = BACKBOARD_SQUARE_WIDTH / 2; // 0.295
  const expectedY = RIM_Y + BACKBOARD_SQUARE_HEIGHT;
  const expectedZ = BOARD_FRONT_FACE_Z - 0.05;

  it("targets center of backboard square when player is directly in front (0 deg)", () => {
    const cameraPos = new THREE.Vector3(0, 1.8, 4.0);
    const aimPoint = computeHoopAimPoint(cameraPos);

    expect(aimPoint.x).toBeCloseTo(0, 5);
    expect(aimPoint.y).toBeCloseTo(expectedY, 5);
    expect(aimPoint.z).toBeCloseTo(expectedZ, 5);
  });

  it("offsets to the left when player is at -45 deg angle on the left wing", () => {
    // 45 degrees left: dx = -depth
    const depth = 5;
    const cameraPos = new THREE.Vector3(
      -depth,
      1.8,
      BOARD_FRONT_FACE_Z - depth,
    );
    const aimPoint = computeHoopAimPoint(cameraPos);

    // At -45 deg (-PI/4), normalized angle is -0.5, so offset is -halfSquareWidth * 0.5
    expect(aimPoint.x).toBeCloseTo(-halfSquareWidth * 0.5, 5);
    expect(aimPoint.y).toBeCloseTo(expectedY, 5);
    expect(aimPoint.z).toBeCloseTo(expectedZ, 5);
  });

  it("offsets to the right when player is at +45 deg angle on the right wing", () => {
    // 45 degrees right: dx = +depth
    const depth = 5;
    const cameraPos = new THREE.Vector3(depth, 1.8, BOARD_FRONT_FACE_Z - depth);
    const aimPoint = computeHoopAimPoint(cameraPos);

    // At +45 deg (+PI/4), normalized angle is 0.5, so offset is +halfSquareWidth * 0.5
    expect(aimPoint.x).toBeCloseTo(halfSquareWidth * 0.5, 5);
    expect(aimPoint.y).toBeCloseTo(expectedY, 5);
    expect(aimPoint.z).toBeCloseTo(expectedZ, 5);
  });

  it("reaches maximum left offset (-0.295m) at -90 deg angle on the left baseline", () => {
    const cameraPos = new THREE.Vector3(-7, 1.8, BOARD_FRONT_FACE_Z);
    const aimPoint = computeHoopAimPoint(cameraPos);

    expect(aimPoint.x).toBeCloseTo(-halfSquareWidth, 5);
  });

  it("reaches maximum right offset (+0.295m) at +90 deg angle on the right baseline", () => {
    const cameraPos = new THREE.Vector3(7, 1.8, BOARD_FRONT_FACE_Z);
    const aimPoint = computeHoopAimPoint(cameraPos);

    expect(aimPoint.x).toBeCloseTo(halfSquareWidth, 5);
  });

  it("clamps to -90/+90 deg limits when player is behind the backboard plane", () => {
    const behindLeft = new THREE.Vector3(-5, 1.8, BOARD_FRONT_FACE_Z + 2);
    const aimPointLeft = computeHoopAimPoint(behindLeft);
    expect(aimPointLeft.x).toBeCloseTo(-halfSquareWidth, 5);

    const behindRight = new THREE.Vector3(5, 1.8, BOARD_FRONT_FACE_Z + 2);
    const aimPointRight = computeHoopAimPoint(behindRight);
    expect(aimPointRight.x).toBeCloseTo(halfSquareWidth, 5);
  });

  it("mutates the provided out vector without reallocating", () => {
    const out = new THREE.Vector3();
    const cameraPos = new THREE.Vector3(0, 1.8, 0);
    const result = computeHoopAimPoint(cameraPos, out);

    expect(result).toBe(out);
  });
});

describe("HoopProvider", () => {
  const createMockContext = (
    isHoldingBall: boolean,
    cameraPos: THREE.Vector3,
  ): TargetingContext => ({
    camera: new THREE.PerspectiveCamera(),
    aspect: 1,
    isHoldingBall,
    cameraPosition: cameraPos,
  });

  it("is active only when holding a ball", () => {
    const provider = new HoopProvider();
    const pos = new THREE.Vector3(0, 0, 0);

    expect(provider.isActive(createMockContext(false, pos))).toBe(false);
    expect(provider.isActive(createMockContext(true, pos))).toBe(true);
  });

  it("collects candidate with angle-adjusted aim point", () => {
    const provider = new HoopProvider();
    const candidates: ReturnType<typeof provider.collect> extends void
      ? Array<{ id: string; kind: string; point: THREE.Vector3 }>
      : never = [];

    // Collect from left side
    const leftDepth = 4;
    const ctxLeft = createMockContext(
      true,
      new THREE.Vector3(-leftDepth, 1.8, BOARD_FRONT_FACE_Z - leftDepth),
    );
    provider.collect(ctxLeft, candidates);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("hoop");
    expect(candidates[0].kind).toBe("hoop");
    expect(candidates[0].point.x).toBeCloseTo(
      -(BACKBOARD_SQUARE_WIDTH / 2) * 0.5,
      5,
    );

    // Collect from right side
    candidates.length = 0;
    const ctxRight = createMockContext(
      true,
      new THREE.Vector3(leftDepth, 1.8, BOARD_FRONT_FACE_Z - leftDepth),
    );
    provider.collect(ctxRight, candidates);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].point.x).toBeCloseTo(
      (BACKBOARD_SQUARE_WIDTH / 2) * 0.5,
      5,
    );
  });
});
