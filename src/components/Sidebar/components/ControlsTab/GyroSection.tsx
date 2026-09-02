import { useState, useEffect } from "react";
import {
  gameConfig,
  updateConfig,
  DUALSENSE_GYRO_MODES,
  type DualSenseGyroMode,
} from "@/config";
import { dualSenseHidSource } from "@/input/dualsenseSource";
import { Button } from "@/components/ui/Button/Button";
import { Slider } from "@/components/ui/Slider/Slider";
import { Select } from "@/components/ui/Select/Select";
import styles from "./ControlsTab.module.css";

const GYRO_MODE_LABELS: Record<DualSenseGyroMode, string> = {
  aiming: "While Aiming (Hold L2)",
  always: "Always On",
  disabled: "Disabled",
};

const GYRO_MODE_OPTIONS = DUALSENSE_GYRO_MODES.map((value) => ({
  value,
  label: GYRO_MODE_LABELS[value],
}));

/** DualSense motion controls: pairing, status, and gyro tuning. */
export function GyroSection() {
  const [dsState, setDsState] = useState(() => dualSenseHidSource.getState());
  const [isPairing, setIsPairing] = useState(false);
  const [pairFailed, setPairFailed] = useState(false);

  useEffect(() => {
    return dualSenseHidSource.subscribeState(setDsState);
  }, []);

  const isWebHidSupported =
    typeof navigator !== "undefined" && Boolean(navigator.hid);
  const isGyroOff = gameConfig.dualsenseGyroMode === "disabled";

  const handlePair = async (): Promise<void> => {
    setIsPairing(true);
    setPairFailed(false);
    try {
      setPairFailed(!(await dualSenseHidSource.requestPair()));
    } finally {
      setIsPairing(false);
    }
  };

  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>Gyro Controls (DualSense)</span>

      <div className={styles.statusCard}>
        <div className={styles.toggleLabelGroup}>
          <span className={styles.statusLabel}>DualSense Gyro (WebHID)</span>
          <span
            className={[
              dsState.connected
                ? styles.statusConnected
                : styles.statusDisconnected,
              styles.deviceName,
            ].join(" ")}
          >
            {dsState.connected
              ? `🎮 ${dsState.deviceName ?? "DualSense"} (${dsState.connectionType?.toUpperCase() ?? "HID"})`
              : isWebHidSupported
                ? "No DualSense connected"
                : "WebHID not supported in this browser"}
          </span>
        </div>

        <div className={styles.statusValue}>
          {dsState.batteryLevel !== null && (
            <span className={styles.batteryBadge}>
              {`🔋 ${dsState.batteryLevel}%${dsState.isCharging ? " ⚡" : ""}`}
            </span>
          )}
          {isWebHidSupported && (
            <Button
              variant={dsState.connected ? "default" : "accent"}
              size="sm"
              onClick={
                dsState.connected
                  ? () => dualSenseHidSource.detachDevice()
                  : handlePair
              }
              disabled={isPairing}
            >
              {dsState.connected
                ? "Disconnect"
                : isPairing
                  ? "Pairing…"
                  : "Pair DualSense"}
            </Button>
          )}
        </div>
      </div>

      {pairFailed && (
        <span className={styles.hint}>
          Pairing cancelled or failed · connect the controller by USB or
          Bluetooth, then try again
        </span>
      )}

      <div className={styles.paramRow}>
        <div className={styles.paramHeader}>
          <span className={styles.paramLabel}>Gyro Aim Mode</span>
        </div>
        <Select
          value={gameConfig.dualsenseGyroMode}
          onChange={(v) =>
            updateConfig("dualsenseGyroMode", v as DualSenseGyroMode)
          }
          options={GYRO_MODE_OPTIONS}
        />
        <span className={styles.hint}>
          Motion aiming only while L2 is held, always on, or off
        </span>
      </div>

      <div className={styles.paramRow}>
        <div className={styles.paramHeader}>
          <span className={styles.paramLabel}>Gyro Sensitivity</span>
          <span className={styles.paramValue}>
            {gameConfig.dualsenseGyroSensitivity.toFixed(1)}x
          </span>
        </div>
        <Slider
          value={gameConfig.dualsenseGyroSensitivity}
          onChange={(v) => updateConfig("dualsenseGyroSensitivity", v)}
          min={0.2}
          max={5.0}
          step={0.1}
          disabled={isGyroOff}
          variant="blue"
        />
        <span className={styles.hint}>
          Motion angular scaling multiplier for fine aim
        </span>
      </div>

      <div className={styles.toggleRow}>
        <div className={styles.toggleLabelGroup}>
          <span className={styles.toggleLabel}>Invert Gyro Pitch</span>
          <span className={styles.hint}>
            Flip vertical motion sensor direction
          </span>
        </div>
        <Button
          variant={gameConfig.dualsenseGyroInvertY ? "accent" : "default"}
          size="sm"
          onClick={() =>
            updateConfig(
              "dualsenseGyroInvertY",
              !gameConfig.dualsenseGyroInvertY,
            )
          }
          disabled={isGyroOff}
        >
          {gameConfig.dualsenseGyroInvertY ? "ON" : "OFF"}
        </Button>
      </div>

      <div className={styles.actionRow}>
        <div className={styles.toggleLabelGroup}>
          <span className={styles.toggleLabel}>Recalibrate Gyro</span>
          <span className={styles.hint}>
            Place controller on flat surface to zero drift
          </span>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => dualSenseHidSource.recalibrate()}
          disabled={!dsState.connected || dsState.isCalibrating}
        >
          {dsState.isCalibrating ? "Calibrating…" : "Recalibrate"}
        </Button>
      </div>
    </div>
  );
}
