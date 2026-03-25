import { useState, useRef } from "react";
import { Game } from "./components/Game";
import { GameSyncProvider } from "./sync/GameSyncProvider";
import { UIOverlay } from "./components/UIOverlay";
import { audioManager } from "./audio/AudioManager";

function App() {
  const [started, setStarted] = useState(false);
  const startingRef = useRef(false);

  const handleStart = async () => {
    if (started || startingRef.current) return;
    startingRef.current = true;
    await audioManager.init();
    setStarted(true);
  };

  return (
    <div className="w-full h-full relative text-white" onClick={handleStart}>
      {!started && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900 cursor-pointer select-none">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold mb-4 text-purple-400">
              Friendslop 3D
            </h1>
            <p className="text-xl animate-pulse">
              Click anywhere to connect & enable audio
            </p>
          </div>
        </div>
      )}

      {started && (
        <GameSyncProvider roomName="friendslop-lobby-1">
          <div className="flex flex-row w-full h-full">
            <div className="flex-1 relative min-w-0 min-h-0">
              <Game />
            </div>
            <div className="w-[300px] shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden shadow-xl z-20">
              <UIOverlay />
            </div>
          </div>
        </GameSyncProvider>
      )}
    </div>
  );
}

export default App;
