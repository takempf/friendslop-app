import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { SchoolEnvironment } from "./SchoolEnvironment";
import { PlayerController } from "./PlayerController";
import { RemotePlayers } from "./RemotePlayers";
import { BasketballProvider } from "../contexts/BasketballContext";
import { BasketballSync } from "./BasketballSync";
import { SyncTicker } from "./SyncTicker";
import { CRTRenderer } from "./CRTRenderer";
import { PartlyCloudySky } from "./PartlyCloudySky";

import css from "./Game.module.css";

export function Game() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  return (
    <div className={css.gameContainer}>
      <Canvas shadows camera={{ position: [0, 2, 0], fov: 75 }}>
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

      {!locked && <div className={css.clickToPlay}>Click to Play</div>}

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
    </div>
  );
}
