import { useState, useEffect } from "react";
import { gameConfig, updateConfig, subscribeToConfig } from "@/config";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import styles from "./GraphicsTab.module.css";

type ToggleKey =
  | "crtEnabled"
  | "crtSmoothing"
  | "showFps"
  | "showPerf"
  | "showClouds";

const TOGGLES: { key: ToggleKey; label: string; sublabel?: string }[] = [
  { key: "crtEnabled", label: "CRT Filter" },
  { key: "crtSmoothing", label: "Smoothing", sublabel: "CRT texture filter" },
  { key: "showFps", label: "Show FPS" },
  {
    key: "showPerf",
    label: "Show Advanced Performance Data",
    sublabel:
      "GPU timers may show 0.000ms due to browser security restrictions",
  },
  { key: "showClouds", label: "Show Clouds" },
];

export function GraphicsTab() {
  const [, tick] = useState(0);
  const [windowDims, setWindowDims] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

  useEffect(() => {
    const onResize = () =>
      setWindowDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const renderWidth = Math.round(
    (windowDims.w / windowDims.h) * gameConfig.renderHeight,
  );

  return (
    <>
      <div className={styles.section}>
        {TOGGLES.map(({ key, label, sublabel }) => (
          <div key={key} className={styles.toggleRow}>
            <div className={styles.toggleLabelGroup}>
              <span className={styles.toggleLabel}>{label}</span>
              {sublabel && <span className={styles.hint}>{sublabel}</span>}
            </div>
            <Button
              variant={gameConfig[key] ? "accent" : "default"}
              size="sm"
              onClick={() => updateConfig(key, !gameConfig[key])}
            >
              {gameConfig[key] ? "ON" : "OFF"}
            </Button>
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Render Resolution</span>
            <span className={styles.paramValue}>
              {renderWidth} × {gameConfig.renderHeight}
            </span>
          </div>
          <Slider
            value={gameConfig.renderHeight}
            onChange={(v) => updateConfig("renderHeight", v)}
            min={640}
            max={2160}
            step={80}
            variant="yellow"
          />
        </div>
      </div>
    </>
  );
}
