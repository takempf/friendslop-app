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
export interface EquipmentBehavior {
  /** Consume look before camera/reticle updates; -1 resets inactive equipment. */
  captureLook?: (frame: InputFrame, heldId: number) => boolean;
  throwSettings: () => {
    minThrowSpeed: number;
    maxThrowSpeed: number;
    throwArcDeg: number;
    throwSpinMult: number;
  };
  aimTargetKind?: string;
  hold: (context: HoldContext, position: Vector3, rotation: Quaternion) => void;
  onThrow: (context: ReleaseContext) => void;
}
export type EquipmentBehaviors = Record<EquipmentKind, EquipmentBehavior>;
