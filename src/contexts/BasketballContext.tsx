import { createContext, useCallback, useContext, useRef } from "react";
import type { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { BALL_COUNT } from "@/constants/basketball";

interface BasketballContextType {
  ballRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  mainMeshRefs: React.MutableRefObject<(THREE.Object3D | null)[]>;
  heldBallRef: React.MutableRefObject<number>;
  ownedBallIds: React.MutableRefObject<Set<number>>;
  ballOwnerVersions: React.MutableRefObject<Map<number, number>>;
  grabCandidateRef: React.MutableRefObject<number>;
  buttonCandidateRef: React.MutableRefObject<boolean>;
  /** Timestamp and index of the last thrown ball to prevent immediate re-grab */
  lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;
  /** Maps ball index → shot point value (2 or 3) set at throw time */
  ballShotPoints: React.MutableRefObject<Map<number, number>>;
  /** Whether each ball is currently sitting in a rack slot (kinematic hold) — read-only */
  ballInRack: React.RefObject<boolean[]>;
  /** Mark a ball as removed from its rack slot (call when grabbed) */
  releaseBallFromRack: (idx: number) => void;
  /** Mark a ball as returned to its rack slot (call when respawning) */
  returnBallToRack: (idx: number) => void;
}

const BasketballContext = createContext<BasketballContextType | null>(null);

export function BasketballProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ballRefs = useRef<(RapierRigidBody | null)[]>(
    Array(BALL_COUNT).fill(null),
  );
  const mainMeshRefs = useRef<(THREE.Object3D | null)[]>(
    Array(BALL_COUNT).fill(null),
  );
  const heldBallRef = useRef(-1);
  const ownedBallIds = useRef<Set<number>>(new Set());
  const ballOwnerVersions = useRef<Map<number, number>>(new Map());
  const grabCandidateRef = useRef(-1);
  const buttonCandidateRef = useRef(false);
  const lastThrowRef = useRef<{ idx: number; time: number }>({
    idx: -1,
    time: 0,
  });
  const ballShotPoints = useRef<Map<number, number>>(new Map());
  const ballInRack = useRef<boolean[]>(Array(BALL_COUNT).fill(true));

  const releaseBallFromRack = useCallback((idx: number) => {
    ballInRack.current[idx] = false;
  }, []);

  const returnBallToRack = useCallback((idx: number) => {
    ballInRack.current[idx] = true;
  }, []);

  return (
    <BasketballContext.Provider
      value={{
        ballRefs,
        mainMeshRefs,
        heldBallRef,
        ownedBallIds,
        ballOwnerVersions,
        grabCandidateRef,
        buttonCandidateRef,
        lastThrowRef,
        ballShotPoints,
        ballInRack,
        releaseBallFromRack,
        returnBallToRack,
      }}
    >
      {children}
    </BasketballContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBasketball() {
  const ctx = useContext(BasketballContext);
  if (!ctx)
    throw new Error("useBasketball must be used within BasketballProvider");
  return ctx;
}
