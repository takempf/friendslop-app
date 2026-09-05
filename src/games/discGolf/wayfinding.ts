import { Shape } from "three";
import type { Hole } from "./course";
/** Local arrows point along -Z after laying the XY shape on the ground. */
export function teeHeading(hole: Hole): number {
  return Math.atan2(
    -(hole.basket[0] - hole.tee[0]),
    -(hole.basket[1] - hole.tee[1]),
  );
}
export const teeChevron = new Shape();
teeChevron.moveTo(-0.55, -0.2);
teeChevron.lineTo(0, 0.3);
teeChevron.lineTo(0.55, -0.2);
teeChevron.lineTo(0.55, -0.45);
teeChevron.lineTo(0, 0.05);
teeChevron.lineTo(-0.55, -0.45);
teeChevron.closePath();
