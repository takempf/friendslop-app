import { useState } from "react";
import { debugConfig } from "../debug/config";

type ConfigKey = keyof typeof debugConfig;
type NumericConfigKey = {
  [K in ConfigKey]: (typeof debugConfig)[K] extends number ? K : never;
}[ConfigKey];

const PARAMS: {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "renderScale", label: "Render Scale", min: 0.25, max: 1, step: 0.05 },
  {
    key: "minThrowSpeed",
    label: "Min Throw Speed (m/s)",
    min: 0,
    max: 15,
    step: 0.125,
  },
  {
    key: "maxThrowSpeed",
    label: "Max Throw Speed (m/s)",
    min: 0,
    max: 20,
    step: 0.125,
  },
  { key: "throwArcDeg", label: "Throw Arc (°)", min: 0, max: 80, step: 1 },
  {
    key: "throwSpinMult",
    label: "Spin Multiplier",
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    key: "backboardRestitution",
    label: "Backboard Restitution",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "rimRestitution",
    label: "Rim Restitution",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "funnelStrength",
    label: "Net Funnel Strength",
    min: 0,
    max: 0.1,
    step: 0.001,
  },
];

export function DebugPanel() {
  const [, tick] = useState(0);

  const update = (key: NumericConfigKey, value: number) => {
    // eslint-disable-next-line react-hooks/immutability
    debugConfig[key] = value;
    tick((n) => n + 1);
  };

  return (
    <div className="bg-black/40 p-3 rounded-md text-white border border-zinc-800 font-mono text-xs">
      <div className="text-xs font-bold mb-2 text-gray-300 font-sans">
        PHYSICS DEBUG
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-semibold">CRT Filter</span>
          <button
            onClick={() => {
              debugConfig.crtEnabled = !debugConfig.crtEnabled;
              tick((n) => n + 1);
            }}
            className={`px-2 py-0.5 rounded text-xs font-bold ${debugConfig.crtEnabled ? "bg-yellow-300 text-black" : "bg-zinc-700 text-gray-400"}`}
          >
            {debugConfig.crtEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-semibold">CRT Smoothing</span>
          <button
            onClick={() => {
              debugConfig.crtSmoothing = !debugConfig.crtSmoothing;
              tick((n) => n + 1);
            }}
            className={`px-2 py-0.5 rounded text-xs font-bold ${debugConfig.crtSmoothing ? "bg-yellow-300 text-black" : "bg-zinc-700 text-gray-400"}`}
          >
            {debugConfig.crtSmoothing ? "ON" : "OFF"}
          </button>
        </div>
        {PARAMS.map(({ key, label, min, max, step }) => (
          <div key={key}>
            <div className="flex justify-between mb-1">
              <span className="text-gray-400 font-semibold">{label}</span>
              <span className="text-yellow-300 tabular-nums w-14 text-right">
                {debugConfig[key].toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={debugConfig[key]}
              onChange={(e) => update(key, parseFloat(e.target.value))}
              className="w-full h-1 accent-yellow-300 cursor-pointer"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
