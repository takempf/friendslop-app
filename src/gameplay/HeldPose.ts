import { Object3D, Quaternion, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";

const parentRotation = new Quaternion();

/** Camera-authored world pose. Physics is a follower while locally held,
 * never the source of first-person presentation or held network snapshots. */
export class HeldPose {
  private id = -1;
  readonly position = new Vector3();
  readonly rotation = new Quaternion();

  set(id: number, position: Vector3, rotation: Quaternion): void {
    this.id = id;
    this.position.copy(position);
    this.rotation.copy(rotation);
  }
  get(id: number): HeldPose | null {
    return id >= 0 && id === this.id ? this : null;
  }
  present(id: number, object: Object3D | null | undefined): boolean {
    if (!object || !this.get(id)) return false;
    applyWorldPose(object, this.position, this.rotation);
    return true;
  }
  release(id: number, body: RapierRigidBody): boolean {
    if (!this.get(id)) return false;
    // Hand off where the player sees the object, even between fixed steps.
    body.setTranslation(this.position, true);
    body.setRotation(this.rotation, true);
    this.id = -1;
    return true;
  }
}

export function applyWorldPose(
  object: Object3D,
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number; w: number },
): void {
  object.position.copy(position);
  object.quaternion.copy(rotation);
  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    object.parent.worldToLocal(object.position);
    object.parent.getWorldQuaternion(parentRotation);
    object.quaternion.premultiply(parentRotation.invert());
  }
  object.updateMatrix();
}
