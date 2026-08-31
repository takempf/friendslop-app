import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { pickAssistedDirection } from "./throwCorrection";

describe("pickAssistedDirection", () => {
  const cameraPos = new THREE.Vector3(0, 1.8, 0);
  const lookDir = new THREE.Vector3(0, 0.2, -1).normalize();
  const targetPoint = new THREE.Vector3(2, 3.5, -5); // Target is to the right (+X) and up (+Y)
  const out = new THREE.Vector3();

  it("returns look direction unchanged when both strengths are 0", () => {
    pickAssistedDirection(lookDir, targetPoint, cameraPos, 0, 0, out);
    expect(out.x).toBeCloseTo(lookDir.x, 5);
    expect(out.y).toBeCloseTo(lookDir.y, 5);
    expect(out.z).toBeCloseTo(lookDir.z, 5);
  });

  it("returns direction to target point when both strengths are 1", () => {
    const expectedDir = new THREE.Vector3()
      .subVectors(targetPoint, cameraPos)
      .normalize();

    pickAssistedDirection(lookDir, targetPoint, cameraPos, 1, 1, out);
    expect(out.x).toBeCloseTo(expectedDir.x, 5);
    expect(out.y).toBeCloseTo(expectedDir.y, 5);
    expect(out.z).toBeCloseTo(expectedDir.z, 5);
  });

  it("yaw-only correction modifies lateral bearing but leaves vertical pitch untouched", () => {
    pickAssistedDirection(lookDir, targetPoint, cameraPos, 1, 0, out);

    // Pitch component (Y) should match original look direction Y
    expect(out.y).toBeCloseTo(lookDir.y, 5);

    // Yaw bearing should point toward target bearing
    const targetDir = new THREE.Vector3()
      .subVectors(targetPoint, cameraPos)
      .normalize();
    const expectedYaw = Math.atan2(targetDir.x, -targetDir.z);
    const resultYaw = Math.atan2(out.x, -out.z);

    expect(resultYaw).toBeCloseTo(expectedYaw, 5);
  });

  it("pitch-only correction modifies vertical pitch but leaves lateral yaw untouched", () => {
    pickAssistedDirection(lookDir, targetPoint, cameraPos, 0, 1, out);

    // Lateral yaw bearing should match original look direction yaw
    const lookYaw = Math.atan2(lookDir.x, -lookDir.z);
    const resultYaw = Math.atan2(out.x, -out.z);
    expect(resultYaw).toBeCloseTo(lookYaw, 5);

    // Vertical pitch should match target pitch
    const targetDir = new THREE.Vector3()
      .subVectors(targetPoint, cameraPos)
      .normalize();
    expect(out.y).toBeCloseTo(targetDir.y, 5);
  });

  it("returns look direction unchanged when targetPoint is null", () => {
    pickAssistedDirection(lookDir, null, cameraPos, 1, 1, out);
    expect(out.x).toBeCloseTo(lookDir.x, 5);
    expect(out.y).toBeCloseTo(lookDir.y, 5);
    expect(out.z).toBeCloseTo(lookDir.z, 5);
  });
});
