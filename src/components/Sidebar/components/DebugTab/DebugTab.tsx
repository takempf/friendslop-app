import { useState, useEffect } from "react";
import {
  debugConfig,
  updateDebugConfig,
  subscribeToDebugConfig,
} from "@/debug/config";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import styles from "./DebugTab.module.css";

type ConfigKey = keyof typeof debugConfig;
type NumericConfigKey = {
  [K in ConfigKey]: (typeof debugConfig)[K] extends number ? K : never;
}[ConfigKey];

const PHYSICS_PARAMS: {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "renderScale", label: "Render Scale", min: 0.25, max: 1, step: 0.05 },
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

export function DebugTab() {
  const [, tick] = useState(0);

  useEffect(() => {
    return subscribeToDebugConfig(() => tick((n) => n + 1));
  }, []);

  return (
    <>
      {/* CRT */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CRT Filter</span>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Enabled</span>
          <Button
            variant={debugConfig.crtEnabled ? "accent" : "default"}
            size="sm"
            onClick={() => {
              updateDebugConfig("crtEnabled", !debugConfig.crtEnabled);
            }}
          >
            {debugConfig.crtEnabled ? "ON" : "OFF"}
          </Button>
        </div>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Smoothing</span>
          <Button
            variant={debugConfig.crtSmoothing ? "accent" : "default"}
            size="sm"
            onClick={() => {
              updateDebugConfig("crtSmoothing", !debugConfig.crtSmoothing);
            }}
          >
            {debugConfig.crtSmoothing ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Performance */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Performance</span>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Perf Monitor</span>
          <Button
            variant={debugConfig.showPerf ? "accent" : "default"}
            size="sm"
            onClick={() => {
              updateDebugConfig("showPerf", !debugConfig.showPerf);
            }}
          >
            {debugConfig.showPerf ? "ON" : "OFF"}
          </Button>
        </div>
        <p className={styles.perfNote}>
          Note: GPU "0.000ms" is common due to browser security restrictions on
          timer queries. To see this data, launch Chrome with
          --enable-webgl-draft-extensions.
        </p>
      </div>

      <div className={styles.divider} />

      {/* Physics */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Physics</span>
        {PHYSICS_PARAMS.map(({ key, label, min, max, step }) => (
          <div key={key} className={styles.paramRow}>
            <div className={styles.paramHeader}>
              <span className={styles.paramLabel}>{label}</span>
              <span className={styles.paramValue}>
                {debugConfig[key].toFixed(3)}
              </span>
            </div>
            <Slider
              value={debugConfig[key]}
              onChange={(v) => updateDebugConfig(key, v)}
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
