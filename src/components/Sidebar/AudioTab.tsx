import { useEffect, useRef } from "react";
import { audioManager } from "../../audio/AudioManager";
import { Button } from "../../ui/Button";
import { Progress, type ProgressHandle } from "../../ui/Progress";
import { Slider } from "../../ui/Slider";
import styles from "./AudioTab.module.css";

interface AudioTabProps {
  audioBlocked: boolean;
  masterVolume: number;
  masterMuted: boolean;
  micMuted: boolean;
  onMasterVolume: (value: number) => void;
  onMasterMuted: () => void;
  onMicMuted: () => void;
}

export function AudioTab({
  audioBlocked,
  masterVolume,
  masterMuted,
  micMuted,
  onMasterVolume,
  onMasterMuted,
  onMicMuted,
}: AudioTabProps) {
  const micMeterRef = useRef<ProgressHandle>(null);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const { mic } = audioManager.getVolumes();
      micMeterRef.current?.setValue(Math.min(1, mic * 5));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {audioBlocked && (
        <div className={styles.blockedBanner}>
          Microphone blocked — you are muted! Use headphones to avoid echo.
        </div>
      )}

      <div className={styles.section}>
        <span className={styles.label}>Master Volume</span>
        <div className={styles.row}>
          <Slider
            value={masterVolume}
            onChange={onMasterVolume}
            min={0}
            max={100}
          />
          <span className={styles.volumeValue}>{masterVolume}%</span>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.label}>Controls</span>
        <div className={styles.buttonRow}>
          <Button
            variant={masterMuted ? "danger" : "default"}
            size="sm"
            onClick={onMasterMuted}
          >
            {masterMuted ? "🔇 Output Muted" : "🔊 Output"}
          </Button>
          <Button
            variant={micMuted ? "danger" : "default"}
            size="sm"
            onClick={onMicMuted}
          >
            {micMuted ? "🔇 Mic Muted" : "🎙️ Mic"}
          </Button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.label}>Mic Level</span>
        <div className={styles.meterRow}>
          <span className={styles.meterLabel}>MIC</span>
          <Progress ref={micMeterRef} variant="green" />
        </div>
      </div>
    </>
  );
}
