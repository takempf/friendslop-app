import { useSyncExternalStore } from "react";
import { useActiveDevice } from "@/input/useInput";
import { useGameSync } from "@/sync/GameSyncProvider";
import { getPlayerColor } from "@/utils/colors";
import { wristIndicatorState } from "./wristIndicatorState";
import css from "./DiscWristIndicator.module.css";

export function DiscWristIndicator() {
  const state = useSyncExternalStore(
    wristIndicatorState.subscribe,
    wristIndicatorState.getSnapshot,
    wristIndicatorState.getSnapshot,
  );
  const device = useActiveDevice();
  const { myColorIndex } = useGameSync();
  if (!state) return null;
  const color = state.atLimit ? "#ffbb69" : getPlayerColor(myColorIndex);
  const bankLabel =
    state.bank === 0 ? "FLAT" : state.bank > 0 ? "HYZER" : "ANHYZER";
  const noseLabel =
    state.nose === 0 ? "LEVEL" : state.nose > 0 ? "NOSE UP" : "NOSE DOWN";
  return (
    <section
      className={css.panel}
      aria-label="Disc release angle"
      style={{ borderColor: color }}
    >
      <div className={css.heading}>
        <strong>RELEASE ANGLE</strong>
        <span style={{ color }}>
          {state.atLimit ? "AT LIMIT" : "WRIST AIM"}
        </span>
      </div>
      <svg
        className={css.gauge}
        viewBox="0 0 256 152"
        role="img"
        aria-label={`${bankLabel} ${Math.abs(state.bank)} degrees, ${noseLabel} ${Math.abs(state.nose)} degrees${state.atLimit ? ", wrist limit reached" : ""}`}
      >
        <ellipse
          cx="128"
          cy="76"
          rx="64"
          ry="40"
          fill="#ffffff06"
          stroke={color}
          strokeOpacity={state.atLimit ? 1 : 0.55}
          strokeWidth={state.atLimit ? 2 : 1}
        />
        <path
          d="M64 76H192 M128 36V116"
          stroke="#ffffff33"
          strokeDasharray="3 4"
        />
        <circle cx="128" cy="76" r="2" fill="#ffffff88" />
        <text x="128" y="21" textAnchor="middle">
          ↑ NOSE UP
        </text>
        <text x="128" y="141" textAnchor="middle">
          ↓ NOSE DOWN
        </text>
        <text x="3" y="79">
          ← HYZER
        </text>
        <text x="253" y="79" textAnchor="end">
          ANHYZER →
        </text>
        <path
          d={`M128 76L${128 + state.x} ${76 + state.y}`}
          stroke={color}
          strokeOpacity="0.5"
        />
        <g
          transform={`translate(${128 + state.x} ${76 + state.y}) rotate(${-state.bank})`}
        >
          <ellipse
            rx="10"
            ry="4"
            fill="#152724"
            stroke={color}
            strokeWidth="2"
          />
          <path d="M-7 0H7" stroke={color} />
        </g>
      </svg>
      <div className={css.readouts}>
        <div>
          <span>{bankLabel}</span>
          <strong>{Math.abs(state.bank)}°</strong>
        </div>
        <div>
          <span>{noseLabel}</span>
          <strong>{Math.abs(state.nose)}°</strong>
        </div>
      </div>
      <p className={css.hint}>
        {device === "gamepad" ? "Right stick" : "Mouse"} · Tilt disc
        <br />
        Release {device === "gamepad" ? "RT" : "Q"} · Throw
      </p>
      <div className={css.limits}>WRIST RANGE · BANK 35° / NOSE 20°</div>
    </section>
  );
}
