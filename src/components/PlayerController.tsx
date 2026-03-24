import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SmoothedPointerLockControls } from './SmoothedPointerLockControls'
import { RigidBody, RapierRigidBody, CapsuleCollider, useRapier, interactionGroups } from '@react-three/rapier'
import * as THREE from 'three'
import { useKeyboard } from '../hooks/useKeyboard'
import { useGameSync } from '../sync/GameSyncProvider'
import { audioManager } from '../audio/AudioManager'
import { useBasketball } from '../contexts/BasketballContext'
import { BALL_RADIUS } from '../constants/basketball'
import { debugConfig } from '../debug/config'

// Group layout: 0 = environment, 1 = player, 2 = balls
// Player never interacts with balls (group 2), only environment
const PLAYER_GROUPS = interactionGroups([1], [0])

const SPEED = 5
const PICKUP_RANGE = 2.5
// Throw params are now driven by debugConfig (see src/debug/config.ts)
const MAX_CHARGE_TIME = 2.5 // seconds to reach full charge

const direction = new THREE.Vector3()
const frontVector = new THREE.Vector3()
const sideVector = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _holdPos = new THREE.Vector3()

// 12 equidistant spawn points in a circle centered in the gym (0,0,0)
const SPAWN_POINTS: [number, number, number][] = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const radius = 6;
  return [Math.cos(angle) * radius, 3, Math.sin(angle) * radius];
});

export function PlayerController() {
  const ref = useRef<RapierRigidBody>(null)
  const keys = useKeyboard()
  const { sync, remoteBallStates } = useGameSync()
  const lastSyncTime = useRef(0)
  const [spawnPoint] = useState(() => SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)])

  const { camera } = useThree()

  // Basketball pick-up / throw state
  const { rapier } = useRapier()
  const { ballRefs, heldBallRef, ownedBallIds, ballOwnerVersions } = useBasketball()
  const prevE = useRef(false)
  const prevQ = useRef(false)
  const qPressTime = useRef(0)
  const throwCharge = useRef(0)

  // Dribble state
  const dribbleTime = useRef(0)
  const dribbleBlend = useRef(0) // 0 = held still, 1 = dribbling

  // DOM refs for throw meter — updated imperatively in useFrame (no re-renders)
  const meterEl = useRef<HTMLDivElement | null>(null)
  const meterFillEl = useRef<HTMLDivElement | null>(null)
  const meterLabelEl = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    camera.rotation.set(0, 0, 0)
  }, [camera])

  useEffect(() => {
    meterEl.current = document.getElementById('throw-meter') as HTMLDivElement
    meterFillEl.current = document.getElementById('throw-meter-fill') as HTMLDivElement
    meterLabelEl.current = document.getElementById('throw-meter-label') as HTMLDivElement
  }, [])

  useFrame((state, delta) => {
    if (!ref.current) return

    // --- Movement ---
    frontVector.set(0, 0, (keys.current.KeyS ? 1 : 0) - (keys.current.KeyW ? 1 : 0))
    sideVector.set((keys.current.KeyA ? 1 : 0) - (keys.current.KeyD ? 1 : 0), 0, 0)

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(SPEED)
      .applyEuler(state.camera.rotation)

    const currentVelocity = ref.current.linvel()
    ref.current.setLinvel({ x: direction.x, y: currentVelocity.y, z: direction.z }, true)

    const pos = ref.current.translation()
    state.camera.position.set(pos.x, pos.y + 0.8, pos.z)

    // --- Basketball pick-up (E key) ---
    const ePressed = keys.current.KeyE
    if (ePressed && !prevE.current) {
      if (heldBallRef.current !== -1) {
        // Drop the ball — restore dynamic physics
        const held = ballRefs.current[heldBallRef.current]
        if (held) {
          held.setBodyType(rapier.RigidBodyType.Dynamic, true)
          held.setGravityScale(1, true)
          held.setLinvel({ x: 0, y: 0, z: 0 }, true)
        }
        heldBallRef.current = -1
      } else {
        // Find nearest ball within pickup range
        let nearestIdx = -1
        let nearestDist = PICKUP_RANGE

        ballRefs.current.forEach((ballRef, i) => {
          if (!ballRef) return
          const bpos = ballRef.translation()
          const dx = bpos.x - pos.x
          const dy = bpos.y - (pos.y + 0.8)
          const dz = bpos.z - pos.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < nearestDist) {
            nearestDist = dist
            nearestIdx = i
          }
        })

        if (nearestIdx !== -1) {
          heldBallRef.current = nearestIdx
          ownedBallIds.current.add(nearestIdx)
          
          const remoteVersion = remoteBallStates.current.get(nearestIdx)?.ownerVersion || 0
          const localVersion = ballOwnerVersions.current.get(nearestIdx) || 0
          const newVersion = Math.max(remoteVersion, localVersion) + 1
          ballOwnerVersions.current.set(nearestIdx, newVersion)

          const ball = ballRefs.current[nearestIdx]
          if (ball) {
            // Switch to kinematic so physics doesn't fight our position updates
            ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
          }
        }
      }
    }
    prevE.current = ePressed

    // --- Throw charge (Q key) ---
    const qPressed = keys.current.KeyQ
    if (qPressed && !prevQ.current) {
      // Q just pressed — start charging
      qPressTime.current = performance.now()
    }

    if (qPressed) {
      throwCharge.current = Math.min((performance.now() - qPressTime.current) / 1000 / MAX_CHARGE_TIME, 1)
    }

    if (!qPressed && prevQ.current) {
      // Q just released — throw if holding a ball
      if (heldBallRef.current !== -1) {
        const ball = ballRefs.current[heldBallRef.current]
        if (ball) {
          const { minThrowSpeed, maxThrowSpeed, throwArcDeg, throwSpinMult } = debugConfig
          const speed = minThrowSpeed + (maxThrowSpeed - minThrowSpeed) * throwCharge.current
          _forward.set(0, 0, -1).applyEuler(state.camera.rotation)
          _right.set(1, 0, 0).applyEuler(state.camera.rotation)
          const arcRad = throwArcDeg * Math.PI / 180
          const cosA = Math.cos(arcRad), sinA = Math.sin(arcRad)
          const upX = _right.y * _forward.z - _right.z * _forward.y
          const upY = _right.z * _forward.x - _right.x * _forward.z
          const upZ = _right.x * _forward.y - _right.y * _forward.x
          ball.setBodyType(rapier.RigidBodyType.Dynamic, true)
          ball.setGravityScale(1, true)
          ball.setLinvel({
            x: (_forward.x * cosA + upX * sinA) * speed,
            y: (_forward.y * cosA + upY * sinA) * speed,
            z: (_forward.z * cosA + upZ * sinA) * speed,
          }, true)
          ball.setAngvel({ x: _right.x * speed * throwSpinMult, y: _right.y * speed * throwSpinMult, z: _right.z * speed * throwSpinMult }, true)
        }
        heldBallRef.current = -1
      }
      throwCharge.current = 0
    }
    prevQ.current = qPressed

    // --- Update held ball position (hold still or dribble) ---
    if (heldBallRef.current !== -1) {
      const ball = ballRefs.current[heldBallRef.current]
      if (ball) {
        const isMoving = Math.abs(direction.x) > 0.1 || Math.abs(direction.z) > 0.1
        const targetBlend = isMoving ? 1 : 0
        dribbleBlend.current += (targetBlend - dribbleBlend.current) * Math.min(delta * 8, 1)

        _forward.set(0, 0, -1).applyEuler(state.camera.rotation)
        _right.set(1, 0, 0).applyEuler(state.camera.rotation)

        // Hold position: slightly in front of camera
        _holdPos
          .copy(state.camera.position)
          .addScaledVector(_forward, BALL_RADIUS * 2 + 0.55)
        const holdX = _holdPos.x
        const holdY = _holdPos.y - 0.15
        const holdZ = _holdPos.z

        // Dribble position: to the right side, bouncing on the floor
        if (isMoving) dribbleTime.current += delta * Math.PI * 2.2
        const bounceT = Math.pow(Math.abs(Math.sin(dribbleTime.current)), 0.4)
        const floorY = pos.y - 1 + BALL_RADIUS
        const hipY = holdY
        const dribbleX = state.camera.position.x + _right.x * 0.3 + _forward.x * 0.6
        const dribbleY = floorY + (hipY - floorY) * bounceT
        const dribbleZ = state.camera.position.z + _right.z * 0.3 + _forward.z * 0.6

        const b = dribbleBlend.current
        ball.setNextKinematicTranslation({
          x: holdX + (dribbleX - holdX) * b,
          y: holdY + (dribbleY - holdY) * b,
          z: holdZ + (dribbleZ - holdZ) * b,
        })
      }
    }

    // --- Throw meter UI (imperative DOM, no re-renders) ---
    if (meterEl.current && meterFillEl.current) {
      const isHolding = heldBallRef.current !== -1
      meterEl.current.style.display = isHolding ? 'flex' : 'none'
      if (isHolding) {
        const pct = throwCharge.current * 100
        meterFillEl.current.style.width = `${pct}%`
        // hue: 120 (green) → 60 (yellow) → 0 (red) as charge grows
        const hue = Math.round((1 - throwCharge.current) * 120)
        meterFillEl.current.style.background = `hsl(${hue}, 90%, 45%)`
        if (meterLabelEl.current) {
          meterLabelEl.current.textContent =
            throwCharge.current > 0 ? 'Release Q to Throw' : 'Hold Q to Charge'
        }
      }
    }

    // --- Sync & audio ---
    const now = performance.now()
    if (sync && now - lastSyncTime.current > 50) {
      lastSyncTime.current = now
      const p = state.camera.position
      const r = state.camera.rotation
      sync.updateMyPresence({
        position: [p.x, p.y, p.z],
        rotation: [r.x, r.y, r.z]
      })

      const forward = new THREE.Vector3(0, 0, -1).applyEuler(r)
      const up = new THREE.Vector3(0, 1, 0).applyEuler(r)
      audioManager.updateListener([p.x, p.y, p.z], [forward.x, forward.y, forward.z], [up.x, up.y, up.z])

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
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[0.5, 0.5]} collisionGroups={PLAYER_GROUPS} />
      </RigidBody>
    </>
  )
}
