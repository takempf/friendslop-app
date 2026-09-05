import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { targetingSystem } from "@/targeting/TargetingSystem";
import type { TargetProvider } from "@/targeting/types";
import { useFrame } from "@react-three/fiber";
import { useInput } from "@/input/useInput";
import { useEquipment } from "./EquipmentContext";
import { aimState } from "@/targeting/aimState";

/** A world interaction uses the same reticle ranking, range and occlusion as pickups. */
export function WorldAction({
  id,
  position,
  onInteract,
}: {
  id: string;
  position: [number, number, number];
  onInteract: () => void;
}) {
  const input = useInput();
  const { heldEntityRef } = useEquipment();
  const [x, y, z] = position;
  const provider = useMemo<TargetProvider>(() => {
    const point = new Vector3(x, y, z);
    return {
      kind: "world-action",
      isActive: (ctx) => !ctx.isHoldingEquipment,
      collect(ctx, out) {
        if (ctx.cameraPosition.distanceTo(point) <= 2.5)
          out.push({ id, kind: "world-action", point });
      },
    };
  }, [id, x, y, z]);
  useEffect(() => targetingSystem.registerProvider(provider), [provider]);
  useFrame(() => {
    if (
      heldEntityRef.current === -1 &&
      aimState.targetId === id &&
      input.justPressed("interact")
    )
      onInteract();
  }, -0.4);
  return null;
}
