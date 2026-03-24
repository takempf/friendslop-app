import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useBasketball } from '../contexts/BasketballContext'
import { debugConfig } from '../debug/config'
import { BasketballNet } from './BasketballNet'
import {
  BOARD_Z,
  BOARD_THICKNESS,
  BOARD_FRONT_FACE_Z,
  RIM_Y,
  RIM_RADIUS,
  BALL_RADIUS,
  HOOP_RIM_POS
} from '../constants/basketball'

export function BasketballHoop() {
  const { ballRefs } = useBasketball()
  const [scored, setScored] = useState(false)
  const scoredTimer = useRef(0)
  const prevBallY = useRef<number[]>([-999, -999, -999, -999])

  // Create a static target for the spotlight to point at the hoop rim
  const [lightTarget] = useState(() => {
    const obj = new THREE.Object3D()
    obj.position.set(0, HOOP_RIM_POS.y, HOOP_RIM_POS.z)
    return obj
  })

  // Refs for live restitution updates via Rapier API
  const backboardRbRef = useRef<RapierRigidBody>(null)
  const rimRbRef = useRef<RapierRigidBody>(null)
  const prevBackboardRest = useRef(debugConfig.backboardRestitution)
  const prevRimRest = useRef(debugConfig.rimRestitution)

  useFrame((_, delta) => {
    // Tick scored timer
    if (scored) {
      scoredTimer.current += delta
      if (scoredTimer.current >= 3) {
        setScored(false)
        scoredTimer.current = 0
      }
    }

    // Live restitution update: poll for debug config changes and push to Rapier colliders
    if (backboardRbRef.current && debugConfig.backboardRestitution !== prevBackboardRest.current) {
      prevBackboardRest.current = debugConfig.backboardRestitution
      const n = backboardRbRef.current.numColliders()
      for (let i = 0; i < n; i++) backboardRbRef.current.collider(i).setRestitution(debugConfig.backboardRestitution)
    }
    if (rimRbRef.current && debugConfig.rimRestitution !== prevRimRest.current) {
      prevRimRest.current = debugConfig.rimRestitution
      const n = rimRbRef.current.numColliders()
      for (let i = 0; i < n; i++) rimRbRef.current.collider(i).setRestitution(debugConfig.rimRestitution)
    }

    ballRefs.current.forEach((ballRef, i) => {
      if (!ballRef) return
      const pos = ballRef.translation()
      const vel = ballRef.linvel()

      // Net funnel: strictly below rim, width matches the net cylinder
      if (vel.y < 0 && pos.y < RIM_Y && pos.y >= RIM_Y - 0.45) {
        const dx = pos.x - HOOP_RIM_POS.x
        const dz = pos.z - HOOP_RIM_POS.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < RIM_RADIUS * 1.15 && dist > 0.01) {
          ballRef.applyImpulse({ x: -dx * debugConfig.funnelStrength, y: 0, z: -dz * debugConfig.funnelStrength }, true)
        }
      }

      // Scoring detection
      if (!scored) {
        const prev = prevBallY.current[i]
        if (prev > HOOP_RIM_POS.y && pos.y <= HOOP_RIM_POS.y) {
          const dx = pos.x - HOOP_RIM_POS.x
          const dz = pos.z - HOOP_RIM_POS.z
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist < RIM_RADIUS - BALL_RADIUS + 0.08) {
            setScored(true)
            scoredTimer.current = 0
          }
        }
      }

      prevBallY.current[i] = pos.y
    })
  })

  const boardY = 3.45

  return (
    <>
      {/* Backboard - 72" × 42" × 3" (1.83 × 1.07 × 0.075m) */}
      <RigidBody
        ref={backboardRbRef}
        type="fixed"
        position={[0, boardY, BOARD_Z]}
        colliders="cuboid"
        restitution={debugConfig.backboardRestitution}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.83, 1.07, BOARD_THICKNESS]} />
          <meshStandardMaterial color="white" />
        </mesh>
      </RigidBody>

      {/* Target rectangle painted on backboard (visual only) */}
      <mesh position={[0, 3.22, BOARD_FRONT_FACE_Z - 0.003]}>
        <boxGeometry args={[0.59, 0.45, 0.005]} />
        <meshStandardMaterial color="#ff4400" wireframe />
      </mesh>

      {/* Rim — back edge flush with backboard front face */}
      <RigidBody
        ref={rimRbRef}
        type="fixed"
        position={[HOOP_RIM_POS.x, HOOP_RIM_POS.y, HOOP_RIM_POS.z]}
        colliders="trimesh"
        restitution={debugConfig.rimRestitution}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RIM_RADIUS, 0.025, 8, 32]} />
          <meshStandardMaterial color="#e63900" metalness={0.8} roughness={0.3} />
        </mesh>
      </RigidBody>

      {/* Net — visually simulated spring net with ball drag physics */}
      <BasketballNet position={[HOOP_RIM_POS.x, RIM_Y, HOOP_RIM_POS.z]} />

      {/* Support pole from backboard base to floor (visual only) */}
      <mesh position={[0, (boardY - 0.535) / 2, BOARD_Z + 0.04]}>
        <boxGeometry args={[0.08, boardY - 0.535, 0.08]} />
        <meshLambertMaterial color="#888888" />
      </mesh>

      {/* Scoring indicator light on top of backboard */}
      <mesh position={[0, boardY + 0.535 + 0.06, BOARD_Z]}>
        <boxGeometry args={[0.5, 0.12, 0.12]} />
        <meshStandardMaterial
          color={scored ? '#00ff44' : '#1a1a1a'}
          emissive={scored ? '#00ff44' : '#000000'}
          emissiveIntensity={scored ? 3 : 0}
        />
      </mesh>

      <pointLight
        position={[0, boardY + 0.535 + 0.06, BOARD_Z]}
        color="#00ff44"
        intensity={scored ? 8 : 0}
        distance={5}
      />

      {/* Main spotlight to highlight the goal area */}
      <spotLight
        position={[0, HOOP_RIM_POS.y + 3, HOOP_RIM_POS.z - 1]}
        angle={0.6}
        penumbra={0.5}
        intensity={30}
        castShadow
        target={lightTarget}
      />
      <primitive object={lightTarget} />
    </>
  )
}
