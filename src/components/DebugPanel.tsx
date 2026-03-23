import { useState } from 'react'
import { debugConfig } from '../debug/config'

type ConfigKey = keyof typeof debugConfig

const PARAMS: { key: ConfigKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'minThrowSpeed',        label: 'Min Throw Speed (m/s)', min: 0,   max: 15,  step: 0.125 },
  { key: 'maxThrowSpeed',        label: 'Max Throw Speed (m/s)', min: 0,   max: 20,  step: 0.125 },
  { key: 'throwArcDeg',          label: 'Throw Arc (°)',         min: 0,   max: 80,  step: 1     },
  { key: 'throwSpinMult',        label: 'Spin Multiplier',       min: 0,   max: 30,  step: 0.5   },
  { key: 'backboardRestitution', label: 'Backboard Restitution', min: 0,   max: 1,   step: 0.01  },
  { key: 'rimRestitution',       label: 'Rim Restitution',       min: 0,   max: 1,   step: 0.01  },
  { key: 'funnelStrength',       label: 'Net Funnel Strength',   min: 0,   max: 0.1, step: 0.001 },
]

export function DebugPanel() {
  const [open, setOpen] = useState(false)
  // Force re-render when a slider changes so displayed values stay in sync
  const [, tick] = useState(0)

  const update = (key: ConfigKey, value: number) => {
    debugConfig[key] = value
    tick(n => n + 1)
  }

  return (
    <div className="absolute top-4 left-4 pointer-events-auto select-none z-20 font-mono text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-white/80 bg-black/60 hover:bg-black/90 px-3 py-1.5 rounded border border-white/20 transition-colors"
      >
        {open ? '✕ Debug' : '⚙ Debug'}
      </button>

      {open && (
        <div className="mt-1 bg-black/90 text-white rounded-lg border border-white/15 w-72 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 text-white/50 uppercase tracking-widest text-[10px]">
            Physics Debug
          </div>
          <div className="p-3 space-y-3">
            {PARAMS.map(({ key, label, min, max, step }) => (
              <div key={key}>
                <div className="flex justify-between mb-1">
                  <span className="text-white/60">{label}</span>
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
                  onChange={e => update(key, parseFloat(e.target.value))}
                  className="w-full h-1 accent-yellow-300 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
