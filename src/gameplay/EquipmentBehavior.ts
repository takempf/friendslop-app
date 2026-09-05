import type { InputFrame } from "@/input/actions";
import type { Camera, Quaternion, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import type { EquipmentKind } from "./equipment";

export interface HoldContext {
  camera: Camera;
  delta: number;
  moving: boolean;
  moveX: number;
  charging: boolean;
  chargeSeconds: number;
  bodyY: number;
  relativeRotation: Quaternion;
}
export interface ReleaseContext {
  camera: Camera;
  id: number;
  body: RapierRigidBody;
  direction: Vector3;
  chargeRatio: number;
  groundPosition: [number, number];
}
export interface UseContext {
  camera: Camera;
  id: number;
  direction: Vector3;
  delta: number;
  firing: boolean;
  firePressed: boolean;
  reloadPressed: boolean;
  secondaryPressed: boolean;
  release: (velocity: Vector3) => void;
}
interface HeldBehavior {
  /** Tool state (for example ammunition) survives pickup/drop; projectile shot state does not. */
  preserveStateOnTransfer?: boolean;
  /** Consume look before camera/reticle updates; -1 resets inactive equipment. */
  captureLook?: (frame: InputFrame, heldId: number) => boolean;
  aimTargetKind?: string;
  hold: (context: HoldContext, position: Vector3, rotation: Quaternion) => void;
}
/** A held item is either a continuous tool or a charge-and-release projectile. */
export type EquipmentBehavior = HeldBehavior &
  (
    | {
        use: (context: UseContext) => void;
        throwSettings?: never;
        onThrow?: never;
      }
    | {
        use?: never;
        throwSettings: () => {
          minThrowSpeed: number;
          maxThrowSpeed: number;
          throwArcDeg: number;
          throwSpinMult: number;
        };
        onThrow: (context: ReleaseContext) => void;
      }
  );
export type EquipmentBehaviors = Record<EquipmentKind, EquipmentBehavior>;
