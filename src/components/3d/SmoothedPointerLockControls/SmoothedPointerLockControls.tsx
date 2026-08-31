import { useRef, type RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useInput } from "@/input/useInput";

interface Props {
  leanRef?: RefObject<number>;
}

const PI_2 = Math.PI / 2;

export function SmoothedPointerLockControls({ leanRef }: Props): null {
  const { camera } = useThree();
  const input = useInput();

  // Reusable Euler instance
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  // Track previous lean to detect changes even when look input is still
  const prevLean = useRef(0);

  // Process unified look input EXACTLY once per rendering frame at priority -1.
  // This ensures camera rotation is updated before PlayerController (priority 0)
  // calculates movement and held item positions, eliminating 1-frame jitter.
  useFrame((_, delta): void => {
    // 1. Update and merge input for this frame
    input.update(delta);
    const frame = input.getFrame();

    const leanAngle = leanRef?.current ?? 0;
    const hasLook = frame.lookYaw !== 0 || frame.lookPitch !== 0;
    const leanChanged = leanAngle !== prevLean.current;

    if (!hasLook && !leanChanged) return;

    euler.current.setFromQuaternion(camera.quaternion);

    euler.current.y += frame.lookYaw;
    euler.current.x += frame.lookPitch;

    // Clamp pitch to prevent looking past straight up/down
    euler.current.x = Math.max(-PI_2, Math.min(PI_2, euler.current.x));

    // Apply camera lean (roll) from strafing
    euler.current.z = leanAngle;
    prevLean.current = leanAngle;

    camera.quaternion.setFromEuler(euler.current);
  }, -1);

  return null;
}
