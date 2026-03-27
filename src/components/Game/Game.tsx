import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
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
import { usePointerLock } from "@/hooks/usePointerLock";
import { debugConfig } from "@/debug/config";

import css from "./Game.module.css";

export function Game() {
  const gameContainerRef = useRef<HTMLCanvasElement>(null);
  const { locked, setPointerLockOnElement } = usePointerLock();

  return (
    <div className={css.gameContainer}>
      <Canvas
        shadows
        camera={{ position: [0, 2, 0], fov: 75 }}
        id="game-container"
        ref={gameContainerRef}
      >
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
        <CRTRenderer />
        <Stats className={css.stats} />
        {debugConfig.showPerf && <Perf position="top-left" />}
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

      <GameMenu
        open={!locked}
        onOpenChange={(open) =>
          !open && setPointerLockOnElement(gameContainerRef.current!)
        }
      />
    </div>
  );
}
