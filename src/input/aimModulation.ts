/** How much the aim-assist layer wants to damp look rate this frame. */
export interface AimModulation {
  /** 0 = unmodified stick, 1 = fully stopped. */
  slowdown: number;
}

/** Shared no-op default. Frozen — it sits next to a mutable twin below. */
export const NO_AIM_MODULATION: AimModulation = Object.freeze({ slowdown: 0 });

/**
 * Mutable singleton the composition root writes once per frame and input sources read,
 * mirroring how `aimState` carries the targeting result. Reusing one object keeps the
 * per-frame input path allocation-free.
 */
export const aimModulation: AimModulation = { slowdown: 0 };
