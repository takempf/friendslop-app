import { useGameSync } from '../sync/GameSyncProvider'
import { useState, useEffect } from 'react'
import { audioManager } from '../audio/AudioManager'
import { getPlayerColor } from '../utils/colors'

export function UIOverlay() {
  const { sync, chatMessages, connectedPeers, audioBlocked, myId, myName } = useGameSync()
  const [chatInput, setChatInput] = useState('')
  const [micVol, setMicVol] = useState(0)
  const [outVol, setOutVol] = useState(0)

  // Polling volumes
  useEffect(() => {
    let raf: number;
    const loop = () => {
      const { mic, out } = audioManager.getVolumes();
      setMicVol(Math.min(1, mic * 5)); // amplify visual
      setOutVol(Math.min(1, out * 5)); // amplify visual
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hotkey mapping
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in chat
      if (e.key === 'b' && document.activeElement?.tagName !== 'INPUT') {
        audioManager.playTestSound();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (sync && chatInput.trim()) {
      sync.sendChatMessage(chatInput.trim())
      setChatInput('')
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10 w-full h-full">
      {audioBlocked && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500/80 text-white px-4 py-2 rounded-md pointer-events-auto shadow-lg text-sm font-bold">
          Microphone access blocked. You are muted! Use headphones to avoid echo.
        </div>
      )}

      {/* Audio Debug HUD */}
      <div className="absolute top-4 right-56 bg-black/70 p-4 rounded-md pointer-events-auto text-white">
         <div className="text-xs font-bold mb-2 text-gray-300">AUDIO DEBUG (Press B to test)</div>
         <div className="flex flex-col gap-2 text-xs">
           <div className="flex items-center gap-2">
             <span className="w-8 font-mono">MIC</span>
             <progress className="w-24 h-2 [&::-webkit-progress-bar]:bg-gray-800 [&::-webkit-progress-value]:bg-green-500" value={micVol} max="1"></progress>
           </div>
           <div className="flex items-center gap-2">
             <span className="w-8 font-mono">SPK</span>
             <progress className="w-24 h-2 [&::-webkit-progress-bar]:bg-gray-800 [&::-webkit-progress-value]:bg-blue-500" value={outVol} max="1"></progress>
             <span className="text-[10px] text-gray-500 ml-1">[{audioManager.getPeerCount()} peers]</span>
           </div>
         </div>
      </div>
      
      {/* Top Right: Presence List */}
      <div className="self-end bg-black/70 text-white p-3 rounded-md w-48 pointer-events-auto">
        <h3 className="font-bold border-b border-gray-600 mb-2 pb-1 text-sm">Online ({connectedPeers.length + 1})</h3>
        <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
          <li className="font-semibold drop-shadow" style={{ color: getPlayerColor(myId) }}>
            {myName} (You)
          </li>
          {connectedPeers.map(peer => (
            <li key={peer.id} className="drop-shadow" style={{ color: getPlayerColor(peer.id) }}>
              {peer.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom Left: Chat */}
      <div className="self-start w-80 bg-black/70 rounded-md flex flex-col pointer-events-auto">
        <div className="h-48 p-3 overflow-y-auto flex flex-col gap-1 text-sm">
          {chatMessages.length === 0 && (
             <div className="text-gray-500 italic">No messages yet...</div>
          )}
          {chatMessages.map(msg => (
            <div key={msg.id} className="break-words">
              <span className="font-bold drop-shadow" style={{ color: getPlayerColor(msg.senderId) }}>{msg.senderName}: </span>
              <span className="text-gray-100">{msg.text}</span>
            </div>
          ))}
        </div>
        <form onSubmit={handleSend} className="border-t border-gray-600 p-2 flex">
          <input
            type="text"
            className="flex-1 bg-transparent text-white outline-none px-2 text-sm"
            placeholder="Type a message... (Press Enter)"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              // Prevent spacebar or WASD from moving the player when focused on input
              e.stopPropagation() 
            }}
          />
        </form>
      </div>
      
    </div>
  )
}
