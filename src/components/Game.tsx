import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { SchoolEnvironment } from './SchoolEnvironment'
import { PlayerController } from './PlayerController'
import { RemotePlayers } from './RemotePlayers'

export function Game() {
  return (
    <div className="w-full h-full relative bg-black" id="game-container">
      {/* UI Overlay will go here later */}
      
      <Canvas shadows camera={{ position: [0, 2, 0], fov: 75 }}>
        <Physics gravity={[0, -9.81, 0]}>
          <SchoolEnvironment />
          <PlayerController />
          <RemotePlayers />
        </Physics>
      </Canvas>
      
      {/* Temporary start instructions directly overlaid natively */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 px-4 py-2 rounded pointer-events-none">
        Click to Play (WASD to Move)
      </div>
    </div>
  )
}
