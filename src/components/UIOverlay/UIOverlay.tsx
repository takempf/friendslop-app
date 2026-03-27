import { useGameSync } from "@/sync/GameSyncProvider";
import { useState, useEffect, useRef, useCallback } from "react";
import { DebugPanel } from "@/components/DebugPanel/DebugPanel";
import { audioManager } from "@/audio/AudioManager";
import { getPlayerColor, getPlayerEmoji } from "@/utils/colors";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// localStorage keys
const LS_MASTER_VOL = "friendslop_masterVolume";
const LS_MASTER_MUTED = "friendslop_masterMuted";
const LS_MIC_MUTED = "friendslop_micMuted";

export function UIOverlay() {
  const {
    sync,
    chatMessages,
    connectedPeers,
    audioBlocked,
    myName,
    myColorIndex,
    myEmojiIndex,
  } = useGameSync();
  const [chatInput, setChatInput] = useState("");
  const micMeterRef = useRef<HTMLProgressElement>(null);
  const peerMeterRefs = useRef<Map<number, HTMLProgressElement>>(new Map());

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("default");
  const [selectedOutput, setSelectedOutput] = useState<string>("default");

  // ─── Global audio state (persisted) ─────────────────────────────────
  const [masterVolume, setMasterVolume] = useState(() => {
    const saved = localStorage.getItem(LS_MASTER_VOL);
    return saved !== null ? Number(saved) : 100;
  });
  const [masterMuted, setMasterMuted] = useState(() => {
    return localStorage.getItem(LS_MASTER_MUTED) === "true";
  });
  const [micMuted, setMicMuted] = useState(() => {
    return localStorage.getItem(LS_MIC_MUTED) === "true";
  });

  // ─── Per-peer audio state (ephemeral) ────────────────────────────────
  const [peerVolumes, setPeerVolumes] = useState<Record<number, number>>({});
  const [peerMuted, setPeerMuted] = useState<Record<number, boolean>>({});

  // Apply persisted settings on mount
  useEffect(() => {
    audioManager.setMasterVolume(masterVolume);
    audioManager.setMasterMuted(masterMuted);
    audioManager.setMicMuted(micMuted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    let mounted = true;
    audioManager.enumerateDevices().then((devs) => {
      if (mounted) setDevices(devs);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Polling volumes — update DOM directly to avoid React re-renders at 60fps
  useEffect(() => {
    let raf: number;
    const loop = () => {
      const { mic } = audioManager.getVolumes();
      if (micMeterRef.current) {
        micMeterRef.current.value = Math.min(1, mic * 5);
      }

      const currentPeerVols = audioManager.getPeerVolumes();
      peerMeterRefs.current.forEach((el, id) => {
        el.value = Math.min(1, (currentPeerVols[id] ?? 0) * 5);
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hotkey mapping
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in chat
      if (e.key === "b" && document.activeElement?.tagName !== "INPUT") {
        audioManager.playTestSound();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (sync && chatInput.trim()) {
      sync.sendChatMessage(chatInput.trim());
      setChatInput("");
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto bg-zinc-900/50">
      {audioBlocked && (
        <div className="bg-red-500/80 text-white p-3 rounded-md shadow-lg text-sm font-bold text-center">
          Microphone access blocked. You are muted! Use headphones to avoid
          echo.
        </div>
      )}

      {/* ─── Audio Controls (always visible) ─────────────────────────── */}
      <div className="bg-black/40 text-white p-3 rounded-md w-full border border-zinc-800">
        <h3 className="font-bold border-b border-gray-600 mb-2 pb-1 text-sm">
          Audio
        </h3>
        <div className="flex flex-col gap-3 text-xs">
          {/* Master Volume */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 font-semibold">Volume</span>
              <span className="text-gray-300 tabular-nums w-10 text-right">
                {masterVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={masterVolume}
              onChange={(e) => handleMasterVolume(Number(e.target.value))}
              className="w-full h-1 accent-purple-400 cursor-pointer"
            />
          </div>

          {/* Mute Output + Mute Mic buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleMasterMuted}
              className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
                masterMuted
                  ? "bg-red-500/80 text-white"
                  : "bg-zinc-700 text-gray-300 hover:bg-zinc-600"
              }`}
            >
              {masterMuted ? "🔇 Output Muted" : "🔊 Output"}
            </button>
            <button
              onClick={handleMicMuted}
              className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
                micMuted
                  ? "bg-red-500/80 text-white"
                  : "bg-zinc-700 text-gray-300 hover:bg-zinc-600"
              }`}
            >
              {micMuted ? "🔇 Mic Muted" : "🎙️ Mic"}
            </button>
          </div>

          {/* Mic meter */}
          <div className="flex items-center gap-2">
            <span className="w-8 font-mono text-gray-400">MIC</span>
            <progress
              ref={micMeterRef}
              className="w-full h-2 [&::-webkit-progress-bar]:bg-gray-800 [&::-webkit-progress-value]:bg-green-500"
              max="1"
            ></progress>
          </div>
        </div>
      </div>

      {/* ─── Online Players ──────────────────────────────────────────── */}
      <div className="bg-black/40 text-white p-3 rounded-md w-full border border-zinc-800">
        <h3 className="font-bold border-b border-gray-600 mb-2 pb-1 text-sm">
          Online ({connectedPeers.length + 1})
        </h3>
        <ul className="text-xs space-y-2 max-h-60 overflow-y-auto">
          {/* Self */}
          <li
            className="font-semibold drop-shadow flex items-center gap-1"
            style={{ color: getPlayerColor(myColorIndex) }}
          >
            <span>{getPlayerEmoji(myEmojiIndex)}</span>
            <span>{myName} (You)</span>
          </li>

          {/* Remote peers with individual controls */}
          {connectedPeers.map((peer) => {
            const vol = peerVolumes[peer.id] ?? 100;
            const muted = peerMuted[peer.id] ?? false;
            return (
              <li
                key={peer.id}
                className="flex flex-col gap-1 border-t border-zinc-800 pt-1"
              >
                <div
                  className="flex items-center justify-between gap-2 drop-shadow"
                  style={{ color: getPlayerColor(peer.colorIndex) }}
                >
                  <span className="flex items-center gap-1 truncate">
                    <span>{getPlayerEmoji(peer.emojiIndex)}</span>
                    <span className="truncate">{peer.name}</span>
                  </span>
                  <progress
                    ref={(el) => {
                      if (el) peerMeterRefs.current.set(peer.id, el);
                      else peerMeterRefs.current.delete(peer.id);
                    }}
                    className="w-16 h-1.5 shrink-0 [&::-webkit-progress-bar]:bg-gray-800/80 [&::-webkit-progress-value]:bg-blue-500 opacity-80"
                    max="1"
                  />
                </div>
                {/* Per-peer volume + mute */}
                <div className="flex items-center gap-1.5 pl-5">
                  <button
                    onClick={() => handlePeerMuted(peer.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 transition-colors ${
                      muted
                        ? "bg-red-500/80 text-white"
                        : "bg-zinc-700 text-gray-400 hover:bg-zinc-600"
                    }`}
                    title={muted ? "Unmute player" : "Mute player"}
                  >
                    {muted ? "🔇" : "🔊"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={vol}
                    onChange={(e) =>
                      handlePeerVolume(peer.id, Number(e.target.value))
                    }
                    className="flex-1 h-1 accent-blue-400 cursor-pointer"
                    title={`Volume: ${vol}%`}
                  />
                  <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">
                    {vol}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Audio Debug HUD */}
      {isLocalhost && (
        <div className="bg-black/40 p-3 rounded-md text-white border border-zinc-800">
          <div className="text-xs font-bold mb-2 text-gray-300">
            AUDIO DEBUG (Press B)
          </div>
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-semibold">Microphone</label>
              <select
                className="bg-zinc-800 text-white p-1 rounded border border-zinc-700 outline-none w-full"
                value={selectedInput}
                onChange={(e) => {
                  setSelectedInput(e.target.value);
                  audioManager
                    .setInputDevice(e.target.value)
                    .catch(console.error);
                }}
              >
                {devices
                  .filter((d) => d.kind === "audioinput")
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mic ${d.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                {devices.filter((d) => d.kind === "audioinput").length ===
                  0 && <option value="default">Default Mic</option>}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-semibold">Speaker</label>
              <select
                className="bg-zinc-800 text-white p-1 rounded border border-zinc-700 outline-none w-full"
                value={selectedOutput}
                onChange={(e) => {
                  setSelectedOutput(e.target.value);
                  audioManager
                    .setOutputDevice(e.target.value)
                    .catch(console.error);
                }}
              >
                {devices
                  .filter((d) => d.kind === "audiooutput")
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker ${d.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                {devices.filter((d) => d.kind === "audiooutput").length ===
                  0 && <option value="default">Default Speaker</option>}
              </select>
            </div>
          </div>
        </div>
      )}

      {isLocalhost && <DebugPanel />}

      {/* Chat */}
      <div className="flex-1 min-h-[200px] bg-black/40 rounded-md flex flex-col border border-zinc-800">
        <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-1 text-sm">
          {chatMessages.length === 0 && (
            <div className="text-gray-500 italic text-center mt-4">
              No messages yet...
            </div>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className="break-words">
              <span
                className="font-bold drop-shadow"
                style={{ color: getPlayerColor(msg.senderColorIndex ?? 0) }}
              >
                {getPlayerEmoji(msg.senderEmojiIndex ?? 0)} {msg.senderName}
                :{" "}
              </span>
              <span className="text-gray-100">{msg.text}</span>
            </div>
          ))}
        </div>
        <form
          onSubmit={handleSend}
          className="border-t border-gray-600 p-2 flex shrink-0"
        >
          <input
            type="text"
            className="flex-1 bg-transparent text-white outline-none px-2 text-sm"
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </form>
      </div>
    </div>
  );
}
