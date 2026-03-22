import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SmoothedPointerLockControls } from './SmoothedPointerLockControls'
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useKeyboard } from '../hooks/useKeyboard'
import { useGameSync } from '../sync/GameSyncProvider'
import { audioManager } from '../audio/AudioManager'

const SPEED = 5
const direction = new THREE.Vector3()
const frontVector = new THREE.Vector3()
const sideVector = new THREE.Vector3()

// 12 equidistant spawn points in a circle centered in the gym (0,0,0)
const SPAWN_POINTS: [number, number, number][] = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const radius = 6;
  return [Math.cos(angle) * radius, 3, Math.sin(angle) * radius];
});

export function PlayerController() {
  const ref = useRef<RapierRigidBody>(null)
  const keys = useKeyboard()
  const { sync } = useGameSync()
  const lastSyncTime = useRef(0)
  const [spawnPoint] = useState(() => SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)])
  
  const { camera } = useThree()
  
  useEffect(() => {
     // Force looking directly forward on mount
     camera.rotation.set(0, 0, 0)
  }, [camera])

  
  useFrame((state) => {
    if (!ref.current) return
    
    // Get keyboard input vectors
    frontVector.set(0, 0, (keys.current.KeyS ? 1 : 0) - (keys.current.KeyW ? 1 : 0))
    sideVector.set((keys.current.KeyA ? 1 : 0) - (keys.current.KeyD ? 1 : 0), 0, 0)
    
    // Calculate direction relative to camera rotation
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(SPEED)
      .applyEuler(state.camera.rotation) // Align movement with camera orientation

    // Preserve existing Y velocity (for gravity/falling)
    const currentVelocity = ref.current.linvel()
    ref.current.setLinvel({ x: direction.x, y: currentVelocity.y, z: direction.z }, true)

    // Position camera slightly below the top of the capsule
    const pos = ref.current.translation()
    state.camera.position.set(pos.x, pos.y + 0.8, pos.z)

    // Broadcast position at 20Hz max
    const now = performance.now()
    if (sync && now - lastSyncTime.current > 50) {
      lastSyncTime.current = now
      const p = state.camera.position
      const r = state.camera.rotation
      sync.updateMyPresence({
        position: [p.x, p.y, p.z],
        rotation: [r.x, r.y, r.z] 
      })

      // Update Web Audio Listener
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(r)
      const up = new THREE.Vector3(0, 1, 0).applyEuler(r)
      audioManager.updateListener([p.x, p.y, p.z], [forward.x, forward.y, forward.z], [up.x, up.y, up.z])

      // Reverb routing logic: check if we are in the Gym or Classroom
      if (p.z < -15) {
        audioManager.setRoom('classroom')
      } else {
        audioManager.setRoom('gym')
      }
    }
  })

  return (
    <>
      <SmoothedPointerLockControls selector="#game-container" />
      <RigidBody 
        ref={ref}
        position={spawnPoint}
        colliders={false} 
        mass={1} 
        type="dynamic" 
        enabledRotations={[false, false, false]} // prevent falling over
      >
        <CapsuleCollider args={[0.5, 0.5]} />
      </RigidBody>
    </>
  )
}
