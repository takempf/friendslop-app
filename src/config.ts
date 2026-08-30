// Mutable singleton read by game components every frame / throw.
// Writes go through updateConfig; no React state needed on the read side.

type GameConfig = {
  crtEnabled: boolean;
  crtSmoothing: boolean;
  minThrowSpeed: number;
  maxThrowSpeed: number;
  throwArcDeg: number;
  throwSpinMult: number;
  backboardRestitution: number;
  rimRestitution: number;
  funnelStrength: number;
  /** Target vertical render resolution in physical pixels. */
  renderHeight: number;
  showFps: boolean;
  showPerf: boolean;
  showClouds: boolean;
  /** Cloud raymarch resolution, as a fraction of the render resolution. */
  cloudResolution: number;
  /** Samples along each view ray through the cloud layer. */
  cloudSteps: number;
  /** Samples along each shadow ray toward the sun. */
  cloudLightSteps: number;
  /** fbm octaves used to erode the cloud silhouettes. */
  cloudDetail: number;
};

// ── Graphics localStorage keys ────────────────────────────────────────────────
const LS = {
  crtEnabled: "friendslop_graphics_crtEnabled",
  crtSmoothing: "friendslop_graphics_crtSmoothing",
  showFps: "friendslop_graphics_showFps",
  showPerf: "friendslop_graphics_showPerf",
  showClouds: "friendslop_graphics_showClouds",
  renderHeight: "friendslop_graphics_renderHeight",
  cloudResolution: "friendslop_graphics_cloudResolution",
  cloudSteps: "friendslop_graphics_cloudSteps",
  cloudLightSteps: "friendslop_graphics_cloudLightSteps",
  cloudDetail: "friendslop_graphics_cloudDetail",
} as const;

function lsBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "true";
}

function lsNum(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  return v === null ? fallback : Number(v);
}

const defaultRenderHeight = 1280;

export const gameConfig: GameConfig = {
  crtEnabled: lsBool(LS.crtEnabled, true),
  crtSmoothing: lsBool(LS.crtSmoothing, true),
  minThrowSpeed: 4.5, // m/s
  maxThrowSpeed: 15.0, // m/s
  throwArcDeg: 30, // degrees of upward arc bias added to throw
  throwSpinMult: 9, // angular velocity = speed × this
  backboardRestitution: 0.25,
  rimRestitution: 0.225,
  funnelStrength: 0.018, // per-frame inward impulse inside net cylinder
  renderHeight: lsNum(LS.renderHeight, defaultRenderHeight),
  showFps: lsBool(LS.showFps, false),
  showPerf: lsBool(LS.showPerf, false),
  showClouds: lsBool(LS.showClouds, true),
  cloudResolution: lsNum(LS.cloudResolution, 0.5),
  cloudSteps: lsNum(LS.cloudSteps, 42),
  cloudLightSteps: lsNum(LS.cloudLightSteps, 5),
  cloudDetail: lsNum(LS.cloudDetail, 5),
};

// Simple event system for reactivity
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeToConfig = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const updateConfig = <K extends keyof GameConfig>(
  key: K,
  value: GameConfig[K],
) => {
  gameConfig[key] = value;
  // Persist graphics settings
  if (key in LS) {
    localStorage.setItem(LS[key as keyof typeof LS], String(value));
  }
  listeners.forEach((l) => l());
};
