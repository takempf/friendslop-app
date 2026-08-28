import { useState, useCallback, useEffect, type JSX } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useGameSync } from "@/sync/GameSyncProvider";
import { audioManager } from "@/audio/AudioManager";
import { Tabs, TabPanel } from "@/components/ui/Tabs/Tabs";
import { AudioTab } from "@/components/Sidebar/components/AudioTab/AudioTab";
import { PlayersTab } from "@/components/Sidebar/components/PlayersTab/PlayersTab";
import { DebugTab } from "@/components/Sidebar/components/DebugTab/DebugTab";
import { GraphicsTab } from "@/components/Sidebar/components/GraphicsTab/GraphicsTab";
import css from "./GameMenu.module.css";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const LS_MASTER_VOL = "friendslop_masterVolume";
const LS_MASTER_MUTED = "friendslop_masterMuted";
const LS_MIC_MUTED = "friendslop_micMuted";

const TABS = [
  { value: "audio", label: "Audio" },
  { value: "players", label: "Players" },
  { value: "graphics", label: "Graphics" },
  ...(isLocalhost ? [{ value: "debug", label: "Debug" }] : []),
];

export function GameMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const { connectedPeers, audioBlocked, myName, myColorIndex, myEmojiIndex } =
    useGameSync();

  const [activeTab, setActiveTab] = useState("audio");

  // ── ESC handling ─────────────────────────────────────────────
  // Capture phase fires before Base UI's listener, so we can suppress
  // its built-in ESC-to-close when open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation(); // prevent Base UI from closing
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return (): void => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [open]);

  // ── Audio state (persisted) ───────────────────────────────────
  const [masterVolume, setMasterVolume] = useState(() => {
    const saved = localStorage.getItem(LS_MASTER_VOL);
    return saved !== null ? Number(saved) : 100;
  });
  const [masterMuted, setMasterMuted] = useState(
    () => localStorage.getItem(LS_MASTER_MUTED) === "true",
  );
  const [micMuted, setMicMuted] = useState(
    () => localStorage.getItem(LS_MIC_MUTED) === "true",
  );

  // ── Per-peer audio state ──────────────────────────────────────
  const [peerVolumes, setPeerVolumes] = useState<Record<number, number>>({});
  const [peerMuted, setPeerMuted] = useState<Record<number, boolean>>({});

  const handleMasterVolume = useCallback((value: number): void => {
    setMasterVolume(value);
    localStorage.setItem(LS_MASTER_VOL, String(value));
    audioManager.setMasterVolume(value);
  }, []);

  const handleMasterMuted = useCallback((): void => {
    setMasterMuted((prev) => {
      const next = !prev;
      localStorage.setItem(LS_MASTER_MUTED, String(next));
      audioManager.setMasterMuted(next);
      return next;
    });
  }, []);

  const handleMicMuted = useCallback((): void => {
    setMicMuted((prev) => {
      const next = !prev;
      localStorage.setItem(LS_MIC_MUTED, String(next));
      audioManager.setMicMuted(next);
      return next;
    });
  }, []);

  const handlePeerVolume = useCallback((id: number, value: number): void => {
    setPeerVolumes((prev) => ({ ...prev, [id]: value }));
    audioManager.setPeerVolume(id, value);
  }, []);

  const handlePeerMuted = useCallback((id: number): void => {
    setPeerMuted((prev) => {
      const next = !prev[id];
      audioManager.setPeerMuted(id, next);
      return { ...prev, [id]: next };
    });
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={css.backdrop} />
        <Dialog.Popup className={css.popup}>
          <div className={css.header}>
            <Dialog.Title className={css.title}>Friend Slop 3D</Dialog.Title>
            <Dialog.Close className={css.closeBtn} aria-label="Close">
              ✕
            </Dialog.Close>
          </div>

          <Tabs
            tabs={TABS}
            value={activeTab}
            onValueChange={setActiveTab}
            className={css.tabsRoot}
          >
            <TabPanel value="audio">
              <AudioTab
                audioBlocked={audioBlocked}
                masterVolume={masterVolume}
                masterMuted={masterMuted}
                micMuted={micMuted}
                onMasterVolume={handleMasterVolume}
                onMasterMuted={handleMasterMuted}
                onMicMuted={handleMicMuted}
              />
            </TabPanel>

            <TabPanel value="players">
              <PlayersTab
                myName={myName}
                myColorIndex={myColorIndex}
                myEmojiIndex={myEmojiIndex}
                connectedPeers={connectedPeers}
                peerVolumes={peerVolumes}
                peerMuted={peerMuted}
                onPeerVolume={handlePeerVolume}
                onPeerMuted={handlePeerMuted}
              />
            </TabPanel>

            <TabPanel value="graphics">
              <GraphicsTab />
            </TabPanel>

            {isLocalhost && (
              <TabPanel value="debug">
                <DebugTab />
              </TabPanel>
            )}
          </Tabs>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
