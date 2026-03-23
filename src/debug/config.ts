// Mutable singleton read by game components every frame / throw.
// The DebugPanel writes here directly; no React state needed on the read side.
export const debugConfig = {
  minThrowSpeed:        5.625,  // m/s
  maxThrowSpeed:        9.75,   // m/s  (4.875 × 2)
  throwArcDeg:          30,     // degrees of upward arc bias added to throw
  throwSpinMult:        9,      // angular velocity = speed × this
  backboardRestitution: 0.25,
  rimRestitution:       0.225,
  funnelStrength:       0.018,  // per-frame inward impulse inside net cylinder
}
