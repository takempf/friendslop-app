import { useState, useEffect } from "react";
import { gameConfig, updateConfig, subscribeToConfig } from "@/config";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import { Switch } from "@/components/ui/Switch/Switch";
import { CRT_TARGET_HEIGHT } from "@/constants/render";
import styles from "./GraphicsTab.module.css";

type ToggleKey =
  "crtEnabled" | "ditherEnabled" | "crtSmoothing" | "showFps" | "showPerf";

const TOGGLES: { key: ToggleKey; label: string; sublabel?: string }[] = [
  { key: "crtEnabled", label: "CRT Filter" },
  {
    key: "ditherEnabled",
    label: "Dither",
    sublabel: "PS1 15-bit color dithering",
  },
  { key: "crtSmoothing", label: "Smoothing", sublabel: "CRT texture filter" },
  { key: "showFps", label: "Show FPS" },
  {
    key: "showPerf",
    label: "Show Advanced Performance Data",
    sublabel:
      "GPU timers may show 0.000ms due to browser security restrictions",
  },
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

  const targetDisplayHeight = gameConfig.crtEnabled
    ? gameConfig.renderHeight
    : CRT_TARGET_HEIGHT;
  const renderWidth = Math.round(
    (windowDims.w / windowDims.h) * targetDisplayHeight,
  );

  const cloudHeight = Math.round(
    CRT_TARGET_HEIGHT * gameConfig.cloudResolution,
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
            <Switch
              checked={Boolean(gameConfig[key])}
              onChange={(next) => updateConfig(key, next)}
              ariaLabel={label}
            />
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>CRT Mask Style</span>
          </div>
          <div className={styles.buttonGroup}>
            <Button
              variant={
                gameConfig.crtMaskStyle === "aperture" ? "accent" : "default"
              }
              size="sm"
              disabled={!gameConfig.crtEnabled}
              onClick={() => updateConfig("crtMaskStyle", "aperture")}
            >
              Aperture Grille
            </Button>
            <Button
              variant={
                gameConfig.crtMaskStyle === "slot" ? "accent" : "default"
              }
              size="sm"
              disabled={!gameConfig.crtEnabled}
              onClick={() => updateConfig("crtMaskStyle", "slot")}
            >
              Slot Mask
            </Button>
          </div>
          <span className={styles.hint}>
            Trinitron vertical stripes or classic staggered slot mask
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Scanline Intensity</span>
            <span className={styles.paramValue}>
              {Math.round(gameConfig.crtScanlines * 100)}%
            </span>
          </div>
          <Slider
            value={gameConfig.crtScanlines}
            onChange={(v) => updateConfig("crtScanlines", v)}
            min={0}
            max={1}
            step={0.05}
            disabled={!gameConfig.crtEnabled}
            variant="yellow"
          />
          <span className={styles.hint}>
            Depth of the horizontal electron beam gaps
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>CRT Bloom / Glow</span>
            <span className={styles.paramValue}>
              {Math.round(gameConfig.crtBloom * 100)}%
            </span>
          </div>
          <Slider
            value={gameConfig.crtBloom}
            onChange={(v) => updateConfig("crtBloom", v)}
            min={0}
            max={1}
            step={0.05}
            disabled={!gameConfig.crtEnabled}
            variant="yellow"
          />
          <span className={styles.hint}>
            Emissive phosphor scatter and halation glow
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>RGB Convergence</span>
            <span className={styles.paramValue}>
              {Math.round(gameConfig.crtRgbShift * 100)}%
            </span>
          </div>
          <Slider
            value={gameConfig.crtRgbShift}
            onChange={(v) => updateConfig("crtRgbShift", v)}
            min={0}
            max={1}
            step={0.05}
            disabled={!gameConfig.crtEnabled}
            variant="yellow"
          />
          <span className={styles.hint}>
            Electron gun beam misalignment and chromatic fringe
          </span>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleLabelGroup}>
            <span className={styles.toggleLabel}>Cathode Flicker</span>
            <span className={styles.hint}>Subtle 60Hz beam scan refresh</span>
          </div>
          <Switch
            checked={gameConfig.crtFlicker}
            disabled={!gameConfig.crtEnabled}
            onChange={(next) => updateConfig("crtFlicker", next)}
            ariaLabel="Cathode Flicker"
          />
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>
              {gameConfig.crtEnabled
                ? "CRT Output Resolution"
                : "Render Resolution"}
            </span>
            <span className={styles.paramValue}>
              {renderWidth} × {targetDisplayHeight}
            </span>
          </div>
          <Slider
            value={gameConfig.renderHeight}
            onChange={(v) => updateConfig("renderHeight", v)}
            min={640}
            max={2160}
            step={80}
            disabled={!gameConfig.crtEnabled}
            variant="yellow"
          />
          {!gameConfig.crtEnabled && (
            <span className={styles.hint}>
              Fixed at 640p when CRT filter is disabled
            </span>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleLabelGroup}>
            <span className={styles.toggleLabel}>Volumetric Clouds</span>
            <span className={styles.hint}>Raymarched 3D sky simulation</span>
          </div>
          <Switch
            checked={gameConfig.showClouds}
            onChange={(next) => updateConfig("showClouds", next)}
            ariaLabel="Volumetric Clouds"
          />
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Resolution</span>
            <span className={styles.paramValue}>
              {Math.round(gameConfig.cloudResolution * 100)}% · {cloudHeight}p
            </span>
          </div>
          <Slider
            value={gameConfig.cloudResolution}
            onChange={(v) => updateConfig("cloudResolution", v)}
            min={0.2}
            max={1}
            step={0.05}
            disabled={!gameConfig.showClouds}
            variant="blue"
          />
          <span className={styles.hint}>
            Biggest lever — cost scales with the square of this
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Ray Steps</span>
            <span className={styles.paramValue}>{gameConfig.cloudSteps}</span>
          </div>
          <Slider
            value={gameConfig.cloudSteps}
            onChange={(v) => updateConfig("cloudSteps", v)}
            min={12}
            max={64}
            step={2}
            disabled={!gameConfig.showClouds}
            variant="blue"
          />
          <span className={styles.hint}>
            Samples through the cloud layer — low values band the edges
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Shadow Steps</span>
            <span className={styles.paramValue}>
              {gameConfig.cloudLightSteps}
            </span>
          </div>
          <Slider
            value={gameConfig.cloudLightSteps}
            onChange={(v) => updateConfig("cloudLightSteps", v)}
            min={1}
            max={8}
            step={1}
            disabled={!gameConfig.showClouds}
            variant="blue"
          />
          <span className={styles.hint}>
            Self-shadowing depth — low values flatten the clouds out
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Detail</span>
            <span className={styles.paramValue}>
              {gameConfig.cloudDetail} oct
            </span>
          </div>
          <Slider
            value={gameConfig.cloudDetail}
            onChange={(v) => updateConfig("cloudDetail", v)}
            min={1}
            max={5}
            step={1}
            disabled={!gameConfig.showClouds}
            variant="blue"
          />
          <span className={styles.hint}>
            Noise octaves eroding the silhouettes
          </span>
        </div>
      </div>
    </>
  );
}
