import { createContext, useContext, useRef } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'

interface BasketballContextType {
  ballRefs: React.MutableRefObject<(RapierRigidBody | null)[]>
  heldBallRef: React.MutableRefObject<number>
  ownedBallIds: React.MutableRefObject<Set<number>>
}

const BasketballContext = createContext<BasketballContextType | null>(null)

export function BasketballProvider({ children }: { children: React.ReactNode }) {
  const ballRefs = useRef<(RapierRigidBody | null)[]>([null, null, null, null])
  const heldBallRef = useRef(-1)
  const ownedBallIds = useRef<Set<number>>(new Set())

  return (
    <BasketballContext.Provider value={{ ballRefs, heldBallRef, ownedBallIds }}>
      {children}
    </BasketballContext.Provider>
  )
}

export function useBasketball() {
  const ctx = useContext(BasketballContext)
  if (!ctx) throw new Error('useBasketball must be used within BasketballProvider')
  return ctx
}
