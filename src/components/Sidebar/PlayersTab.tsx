import { useEffect, useRef } from "react";
import { audioManager } from "../../audio/AudioManager";
import { getPlayerColor, getPlayerEmoji } from "../../utils/colors";
import { Button } from "../../ui/Button";
import { Progress, type ProgressHandle } from "../../ui/Progress";
import { Slider } from "../../ui/Slider";
import styles from "./PlayersTab.module.css";

interface ConnectedPeer {
  id: number;
  name: string;
  colorIndex: number;
  emojiIndex: number;
}

interface PlayersTabProps {
  myName: string;
  myColorIndex: number;
  myEmojiIndex: number;
  connectedPeers: ConnectedPeer[];
  peerVolumes: Record<number, number>;
  peerMuted: Record<number, boolean>;
  onPeerVolume: (id: number, value: number) => void;
  onPeerMuted: (id: number) => void;
}

export function PlayersTab({
  myName,
  myColorIndex,
  myEmojiIndex,
  connectedPeers,
  peerVolumes,
  peerMuted,
  onPeerVolume,
  onPeerMuted,
}: PlayersTabProps) {
  const peerMeterRefs = useRef<Map<number, ProgressHandle>>(new Map());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const currentPeerVols = audioManager.getPeerVolumes();
      peerMeterRefs.current.forEach((handle, id) => {
        handle.setValue(Math.min(1, (currentPeerVols[id] ?? 0) * 5));
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={styles.list}>
      <div className={styles.countLabel}>
        Online ({connectedPeers.length + 1})
      </div>

      {/* Self */}
      <div
        className={styles.selfEntry}
        style={{ color: getPlayerColor(myColorIndex) }}
      >
        <span>{getPlayerEmoji(myEmojiIndex)}</span>
        <span>{myName}</span>
        <span className={styles.selfBadge}>(you)</span>
      </div>

      {/* Remote peers */}
      {connectedPeers.map((peer) => {
        const vol = peerVolumes[peer.id] ?? 100;
        const muted = peerMuted[peer.id] ?? false;
        return (
          <div key={peer.id} className={styles.peer}>
            <div className={styles.peerHeader}>
              <div
                className={styles.peerName}
                style={{ color: getPlayerColor(peer.colorIndex) }}
              >
                <span>{getPlayerEmoji(peer.emojiIndex)}</span>
                <span className={styles.peerNameText}>{peer.name}</span>
              </div>
              <Progress
                ref={(handle) => {
                  if (handle) peerMeterRefs.current.set(peer.id, handle);
                  else peerMeterRefs.current.delete(peer.id);
                }}
                variant="blue"
                className={styles.peerMeter}
              />
            </div>
            <div className={styles.peerControls}>
              <Button
                variant={muted ? "danger" : "default"}
                size="sm"
                onClick={() => onPeerMuted(peer.id)}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🔊"}
              </Button>
              <Slider
                value={vol}
                onChange={(v) => onPeerVolume(peer.id, v)}
                min={0}
                max={200}
                variant="blue"
              />
              <span className={styles.peerVolumeValue}>{vol}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
