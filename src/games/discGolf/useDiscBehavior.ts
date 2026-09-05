import { wristIndicatorState } from "./wristIndicatorState";
import { useEffect, useRef } from "react";
import { DiscWristInput } from "./wristInput";
import { Quaternion, Vector3 } from "three";
import { useEquipment } from "@/gameplay/EquipmentContext";
import type { EquipmentBehavior } from "@/gameplay/EquipmentBehavior";
import { useGameSync } from "@/sync/GameSyncProvider";
import { beginThrow } from "./scoring";
import {
  DISC_CHARGE_SECONDS,
  resolveDiscWristAngles,
  discHoldPose,
  discReleaseSpin,
} from "./throwMotion";
const releaseRotation = new Quaternion(),
  spin = new Vector3(),
  releasePosition = new Vector3();
export function useDiscBehavior(): EquipmentBehavior {
  const wrist = useRef(new DiscWristInput());
  const { entityGameData } = useEquipment();
  const { sync, myId, myName } = useGameSync();
  useEffect(() => () => wristIndicatorState.publish(null), []);
  return {
    captureLook: (frame, heldId) => {
      const captured = wrist.current.capture(frame, heldId);
      if (heldId < 0 || !frame.buttons.chargeThrow)
        wristIndicatorState.publish(null);
      return captured;
    },
    throwSettings: () => ({
      minThrowSpeed: 4,
      maxThrowSpeed: 23,
      throwArcDeg: 5,
      throwSpinMult: 0,
    }),
    hold({ camera, chargeSeconds, charging }, position, rotation) {
      wristIndicatorState.publish(
        charging
          ? resolveDiscWristAngles(chargeSeconds, wrist.current.angles)
          : null,
      );
      discHoldPose(
        camera,
        chargeSeconds,
        position,
        rotation,
        wrist.current.angles,
      );
    },
    onThrow({ id, body, chargeRatio, camera }) {
      wristIndicatorState.publish(null);
      // Resolve the final wrist input, including motion on the release frame.
      discHoldPose(
        camera,
        chargeRatio * DISC_CHARGE_SECONDS,
        releasePosition,
        releaseRotation,
        wrist.current.angles,
      );
      body.setRotation(releaseRotation, true);
      body.setAngvel(discReleaseSpin(releaseRotation, chargeRatio, spin), true);
      if (sync)
        entityGameData.current.set(id, beginThrow(sync.world, myId, myName));
    },
  };
}
