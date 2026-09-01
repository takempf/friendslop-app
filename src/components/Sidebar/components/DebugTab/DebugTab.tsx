import { useState, useEffect } from "react";
import { gameConfig, updateConfig, subscribeToConfig } from "@/config";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import styles from "./DebugTab.module.css";

type ConfigKey = keyof typeof gameConfig;
type NumericConfigKey = {
  [K in ConfigKey]: (typeof gameConfig)[K] extends number ? K : never;
}[ConfigKey];

const PHYSICS_PARAMS: {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "minThrowSpeed",
    label: "Min Throw Speed (m/s)",
    min: 0,
    max: 15,
    step: 0.125,
  },
  {
    key: "maxThrowSpeed",
    label: "Max Throw Speed (m/s)",
    min: 0,
    max: 20,
    step: 0.125,
  },
  { key: "throwArcDeg", label: "Throw Arc (°)", min: 0, max: 80, step: 1 },
  {
    key: "throwSpinMult",
    label: "Spin Multiplier",
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    key: "backboardRestitution",
    label: "Backboard Restitution",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "rimRestitution",
    label: "Rim Restitution",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "funnelStrength",
    label: "Net Funnel Strength",
    min: 0,
    max: 0.1,
    step: 0.001,
  },
];

const AIM_ASSIST_PARAMS: {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "aimAssistDiameter",
    label: "Shot Assist Diameter",
    min: 0.02,
    max: 0.8,
    step: 0.01,
  },
  {
    key: "aimAssistGrabDiameter",
    label: "Grab Assist Diameter",
    min: 0.1,
    max: 2.0,
    step: 0.05,
  },
  {
    key: "aimAssistSmoothing",
    label: "Circle Smoothing (λ)",
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: "aimAssistSlowdown",
    label: "Aim Slowdown",
    min: 0,
    max: 0.8,
    step: 0.05,
  },
  {
    key: "aimAssistMouseScale",
    label: "Mouse Assist Scale",
    min: 0,
    max: 1.0,
    step: 0.05,
  },
  {
    key: "aimAssistStrength",
    label: "Yaw Assist Strength",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "aimAssistPitchStrength",
    label: "Pitch Assist Strength",
    min: 0,
    max: 1,
    step: 0.05,
  },
];

export function DebugTab() {
  const [, tick] = useState(0);

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

  return (
    <>
      {/* Physics */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Physics</span>
        {PHYSICS_PARAMS.map(({ key, label, min, max, step }) => (
          <div key={key} className={styles.paramRow}>
            <div className={styles.paramHeader}>
              <span className={styles.paramLabel}>{label}</span>
              <span className={styles.paramValue}>
                {gameConfig[key].toFixed(3)}
              </span>
            </div>
            <Slider
              value={gameConfig[key]}
              onChange={(v) => updateConfig(key, v)}
              min={min}
              max={max}
              step={step}
              variant="yellow"
            />
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Aim Assist */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Aim Assist</span>

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Show Assist Circles</span>
          <Button
            variant={gameConfig.showAimAssistCircle ? "accent" : "default"}
            size="sm"
            onClick={() =>
              updateConfig(
                "showAimAssistCircle",
                !gameConfig.showAimAssistCircle,
              )
            }
          >
            {gameConfig.showAimAssistCircle ? "ON" : "OFF"}
          </Button>
        </div>

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Show Target Debug</span>
          <Button
            variant={gameConfig.showTargetDebug ? "accent" : "default"}
            size="sm"
            onClick={() =>
              updateConfig("showTargetDebug", !gameConfig.showTargetDebug)
            }
          >
            {gameConfig.showTargetDebug ? "ON" : "OFF"}
          </Button>
        </div>

        {AIM_ASSIST_PARAMS.map(({ key, label, min, max, step }) => (
          <div key={key} className={styles.paramRow}>
            <div className={styles.paramHeader}>
              <span className={styles.paramLabel}>{label}</span>
              <span className={styles.paramValue}>
                {gameConfig[key].toFixed(2)}
              </span>
            </div>
            <Slider
              value={gameConfig[key]}
              onChange={(v) => updateConfig(key, v)}
              min={min}
              max={max}
              step={step}
              variant="yellow"
            />
          </div>
        ))}
      </div>

      <div className={styles.divider} />
    </>
  );
}
