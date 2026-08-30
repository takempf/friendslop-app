import { useRef, useState, useEffect, useCallback, type JSX } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { Physics } from "@react-three/rapier";
import { SchoolEnvironment } from "@/components/3d/SchoolEnvironment/SchoolEnvironment";
import { PlayerController } from "@/components/3d/PlayerController/PlayerController";
import { RemotePlayers } from "@/components/3d/RemotePlayers/RemotePlayers";
import { BasketballProvider } from "@/contexts/BasketballContext";
import { BasketballSync } from "@/components/3d/BasketballSync/BasketballSync";
import { SyncTicker } from "@/components/3d/SyncTicker/SyncTicker";
import { CRTRenderer } from "@/components/3d/CRTRenderer/CRTRenderer";
import { PartlyCloudySky } from "@/components/3d/PartlyCloudySky/PartlyCloudySky";
import { GameMenu } from "@/components/GameMenu/GameMenu";
import { ChatOverlay } from "@/components/ChatOverlay/ChatOverlay";
import { usePointerLock } from "@/hooks/usePointerLock";
import { gameConfig, subscribeToConfig } from "@/config";

import css from "./Game.module.css";

type UiMode = "playing" | "chat" | "menu";

function CRTWrapper(): JSX.Element {
  const scanlines = Math.floor(gameConfig.renderHeight / 6);
  return <CRTRenderer scanlines={scanlines} />;
}

function RenderResolution(): null {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const update = (): void => {
      gl.setPixelRatio(gameConfig.renderHeight / window.innerHeight);
    };
    update();
    const unsubConfig = subscribeToConfig(update);
    window.addEventListener("resize", update);
    return (): void => {
      unsubConfig();
      window.removeEventListener("resize", update);
    };
  }, [gl]);

  return null;
}

export function Game(): JSX.Element {
  const gameContainerRef = useRef<HTMLCanvasElement>(null);
  const { locked, setPointerLockOnElement } = usePointerLock();
  const [mode, setMode] = useState<UiMode>("menu");
  const modeRef = useRef<UiMode>(mode);

  const [, tick] = useState(0);

  const switchMode = useCallback((newMode: UiMode): void => {
    modeRef.current = newMode;
    setMode(newMode);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

  // Lock reconciliation from external pointerlockchange DOM event
  useEffect(() => {
    const handlePointerLockChange = (): void => {
      const isLocked = Boolean(document.pointerLockElement);
      if (!isLocked) {
        if (modeRef.current === "playing") {
          switchMode("menu");
        }
      } else {
        if (modeRef.current !== "playing") {
          switchMode("playing");
        }
      }
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return (): void => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
    };
  }, [switchMode]);

  // Capture-phase keydown for playing mode
  useEffect(() => {
    if (mode !== "playing") return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchMode("chat");
        document.exitPointerLock();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchMode("menu");
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [mode, switchMode]);

  const handleContainerClick = (): void => {
    if (modeRef.current === "playing" && !locked && gameContainerRef.current) {
      setPointerLockOnElement(gameContainerRef.current);
    }
  };

  const handleChatClose = useCallback((): void => {
    switchMode("playing");
    if (gameContainerRef.current) {
      setPointerLockOnElement(gameContainerRef.current);
    }
  }, [setPointerLockOnElement, switchMode]);

  const handleMenuOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        switchMode("playing");
        if (gameContainerRef.current) {
          setPointerLockOnElement(gameContainerRef.current);
        }
      } else {
        switchMode("menu");
      }
    },
    [setPointerLockOnElement, switchMode],
  );

  return (
    <div className={css.gameContainer} onClick={handleContainerClick}>
      <Canvas
        shadows
        camera={{ position: [0, 2, 0], fov: 75 }}
        id="game-container"
        ref={gameContainerRef}
      >
        <RenderResolution />
        <PartlyCloudySky />
        <BasketballProvider>
          <Physics gravity={[0, -9.81, 0]}>
            <SchoolEnvironment />
            <PlayerController />
            <RemotePlayers />
            <BasketballSync />
            <SyncTicker />
          </Physics>
        </BasketballProvider>
        {gameConfig.crtEnabled && <CRTWrapper />}
        {gameConfig.showFps && <Stats className={css.stats} />}
        {gameConfig.showPerf && <Perf position="top-left" />}
      </Canvas>

      {/* Reticle */}
      <svg
        className={css.reticle}
        width="16"
        height="16"
        viewBox="0 0 16 16"
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.9))" }}
      >
        <line x1="0" y1="8" x2="5.5" y2="8" stroke="white" strokeWidth="1.5" />
        <line
          x1="10.5"
          y1="8"
          x2="16"
          y2="8"
          stroke="white"
          strokeWidth="1.5"
        />
        <line x1="8" y1="0" x2="8" y2="5.5" stroke="white" strokeWidth="1.5" />
        <line
          x1="8"
          y1="10.5"
          x2="8"
          y2="16"
          stroke="white"
          strokeWidth="1.5"
        />
        <circle cx="8" cy="8" r="1.5" fill="white" />
      </svg>

      <div className={css.controls}>
        WASD · Move
        <br />
        Shift · Sprint
        <br />
        E · Pick Up
        <br />
        Hold Q · Charge Throw
      </div>

      {/* Throw charge meter — visibility and fill driven imperatively by PlayerController */}
      <div
        id="throw-meter"
        className={css.throwMeter}
        style={{ display: "none" }}
      >
        <div className={css.throwMeterFillContainer}>
          <div
            id="throw-meter-fill"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "0%",
              borderRadius: "9999px",
              background: "hsl(120, 90%, 45%)",
            }}
          />
        </div>
      </div>

      <ChatOverlay
        active={mode === "chat"}
        onClose={handleChatClose}
        isMenuOpen={mode === "menu"}
      />

      <GameMenu open={mode === "menu"} onOpenChange={handleMenuOpenChange} />
    </div>
  );
}
