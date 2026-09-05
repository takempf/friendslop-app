import { HeldPose } from "./HeldPose";
import type { EntitySnapshot } from "@/sync/IGameSync";
import { createContext, useCallback, useContext, useRef } from "react";
import type { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { EQUIPMENT_COUNT } from "@/gameplay/equipment";

interface EquipmentContextType {
  registerBody: (id: number, body: RapierRigidBody | null) => void;
  registerVisual: (id: number, visual: THREE.Object3D | null) => void;
  heldPose: React.RefObject<HeldPose>;
  entityGameData: React.RefObject<Map<number, EntitySnapshot["gameData"]>>;
  ownerIds: React.RefObject<Map<number, number>>;
  bodyRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  visualRefs: React.MutableRefObject<(THREE.Object3D | null)[]>;
  heldEntityRef: React.MutableRefObject<number>;
  ownedEntityIds: React.MutableRefObject<Set<number>>;
  ownerVersions: React.MutableRefObject<Map<number, number>>;
  grabCandidateRef: React.MutableRefObject<number>;
  buttonCandidateRef: React.MutableRefObject<boolean>;
  /** Timestamp and index of the last thrown entity to prevent immediate re-grab */
  lastThrowRef: React.MutableRefObject<{ idx: number; time: number }>;
  /** Whether each entity is still at its initial spawn — read-only */
  atSpawn: React.RefObject<boolean[]>;
  /** Mark an entity as removed from its spawn */
  releaseFromSpawn: (idx: number) => void;
  /** Mark an entity as returned to its spawn */
  returnToSpawn: (idx: number) => void;
}

const EquipmentContext = createContext<EquipmentContextType | null>(null);

export function EquipmentProvider({ children }: { children: React.ReactNode }) {
  const bodyRefs = useRef<(RapierRigidBody | null)[]>(
    Array(EQUIPMENT_COUNT).fill(null),
  );
  const visualRefs = useRef<(THREE.Object3D | null)[]>(
    Array(EQUIPMENT_COUNT).fill(null),
  );
  const entityGameData = useRef(new Map<number, EntitySnapshot["gameData"]>());
  const ownerIds = useRef(new Map<number, number>());
  const heldEntityRef = useRef(-1);
  const heldPose = useRef(new HeldPose());
  const ownedEntityIds = useRef<Set<number>>(new Set());
  const ownerVersions = useRef<Map<number, number>>(new Map());
  const grabCandidateRef = useRef(-1);
  const buttonCandidateRef = useRef(false);
  const lastThrowRef = useRef<{ idx: number; time: number }>({
    idx: -1,
    time: 0,
  });
  const atSpawn = useRef<boolean[]>(Array(EQUIPMENT_COUNT).fill(true));

  const registerBody = useCallback(
    (id: number, body: RapierRigidBody | null) => {
      bodyRefs.current[id] = body;
    },
    [],
  );
  const registerVisual = useCallback(
    (id: number, visual: THREE.Object3D | null) => {
      visualRefs.current[id] = visual;
    },
    [],
  );
  const releaseFromSpawn = useCallback((idx: number) => {
    atSpawn.current[idx] = false;
  }, []);

  const returnToSpawn = useCallback((idx: number) => {
    atSpawn.current[idx] = true;
  }, []);

  return (
    <EquipmentContext.Provider
      value={{
        registerBody,
        registerVisual,
        entityGameData,
        ownerIds,
        bodyRefs,
        visualRefs,
        heldEntityRef,
        heldPose,
        ownedEntityIds,
        ownerVersions,
        grabCandidateRef,
        buttonCandidateRef,
        lastThrowRef,
        atSpawn,
        releaseFromSpawn,
        returnToSpawn,
      }}
    >
      {children}
    </EquipmentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEquipment() {
  const ctx = useContext(EquipmentContext);
  if (!ctx)
    throw new Error("useEquipment must be used within EquipmentProvider");
  return ctx;
}
