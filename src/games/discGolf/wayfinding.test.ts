import { expect, it } from "vitest";
import { Vector3 } from "three";
import { HOLES } from "./course";
import { teeHeading } from "./wayfinding";

it("points the ground chevrons from every tee toward its own basket", () => {
  for (const hole of HOLES) {
    const tipDirection = new Vector3(0, 0, -1).applyAxisAngle(
      new Vector3(0, 1, 0),
      teeHeading(hole),
    );
    const targetDirection = new Vector3(
      hole.basket[0] - hole.tee[0],
      0,
      hole.basket[1] - hole.tee[1],
    ).normalize();
    expect(tipDirection.dot(targetDirection)).toBeCloseTo(1, 8);
  }
});
