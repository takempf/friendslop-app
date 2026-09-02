// Mutable singleton read by game components every frame / throw.
// Writes go through updateConfig; no React state needed on the read side.

export const DUALSENSE_GYRO_MODES = ["aiming", "always", "disabled"] as const;
export type DualSenseGyroMode = (typeof DUALSENSE_GYRO_MODES)[number];

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
  /** Gamepad support enabled */
  gamepadEnabled: boolean;
  /** Gamepad look sensitivity (radians per second at full deflection) */
  gamepadLookSensitivity: number;
  /** Gamepad look response curve exponent (1.0 = linear, 1.6 = standard, 2.2 = fine) */
  gamepadLookCurve: number;
  /** Gamepad analog stick deadzone (0.01 to 0.5) */
  gamepadDeadzone: number;
  /** Gamepad vertical pitch inversion */
  gamepadInvertY: boolean;
  /**
   * Whether to claim a paired DualSense over WebHID on load. Turning this off is
   * the escape hatch back to the plain Gamepad API, and it has to persist —
   * otherwise the next reload re-claims the device.
   */
  dualsenseHidEnabled: boolean;
  /** DualSense gyro mode: aiming (active while L2 is held), always, or disabled */
  dualsenseGyroMode: DualSenseGyroMode;
  /** DualSense gyro sensitivity multiplier */
  dualsenseGyroSensitivity: number;
  /** DualSense gyro vertical pitch inversion */
  dualsenseGyroInvertY: boolean;
  /** Draw the active assist circle(s) on the HUD */
  showAimAssistCircle: boolean;
  /** Default circle diameter as a fraction of viewport height (0.02–0.40) */
  aimAssistDiameter: number;
  /** Override circle diameter for grabbable targets */
  aimAssistGrabDiameter: number;
  /** Damping lambda for the reticle circle */
  aimAssistSmoothing: number;
  /** Look-rate friction / slowdown on target lock (0 = none, 1 = full stop) */
  aimAssistSlowdown: number;
  /** Scale factor applied to throw assist for mouse/keyboard players (0 = off, 1 = full) */
  aimAssistMouseScale: number;
  /** Yaw (lateral) throw correction strength (0 = off, 1 = direct to target) */
  aimAssistStrength: number;
  /** Pitch (vertical) throw correction strength (0 = off, 1 = direct to target) */
  aimAssistPitchStrength: number;
  /** Label candidates with rank/score and occlusion status */
  showTargetDebug: boolean;
};

// ── LocalStorage keys ────────────────────────────────────────────────────────
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
  gamepadEnabled: "friendslop_controls_gamepadEnabled",
  gamepadLookSensitivity: "friendslop_controls_gamepadLookSensitivity",
  gamepadLookCurve: "friendslop_controls_gamepadLookCurve",
  gamepadDeadzone: "friendslop_controls_gamepadDeadzone",
  gamepadInvertY: "friendslop_controls_gamepadInvertY",
  dualsenseHidEnabled: "friendslop_controls_dualsenseHidEnabled",
  dualsenseGyroMode: "friendslop_controls_dualsenseGyroMode",
  dualsenseGyroSensitivity: "friendslop_controls_dualsenseGyroSensitivity",
  dualsenseGyroInvertY: "friendslop_controls_dualsenseGyroInvertY",
  showAimAssistCircle: "friendslop_aim_showAimAssistCircle",
  aimAssistDiameter: "friendslop_aim_aimAssistDiameter",
  aimAssistGrabDiameter: "friendslop_aim_aimAssistGrabDiameter",
  aimAssistSmoothing: "friendslop_aim_aimAssistSmoothing",
  aimAssistSlowdown: "friendslop_aim_aimAssistSlowdown",
  aimAssistMouseScale: "friendslop_aim_aimAssistMouseScale",
  aimAssistStrength: "friendslop_aim_aimAssistStrength",
  aimAssistPitchStrength: "friendslop_aim_aimAssistPitchStrength",
  showTargetDebug: "friendslop_aim_showTargetDebug",
} as const;

function lsBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "true";
}

function lsNum(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : Number(v);
}

/** Reads a string union, falling back when the stored value is not a member. */
function lsEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
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
  gamepadEnabled: lsBool(LS.gamepadEnabled, true),
  gamepadLookSensitivity: lsNum(LS.gamepadLookSensitivity, 2.5),
  gamepadLookCurve: lsNum(LS.gamepadLookCurve, 1.6),
  gamepadDeadzone: lsNum(LS.gamepadDeadzone, 0.15),
  gamepadInvertY: lsBool(LS.gamepadInvertY, false),
  dualsenseHidEnabled: lsBool(LS.dualsenseHidEnabled, true),
  dualsenseGyroMode: lsEnum(
    LS.dualsenseGyroMode,
    DUALSENSE_GYRO_MODES,
    "aiming",
  ),
  dualsenseGyroSensitivity: lsNum(LS.dualsenseGyroSensitivity, 0.9),
  dualsenseGyroInvertY: lsBool(LS.dualsenseGyroInvertY, false),
  showAimAssistCircle: lsBool(LS.showAimAssistCircle, false),
  aimAssistDiameter: lsNum(LS.aimAssistDiameter, 0.25),
  aimAssistGrabDiameter: lsNum(LS.aimAssistGrabDiameter, 1.0),
  aimAssistSmoothing: lsNum(LS.aimAssistSmoothing, 12),
  aimAssistSlowdown: lsNum(LS.aimAssistSlowdown, 0.45),
  aimAssistMouseScale: lsNum(LS.aimAssistMouseScale, 0),
  aimAssistStrength: lsNum(LS.aimAssistStrength, 0.5),
  aimAssistPitchStrength: lsNum(LS.aimAssistPitchStrength, 0.2),
  showTargetDebug: lsBool(LS.showTargetDebug, false),
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
  // Persist settings
  if (typeof localStorage !== "undefined" && key in LS) {
    localStorage.setItem(LS[key as keyof typeof LS], String(value));
  }
  listeners.forEach((l) => l());
};
