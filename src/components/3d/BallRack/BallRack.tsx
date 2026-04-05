import { useMemo } from "react";
import * as THREE from "three";
import { RigidBody } from "@react-three/rapier";

// Rack frame dimensions
const RACK_W = 1.26; // total width — fits 4 balls (0.29m spacing) with end caps
const RACK_D = 0.32; // front-to-back depth

// New rack dimensions: 50% taller than original 0.7025m
const POST_H = 1.05;

export function BallRack({ position }: { position: [number, number, number] }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a3a3a",
        roughness: 0.35,
        metalness: 0.85,
      }),
    [],
  );

  return (
    <group position={position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          material={mat}
          position={[0, POST_H / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[RACK_W, POST_H, RACK_D]} />
        </mesh>
      </RigidBody>
    </group>
  );
}
