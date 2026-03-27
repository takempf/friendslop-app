// Mutable singleton read by game components every frame / throw.
// The DebugPanel writes here directly; no React state needed on the read side.
export const debugConfig = {
  crtEnabled: true,
  crtSmoothing: true,
  minThrowSpeed: 4.5, // m/s
  maxThrowSpeed: 15.0, // m/s
  throwArcDeg: 30, // degrees of upward arc bias added to throw
  throwSpinMult: 9, // angular velocity = speed × this
  backboardRestitution: 0.25,
  rimRestitution: 0.225,
  funnelStrength: 0.018, // per-frame inward impulse inside net cylinder
  renderScale: 0.5, // resolution scale from 0.25 to 1
  showPerf: false,
};
