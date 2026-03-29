// Mutable singleton read by game components every frame / throw.
// The DebugPanel writes here directly; no React state needed on the read side.

type DebugConfig = {
  crtEnabled: boolean;
  crtSmoothing: boolean;
  minThrowSpeed: number;
  maxThrowSpeed: number;
  throwArcDeg: number;
  throwSpinMult: number;
  backboardRestitution: number;
  rimRestitution: number;
  funnelStrength: number;
  renderScale: number;
  showPerf: boolean;
  showClouds: boolean;
};

export const debugConfig: DebugConfig = {
  crtEnabled: true,
  crtSmoothing: true,
  minThrowSpeed: 4.5, // m/s
  maxThrowSpeed: 15.0, // m/s
  throwArcDeg: 30, // degrees of upward arc bias added to throw
  throwSpinMult: 9, // angular velocity = speed × this
  backboardRestitution: 0.25,
  rimRestitution: 0.225,
  funnelStrength: 0.018, // per-frame inward impulse inside net cylinder
  renderScale: Math.min(window.devicePixelRatio || 1, 1.5), // resolution scale (DPR limit)
  showPerf: false,
  showClouds: true,
};

// Simple event system for reactivity
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeToDebugConfig = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const updateDebugConfig = <K extends keyof DebugConfig>(
  key: K,
  value: DebugConfig[K],
) => {
  debugConfig[key] = value;
  listeners.forEach((l) => l());
};
