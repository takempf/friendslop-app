import { useState, useEffect } from "react";
import { gameConfig, updateConfig, subscribeToConfig } from "@/config";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import styles from "./ControlsTab.module.css";

export function ControlsTab() {
  const [, tick] = useState(0);
  const [gamepadName, setGamepadName] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

  useEffect(() => {
    const updateGamepadStatus = (): void => {
      if (typeof navigator === "undefined" || !navigator.getGamepads) {
        setGamepadName(null);
        return;
      }
      const pads = Array.from(navigator.getGamepads());
      const connectedPad = pads.find((p): p is Gamepad =>
        Boolean(p && p.connected),
      );
      setGamepadName(connectedPad ? connectedPad.id : null);
    };

    updateGamepadStatus();
    window.addEventListener("gamepadconnected", updateGamepadStatus);
    window.addEventListener("gamepaddisconnected", updateGamepadStatus);
    const interval = setInterval(updateGamepadStatus, 1000);

    return (): void => {
      window.removeEventListener("gamepadconnected", updateGamepadStatus);
      window.removeEventListener("gamepaddisconnected", updateGamepadStatus);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      <div className={styles.section}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Gamepad Status</span>
          <span
            className={
              gamepadName ? styles.statusConnected : styles.statusDisconnected
            }
          >
            {gamepadName
              ? `🎮 ${gamepadName.slice(0, 24)}`
              : "No gamepad detected"}
          </span>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleLabelGroup}>
            <span className={styles.toggleLabel}>Enable Gamepad</span>
            <span className={styles.hint}>Allow standard controller input</span>
          </div>
          <Button
            variant={gameConfig.gamepadEnabled ? "accent" : "default"}
            size="sm"
            onClick={() =>
              updateConfig("gamepadEnabled", !gameConfig.gamepadEnabled)
            }
          >
            {gameConfig.gamepadEnabled ? "ON" : "OFF"}
          </Button>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleLabelGroup}>
            <span className={styles.toggleLabel}>Invert Y-Axis</span>
            <span className={styles.hint}>
              Invert vertical stick look direction
            </span>
          </div>
          <Button
            variant={gameConfig.gamepadInvertY ? "accent" : "default"}
            size="sm"
            onClick={() =>
              updateConfig("gamepadInvertY", !gameConfig.gamepadInvertY)
            }
            disabled={!gameConfig.gamepadEnabled}
          >
            {gameConfig.gamepadInvertY ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Stick Sensitivity</span>
            <span className={styles.paramValue}>
              {gameConfig.gamepadLookSensitivity.toFixed(1)} rad/s
            </span>
          </div>
          <Slider
            value={gameConfig.gamepadLookSensitivity}
            onChange={(v) => updateConfig("gamepadLookSensitivity", v)}
            min={1.0}
            max={8.0}
            step={0.2}
            disabled={!gameConfig.gamepadEnabled}
            variant="blue"
          />
          <span className={styles.hint}>
            Turn rate for right stick at full deflection
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Response Curve</span>
            <span className={styles.paramValue}>
              {gameConfig.gamepadLookCurve <= 1.2
                ? `${gameConfig.gamepadLookCurve.toFixed(1)} Linear`
                : gameConfig.gamepadLookCurve <= 1.8
                  ? `${gameConfig.gamepadLookCurve.toFixed(1)} Standard`
                  : `${gameConfig.gamepadLookCurve.toFixed(1)} Fine`}
            </span>
          </div>
          <Slider
            value={gameConfig.gamepadLookCurve}
            onChange={(v) => updateConfig("gamepadLookCurve", v)}
            min={1.0}
            max={2.5}
            step={0.1}
            disabled={!gameConfig.gamepadEnabled}
            variant="yellow"
          />
          <span className={styles.hint}>
            Stick travel curve · Linear (1.0) to fine-aim (2.5)
          </span>
        </div>

        <div className={styles.paramRow}>
          <div className={styles.paramHeader}>
            <span className={styles.paramLabel}>Stick Deadzone</span>
            <span className={styles.paramValue}>
              {Math.round(gameConfig.gamepadDeadzone * 100)}%
            </span>
          </div>
          <Slider
            value={gameConfig.gamepadDeadzone}
            onChange={(v) => updateConfig("gamepadDeadzone", v)}
            min={0.02}
            max={0.35}
            step={0.01}
            disabled={!gameConfig.gamepadEnabled}
            variant="yellow"
          />
          <span className={styles.hint}>
            Radial deadzone to eliminate stick drift
          </span>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.bindingsGrid}>
          <div className={styles.bindingColumn}>
            <span className={styles.bindingHeader}>Gamepad</span>
            <div className={styles.bindingRow}>
              <span>Move</span>
              <span className={styles.bindingKey}>Left Stick</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Look</span>
              <span className={styles.bindingKey}>Right Stick</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Sprint</span>
              <span className={styles.bindingKey}>L3</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Jump</span>
              <span className={styles.bindingKey}>A</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Crouch</span>
              <span className={styles.bindingKey}>B</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Pick Up / Drop</span>
              <span className={styles.bindingKey}>X</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Charge & Throw</span>
              <span className={styles.bindingKey}>Hold RT</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Pause / Menu</span>
              <span className={styles.bindingKey}>Start</span>
            </div>
          </div>

          <div className={styles.bindingColumn}>
            <span className={styles.bindingHeader}>Keyboard & Mouse</span>
            <div className={styles.bindingRow}>
              <span>Move</span>
              <span className={styles.bindingKey}>WASD</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Look</span>
              <span className={styles.bindingKey}>Mouse</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Sprint</span>
              <span className={styles.bindingKey}>Shift</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Jump</span>
              <span className={styles.bindingKey}>Space</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Crouch</span>
              <span className={styles.bindingKey}>C</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Pick Up / Drop</span>
              <span className={styles.bindingKey}>E</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Charge & Throw</span>
              <span className={styles.bindingKey}>Hold Q</span>
            </div>
            <div className={styles.bindingRow}>
              <span>Pause / Menu</span>
              <span className={styles.bindingKey}>Esc</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
