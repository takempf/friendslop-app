import { useEffect, useRef, type RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePointerLock } from "../hooks/usePointerLock";

interface Props {
  sensitivity?: number;
  leanRef?: RefObject<number>;
}

export function SmoothedPointerLockControls({
  sensitivity = 0.002,
  leanRef,
}: Props) {
  const { camera } = useThree();
  const { locked } = usePointerLock();

  // Reusable Euler instance
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  // Accumulate raw mouse deltas to apply perfectly synchronously in useFrame
  const mouseDelta = useRef({ x: 0, y: 0 });

  // Track previous lean to detect changes even when mouse is still
  const prevLean = useRef(0);

  useEffect(() => {
    if (!locked) return;

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    const onMouseMove = (event: MouseEvent) => {
      // Safari often fails to deliver raw sensor counts even with unadjustedMovement: true,
      // instead applying macOS's pointer acceleration curves. Trackpad movements report as
      // very tiny deltas. Here we apply a heuristic multiplier to normalize the speed to Chrome's.
      // (Using 2.5 as a baseline trackpad compensation factor for Safari).
      const multiplier = isSafari ? 2.5 : 1;

      // Simply pool the incoming inputs. This solves event drop/desync issues where
      // the browser fires multiple mouse events per frame or drops them during rendering.
      mouseDelta.current.x += (event.movementX || 0) * multiplier;
      mouseDelta.current.y += (event.movementY || 0) * multiplier;
    };

    document.addEventListener("mousemove", onMouseMove);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [locked]);

  // Process mouse input EXACTLY once per rendering frame in the game loop
  useFrame(() => {
    const leanAngle = leanRef?.current ?? 0;
    const hasMouse = mouseDelta.current.x !== 0 || mouseDelta.current.y !== 0;
    const leanChanged = leanAngle !== prevLean.current;
    if (!hasMouse && !leanChanged) return;

    const PI_2 = Math.PI / 2;
    euler.current.setFromQuaternion(camera.quaternion);

    euler.current.y -= mouseDelta.current.x * sensitivity;
    euler.current.x -= mouseDelta.current.y * sensitivity;

    // Clamp pitch to prevent looking past straight up/down
    euler.current.x = Math.max(-PI_2, Math.min(PI_2, euler.current.x));

    // Apply camera lean (roll) from strafing
    euler.current.z = leanAngle;
    prevLean.current = leanAngle;

    camera.quaternion.setFromEuler(euler.current);

    // Reset delta for the next frame's accumulation
    mouseDelta.current.x = 0;
    mouseDelta.current.y = 0;
  });

  return null;
}
