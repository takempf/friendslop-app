import { useState, useCallback } from "react";
import { useGameSync } from "@/sync/GameSyncProvider";
import { audioManager } from "@/audio/AudioManager";
import { Tabs, TabPanel } from "@/components/ui/Tabs/Tabs";
import { AudioTab } from "./components/AudioTab/AudioTab";
import { PlayersTab } from "./components/PlayersTab/PlayersTab";
import { ChatTab } from "./components/ChatTab/ChatTab";
import { DebugTab } from "./components/DebugTab/DebugTab";
import styles from "./Sidebar.module.css";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// localStorage keys
const LS_MASTER_VOL = "friendslop_masterVolume";
const LS_MASTER_MUTED = "friendslop_masterMuted";
const LS_MIC_MUTED = "friendslop_micMuted";

const TABS = [
  { value: "audio", label: "Audio" },
  { value: "players", label: "Players" },
  { value: "chat", label: "Chat" },
  ...(isLocalhost ? [{ value: "debug", label: "Debug" }] : []),
];

export function Sidebar() {
  const {
    sync,
    chatMessages,
    connectedPeers,
    audioBlocked,
    myName,
    myColorIndex,
    myEmojiIndex,
  } = useGameSync();

  const [activeTab, setActiveTab] = useState("audio");

  // ── Global audio state ─────────────────────────────────────────
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

  // ── Per-peer audio state ───────────────────────────────────────
  const [peerVolumes, setPeerVolumes] = useState<Record<number, number>>({});
  const [peerMuted, setPeerMuted] = useState<Record<number, boolean>>({});

  const handleMasterVolume = useCallback((value: number) => {
    setMasterVolume(value);
    localStorage.setItem(LS_MASTER_VOL, String(value));
    audioManager.setMasterVolume(value);
  }, []);

  const handleMasterMuted = useCallback(() => {
    setMasterMuted((prev) => {
      const next = !prev;
      localStorage.setItem(LS_MASTER_MUTED, String(next));
      audioManager.setMasterMuted(next);
      return next;
    });
  }, []);

  const handleMicMuted = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      localStorage.setItem(LS_MIC_MUTED, String(next));
      audioManager.setMicMuted(next);
      return next;
    });
  }, []);

  const handlePeerVolume = useCallback((id: number, value: number) => {
    setPeerVolumes((prev) => ({ ...prev, [id]: value }));
    audioManager.setPeerVolume(id, value);
  }, []);

  const handlePeerMuted = useCallback((id: number) => {
    setPeerMuted((prev) => {
      const next = !prev[id];
      audioManager.setPeerMuted(id, next);
      return { ...prev, [id]: next };
    });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      sync?.sendChatMessage(text);
    },
    [sync],
  );

  return (
    <div className={styles.root}>
      <Tabs tabs={TABS} value={activeTab} onValueChange={setActiveTab}>
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

        <TabPanel value="chat" className={styles.chatPanel}>
          <ChatTab messages={chatMessages} onSend={handleSend} />
        </TabPanel>

        {isLocalhost && (
          <TabPanel value="debug">
            <DebugTab />
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
}
