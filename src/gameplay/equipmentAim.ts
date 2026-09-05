import type { Camera, Vector3 } from "three";
import type { ActiveDevice } from "@/input/actions";
import type { AimState, TargetingConfig } from "@/targeting/types";
import { screenToWorldDirection } from "@/targeting/screenRay";
import { resolveAssistStrengths } from "@/targeting/assistPolicy";
import { pickAssistedDirection } from "@/targeting/throwCorrection";
import type { EquipmentBehavior } from "./EquipmentBehavior";

/** Held tools fire through the displayed reticle, including while it is moving
 * between locks. Throwables retain their device-scaled launch correction. */
export function resolveEquipmentAim(
  camera: Camera,
  aspect: number,
  aim: AimState,
  behavior: Pick<EquipmentBehavior, "use" | "aimTargetKind">,
  device: ActiveDevice,
  config: TargetingConfig,
  out: Vector3,
): Vector3 {
  if (behavior.use || aim.isManualAiming)
    return screenToWorldDirection(
      camera,
      aim.screenX,
      aim.screenY,
      aspect,
      out,
    );

  out.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const assist = resolveAssistStrengths(device, config);
  return pickAssistedDirection(
    out,
    aim.targetKind === behavior.aimTargetKind ? aim.targetPoint : null,
    camera.position,
    assist.yaw,
    assist.pitch,
    out,
  );
}
