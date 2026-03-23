// Mutable singleton read by game components every frame / throw.
// The DebugPanel writes here directly; no React state needed on the read side.
const LOCAL_STORAGE_KEY = 'friendslop_debug_config'

const defaultDebugConfig = {
  minThrowSpeed:        5.625,  // m/s
  maxThrowSpeed:        9.75,   // m/s  (4.875 × 2)
  throwArcDeg:          30,     // degrees of upward arc bias added to throw
  throwSpinMult:        9,      // angular velocity = speed × this
  backboardRestitution: 0.25,
  rimRestitution:       0.225,
  funnelStrength:       0.018,  // per-frame inward impulse inside net cylinder
  renderScale:          1,      // resolution scale from 0.25 to 1
}

type DebugConfig = typeof defaultDebugConfig

function getSavedConfig(): DebugConfig {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved) {
      return { ...defaultDebugConfig, ...JSON.parse(saved) } as DebugConfig
    }
  } catch (e) {
    console.warn('Failed to parse debug config from localStorage', e)
  }
  return { ...defaultDebugConfig }
}

export const debugConfig = getSavedConfig()

export function saveDebugConfig() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(debugConfig))
  } catch (e) {
    console.warn('Failed to save debug config to localStorage', e)
  }
}
