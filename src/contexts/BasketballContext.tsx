import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { RapierRigidBody } from "@react-three/rapier";

interface BasketballContextType {
  ballRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  heldBallRef: React.MutableRefObject<number>;
  ownedBallIds: React.MutableRefObject<Set<number>>;
  ballOwnerVersions: React.MutableRefObject<Map<number, number>>;
  grabCandidateRef: React.MutableRefObject<number>;
  scores: Map<number, number>;
  addScore: (colorIndex: number) => void;
  resetScores: () => void;
  buttonCandidateRef: React.MutableRefObject<boolean>;
}

const BasketballContext = createContext<BasketballContextType | null>(null);

export function BasketballProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ballRefs = useRef<(RapierRigidBody | null)[]>([null, null, null, null]);
  const heldBallRef = useRef(-1);
  const ownedBallIds = useRef<Set<number>>(new Set());
  const ballOwnerVersions = useRef<Map<number, number>>(new Map());
  const grabCandidateRef = useRef(-1);
  const buttonCandidateRef = useRef(false);
  const [scores, setScores] = useState<Map<number, number>>(new Map());

  const addScore = useCallback((colorIndex: number) => {
    setScores((prev) => {
      const next = new Map(prev);
      next.set(colorIndex, (next.get(colorIndex) ?? 0) + 1);
      return next;
    });
  }, []);

  const resetScores = useCallback(() => {
    setScores(new Map());
  }, []);

  return (
    <BasketballContext.Provider
      value={{
        ballRefs,
        heldBallRef,
        ownedBallIds,
        ballOwnerVersions,
        grabCandidateRef,
        buttonCandidateRef,
        scores,
        addScore,
        resetScores,
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
