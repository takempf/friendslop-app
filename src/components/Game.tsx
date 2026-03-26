import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { SchoolEnvironment } from "./SchoolEnvironment";
import { PlayerController } from "./PlayerController";
import { RemotePlayers } from "./RemotePlayers";
import { BasketballProvider } from "../contexts/BasketballContext";
import { BasketballSync } from "./BasketballSync";
import { CRTRenderer } from "./CRTRenderer";
import { PartlyCloudySky } from "./PartlyCloudySky";

export function Game() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  return (
    <div className="w-full h-full relative bg-black" id="game-container">
      <Canvas shadows camera={{ position: [0, 2, 0], fov: 75 }}>
        <PartlyCloudySky />
        <BasketballProvider>
          <Physics gravity={[0, -9.81, 0]}>
            <SchoolEnvironment />
            <PlayerController />
            <RemotePlayers />
            <BasketballSync />
          </Physics>
        </BasketballProvider>
        <CRTRenderer />
        <Stats className="!absolute !bottom-0 !left-0 !top-auto !right-auto" />
      </Canvas>

      {/* Reticle */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
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

      {!locked && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 px-4 py-2 rounded pointer-events-none">
          Click to Play
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-white/60 text-xs pointer-events-none text-right leading-relaxed">
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
        className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none flex-col items-center gap-1"
        style={{ display: "none" }}
      >
        <div
          id="throw-meter-label"
          className="text-white text-xs font-bold tracking-widest text-center mb-1"
        >
          Hold Q to Charge
        </div>
        <div className="relative w-56 h-4 bg-black/60 rounded-full border border-white/25 overflow-hidden">
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
        <div className="flex justify-between w-56 mt-0.5">
          <span className="text-white/50 text-[10px]">MIN</span>
          <span className="text-white/50 text-[10px]">MAX</span>
        </div>
      </div>
    </div>
  );
}
