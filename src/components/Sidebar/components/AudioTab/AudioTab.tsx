import { useEffect, useRef, useState } from "react";
import { audioManager } from "@/audio/AudioManager";
import { Button } from "@/components/ui/Button/Button";
import {
  Progress,
  type ProgressHandle,
} from "@/components/ui/Progress/Progress";
import { Slider } from "@/components/ui/Slider/Slider";
import { Select, type SelectOption } from "@/components/ui/Select/Select";

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
  const [selectedInput, setSelectedInput] = useState("default");
  const [selectedOutput, setSelectedOutput] = useState("default");

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let mounted = true;
    audioManager.enumerateDevices().then((devs) => {
      if (mounted) setDevices(devs);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
        <label className={styles.label}>Master Volume</label>
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
        <label className={styles.label}>Controls</label>
        <div className={styles.buttonRow}>
          <Button
            variant={masterMuted ? "danger" : "default"}
            onClick={onMasterMuted}
          >
            {masterMuted ? "🔇 Output Muted" : "🔊 Output"}
          </Button>
          <Button
            variant={micMuted ? "danger" : "default"}
            onClick={onMicMuted}
          >
            {micMuted ? "🔇 Mic Muted" : "🎙️ Mic"}
          </Button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <label className={styles.label}>Mic Level</label>
        <div className={styles.meterRow}>
          <span className={styles.meterLabel}>MIC</span>
          <Progress ref={micMeterRef} variant="green" />
        </div>
      </div>

      {/* Audio devices */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>Audio Devices (Press B to test)</h3>
        <div>
          <label className={styles.label}>Microphone</label>
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
          <label className={styles.label}>Speaker</label>
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
