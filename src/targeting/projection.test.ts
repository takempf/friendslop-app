import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { worldToScreen } from "./projection";
import type { ProjectedScreenPoint } from "./types";

describe("worldToScreen projection", () => {
  it("projects center of view to (0, 0) and behind=false", () => {
    const camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const point = new THREE.Vector3(0, 0, -5);
    const out: ProjectedScreenPoint = { x: -999, y: -999, behind: true };

    worldToScreen(point, camera, 16 / 9, out);

    expect(out.behind).toBe(false);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it("projects known off-axis point at a known FOV to expected screen offset", () => {
    // 90 deg vertical FOV -> top edge is at tan(45deg) = 1 in view space
    const camera = new THREE.PerspectiveCamera(90, 1.0, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    // At z = -5, y = 5 is on the top edge (45 degrees up)
    const topEdgePoint = new THREE.Vector3(0, 5, -5);
    const out: ProjectedScreenPoint = { x: 0, y: 0, behind: true };

    worldToScreen(topEdgePoint, camera, 1.0, out);

    expect(out.behind).toBe(false);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0.5, 4); // Top edge is y = 0.5 in height-relative units
  });

  it("flags a point behind the camera as behind: true", () => {
    const camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    // Point directly behind camera at (0, 0, 5)
    const behindPoint = new THREE.Vector3(0, 0, 5);
    const out: ProjectedScreenPoint = { x: 0, y: 0, behind: false };

    worldToScreen(behindPoint, camera, 16 / 9, out);

    expect(out.behind).toBe(true);

    // Point behind and to the side
    const behindSidePoint = new THREE.Vector3(2, 1, 3);
    worldToScreen(behindSidePoint, camera, 16 / 9, out);
    expect(out.behind).toBe(true);
  });

  it("aspect ratio does not distort the y axis scale", () => {
    const camera = new THREE.PerspectiveCamera(60, 1.0, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const point = new THREE.Vector3(0, 2, -5);
    const outSquare: ProjectedScreenPoint = { x: 0, y: 0, behind: false };
    const outWide: ProjectedScreenPoint = { x: 0, y: 0, behind: false };

    worldToScreen(point, camera, 1.0, outSquare);
    worldToScreen(point, camera, 16 / 9, outWide);

    expect(outSquare.y).toBeCloseTo(outWide.y, 6);
  });
});
