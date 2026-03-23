import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useBasketball } from '../contexts/BasketballContext'
import { useGameSync } from '../sync/GameSyncProvider'
import type { RemoteBallState } from '../sync/IGameSync'

const SYNC_INTERVAL_MS = 33   // ~30Hz broadcast rate
const SETTLE_TICKS = 60       // stop broadcasting after 60 ticks (~2s) of stillness
const SETTLE_SPEED_SQ = 0.05 * 0.05 // squared threshold for speed + angspeed

export function BasketballSync() {
  const { rapier } = useRapier()
  const { ballRefs, heldBallRef, ownedBallIds } = useBasketball()
  const { sync, remoteBallStates } = useGameSync()
  const lastBroadcastTime = useRef(0)
  const settleCounters = useRef<Map<number, number>>(new Map())

  useFrame(() => {
    // --- Apply remote ball states every frame ---
    remoteBallStates.current.forEach((state, ballId) => {
      const ball = ballRefs.current[ballId]
      if (!ball) return
      // Never override a ball we're currently holding
      if (heldBallRef.current === ballId) return

      if (state.held) {
        // Remote player is holding this ball — kinematic so it follows them smoothly
        if (ball.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
        }
        ball.setNextKinematicTranslation({ x: state.pos[0], y: state.pos[1], z: state.pos[2] })
      } else {
        // Ball is in flight or at rest — dynamic physics driven by owner's state
        if (ball.bodyType() !== rapier.RigidBodyType.Dynamic) {
          ball.setBodyType(rapier.RigidBodyType.Dynamic, false)
          ball.setGravityScale(1, false)
        }
        ball.setTranslation({ x: state.pos[0], y: state.pos[1], z: state.pos[2] }, true)
        ball.setLinvel({ x: state.vel[0], y: state.vel[1], z: state.vel[2] }, true)
        ball.setAngvel({ x: state.angvel[0], y: state.angvel[1], z: state.angvel[2] }, true)
      }
    })

    // --- Broadcast owned ball states at 30Hz ---
    const now = performance.now()
    if (now - lastBroadcastTime.current < SYNC_INTERVAL_MS) return
    lastBroadcastTime.current = now

    if (!sync || ownedBallIds.current.size === 0) return

    const ballStates: Record<number, RemoteBallState> = {}
    const toRemove: number[] = []

    ownedBallIds.current.forEach(ballId => {
      const ball = ballRefs.current[ballId]
      if (!ball) { toRemove.push(ballId); return }

      const pos = ball.translation()
      const vel = ball.linvel()
      const angvel = ball.angvel()
      const isHeld = heldBallRef.current === ballId

      ballStates[ballId] = {
        pos: [pos.x, pos.y, pos.z],
        vel: [vel.x, vel.y, vel.z],
        angvel: [angvel.x, angvel.y, angvel.z],
        held: isHeld || undefined,
      }

      // Settle detection: stop broadcasting once ball is still for SETTLE_TICKS ticks
      if (!isHeld) {
        const speedSq = vel.x ** 2 + vel.y ** 2 + vel.z ** 2
        const angSpeedSq = angvel.x ** 2 + angvel.y ** 2 + angvel.z ** 2
        if (speedSq < SETTLE_SPEED_SQ && angSpeedSq < SETTLE_SPEED_SQ) {
          const count = (settleCounters.current.get(ballId) ?? 0) + 1
          settleCounters.current.set(ballId, count)
          if (count >= SETTLE_TICKS) {
            toRemove.push(ballId)
            settleCounters.current.delete(ballId)
          }
        } else {
          settleCounters.current.delete(ballId)
        }
      }
    })

    toRemove.forEach(id => ownedBallIds.current.delete(id))

    sync.updateMyPresence({ ballStates })
  })

  return null
}
