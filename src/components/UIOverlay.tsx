import { useGameSync } from "../sync/GameSyncProvider";
import { useState, useEffect, useRef } from "react";
import { DebugPanel } from "./DebugPanel";
import { audioManager } from "../audio/AudioManager";
import { getPlayerColor, getPlayerEmoji } from "../utils/colors";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

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

      {/* Online Players */}
      <div className="bg-black/40 text-white p-3 rounded-md w-full border border-zinc-800">
        <h3 className="font-bold border-b border-gray-600 mb-2 pb-1 text-sm">
          Online ({connectedPeers.length + 1})
        </h3>
        <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
          <li
            className="font-semibold drop-shadow flex items-center gap-1"
            style={{ color: getPlayerColor(myColorIndex) }}
          >
            <span>{getPlayerEmoji(myEmojiIndex)}</span>
            <span>{myName} (You)</span>
          </li>
          {connectedPeers.map((peer) => (
            <li
              key={peer.id}
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
            </li>
          ))}
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

            <div className="flex items-center gap-2 mt-1">
              <span className="w-8 font-mono">MIC</span>
              <progress
                ref={micMeterRef}
                className="w-full h-2 [&::-webkit-progress-bar]:bg-gray-800 [&::-webkit-progress-value]:bg-green-500"
                max="1"
              ></progress>
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
                {getPlayerEmoji(msg.senderEmojiIndex ?? 0)} {msg.senderName}:{" "}
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
