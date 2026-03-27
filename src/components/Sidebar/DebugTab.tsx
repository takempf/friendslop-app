import { useState, useEffect } from "react";
import { debugConfig } from "../../debug/config";
import { audioManager } from "../../audio/AudioManager";
import { Button } from "../../ui/Button";
import { Select, type SelectOption } from "../../ui/Select";
import { Slider } from "../../ui/Slider";
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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState("default");
  const [selectedOutput, setSelectedOutput] = useState("default");

  useEffect(() => {
    let mounted = true;
    audioManager.enumerateDevices().then((devs) => {
      if (mounted) setDevices(devs);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updateParam = (key: NumericConfigKey, value: number) => {
    // eslint-disable-next-line react-hooks/immutability
    debugConfig[key] = value;
    tick((n) => n + 1);
  };

  const inputOptions: SelectOption[] = devices
    .filter((d) => d.kind === "audioinput")
    .map((d) => ({
      value: d.deviceId,
      label: d.label || `Mic ${d.deviceId.slice(0, 5)}…`,
    }));
  if (inputOptions.length === 0)
    inputOptions.push({ value: "default", label: "Default Mic" });

  const outputOptions: SelectOption[] = devices
    .filter((d) => d.kind === "audiooutput")
    .map((d) => ({
      value: d.deviceId,
      label: d.label || `Speaker ${d.deviceId.slice(0, 5)}…`,
    }));
  if (outputOptions.length === 0)
    outputOptions.push({ value: "default", label: "Default Speaker" });

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
              debugConfig.crtEnabled = !debugConfig.crtEnabled;
              tick((n) => n + 1);
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
              debugConfig.crtSmoothing = !debugConfig.crtSmoothing;
              tick((n) => n + 1);
            }}
          >
            {debugConfig.crtSmoothing ? "ON" : "OFF"}
          </Button>
        </div>
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
              onChange={(v) => updateParam(key, v)}
              min={min}
              max={max}
              step={step}
              variant="yellow"
            />
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Audio devices */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>
          Audio Devices (Press B to test)
        </span>
        <div>
          <div className={styles.selectLabel}>Microphone</div>
          <Select
            value={selectedInput}
            onChange={(v) => {
              setSelectedInput(v);
              audioManager.setInputDevice(v).catch(console.error);
            }}
            options={inputOptions}
          />
        </div>
        <div>
          <div className={styles.selectLabel}>Speaker</div>
          <Select
            value={selectedOutput}
            onChange={(v) => {
              setSelectedOutput(v);
              audioManager.setOutputDevice(v).catch(console.error);
            }}
            options={outputOptions}
          />
        </div>
      </div>
    </>
  );
}
