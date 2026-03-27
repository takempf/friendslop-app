import { useState, useRef, useEffect } from "react";
import { Game } from "./components/Game";
import { GameSyncProvider } from "./sync/GameSyncProvider";
import { audioManager } from "./audio/AudioManager";

import css from "./App.module.css";

function App() {
  const [started, setStarted] = useState(false);
  const startingRef = useRef(false);

  const handleStart = async () => {
    if (started || startingRef.current) return;
    startingRef.current = true;
    await audioManager.init();

    // Restore persisted audio settings
    const savedVol = localStorage.getItem("friendslop_masterVolume");
    if (savedVol !== null) audioManager.setMasterVolume(Number(savedVol));
    if (localStorage.getItem("friendslop_masterMuted") === "true")
      audioManager.setMasterMuted(true);
    if (localStorage.getItem("friendslop_micMuted") === "true")
      audioManager.setMicMuted(true);

    setStarted(true);
  };

  // Hotkey: B = test sound
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "b" && document.activeElement?.tagName !== "INPUT") {
        audioManager.playTestSound();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={css.root} onClick={!started ? handleStart : undefined}>
      {!started && (
        <div className={css.startScreen}>
          <div className={css.startContent}>
            <h1 className={css.startTitle}>Friendslop 3D</h1>
            <p className={css.startHint}>
              Click anywhere to connect &amp; enable audio
            </p>
          </div>
        </div>
      )}

      {started && (
        <GameSyncProvider roomName="friendslop-lobby-1">
          <div className={css.layout}>
            <Game />
          </div>
        </GameSyncProvider>
      )}
    </div>
  );
}

export default App;
