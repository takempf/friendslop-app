import { useEffect, useRef, useState, type JSX } from "react";
import { targetingSystem } from "@/targeting/TargetingSystem";
import { gameConfig, subscribeToConfig } from "@/config";
import { reticleCircleElement } from "./reticleCircleElement";
import styles from "./Reticle.module.css";

/** Dashed overlay showing a provider's assist circle, in debug mode only. */
function DebugCircle({
  diameter,
  stroke,
}: {
  diameter: number;
  stroke: string;
}): JSX.Element {
  return (
    <svg
      className={styles.debugCircleSvg}
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
    >
      <circle
        cx={diameter / 2}
        cy={diameter / 2}
        r={diameter / 2 - 1}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export function Reticle(): JSX.Element {
  const debugLabelsRef = useRef<HTMLDivElement>(null);
  const [, setConfigTick] = useState(0);
  const showTargetDebug = gameConfig.showTargetDebug;

  useEffect(() => subscribeToConfig(() => setConfigTick((n) => n + 1)), []);

  // Debug candidate labels get their own rAF loop, running only while debug is on.
  // The aim circle itself is driven from the r3f frame loop — see useTargeting.
  useEffect(() => {
    const container = debugLabelsRef.current;
    if (!showTargetDebug || !container) return;

    let frameId: number;
    const render = (): void => {
      const scored = targetingSystem.getScoredCandidates();
      const height = window.innerHeight;

      while (container.children.length > scored.length) {
        container.removeChild(container.lastChild!);
      }
      while (container.children.length < scored.length) {
        container.appendChild(document.createElement("div"));
      }

      for (let i = 0; i < scored.length; i++) {
        const sc = scored[i];
        const div = container.children[i] as HTMLDivElement;
        div.style.left = `calc(50% + ${sc.screenX * height}px)`;
        div.style.top = `calc(50% + ${-sc.screenY * height}px)`;
        div.textContent = `#${i + 1} ${sc.candidate.id} (s:${sc.score.toFixed(2)}, d:${sc.worldDistance.toFixed(1)}m)${sc.occluded ? " [OCCLUDED]" : ""}`;
        div.className = sc.occluded
          ? `${styles.debugLabel} ${styles.debugLabelOccluded}`
          : styles.debugLabel;
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      container.replaceChildren();
    };
  }, [showTargetDebug]);

  const baseHeight = typeof window !== "undefined" ? window.innerHeight : 1080;
  const shotDiameter = gameConfig.aimAssistDiameter * baseHeight;
  const grabDiameter = gameConfig.aimAssistGrabDiameter * baseHeight;

  return (
    <div className={styles.reticleContainer}>
      {/* Detection boundaries — one circle per distinct provider diameter */}
      {gameConfig.showAimAssistCircle && (
        <>
          <DebugCircle
            diameter={shotDiameter}
            stroke="rgba(0, 255, 200, 0.4)"
          />
          {grabDiameter !== shotDiameter && (
            <DebugCircle
              diameter={grabDiameter}
              stroke="rgba(255, 200, 0, 0.35)"
            />
          )}
        </>
      )}

      {/* Aim circle — where the player is targeting. Position written every frame. */}
      <div ref={reticleCircleElement} className={styles.assistCircleContainer}>
        <svg
          className={styles.assistCircleSvg}
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="none"
            stroke="white"
            strokeWidth="3"
          />
        </svg>
      </div>

      {/* Center dot — where the player is actually looking. Never moves. */}
      <svg className={styles.centerDot} width="8" height="8" viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="2.5" fill="white" />
      </svg>

      <div ref={debugLabelsRef} className={styles.debugLabelsContainer} />
    </div>
  );
}
