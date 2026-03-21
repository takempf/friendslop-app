import { Game } from './components/Game'
import { GameSyncProvider } from './sync/GameSyncProvider'
import { UIOverlay } from './components/UIOverlay'
import { useState } from 'react'
import { audioManager } from './audio/AudioManager'

function App() {
  const [started, setStarted] = useState(false)

  const handleStart = async () => {
    if (started) return;
    await audioManager.init()
    setStarted(true)
  }

  return (
    <div className="w-full h-full relative text-white" onClick={handleStart}>
      {!started && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900 cursor-pointer select-none">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold mb-4 text-purple-400">Friendslop 3D</h1>
            <p className="text-xl animate-pulse">Click anywhere to connect & enable audio</p>
          </div>
        </div>
      )}
      
      {started && (
        <GameSyncProvider roomName="friendslop-lobby-1">
          <Game />
          <UIOverlay />
        </GameSyncProvider>
      )}
    </div>
  )
}

export default App
