import type { RefObject } from "react";

/**
 * Handle to the reticle's aim circle, published by <Reticle /> and written every
 * frame from the r3f loop so the circle moves in the same tick as the 3D camera.
 * A shared ref rather than a DOM id lookup keeps the coupling type-checked.
 */
export const reticleCircleElement: RefObject<HTMLDivElement | null> = {
  current: null,
};
