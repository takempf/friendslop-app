import { useMemo } from "react";
import * as THREE from "three";

// Rack frame dimensions
const RACK_W = 1.26; // total width — fits 4 balls (0.29m spacing) with end caps
const RACK_D = 0.32; // front-to-back depth
const BAR_H = 0.025; // shelf/rail thickness
const POST_W = 0.04; // end post width

// Shelf y-positions relative to the rack group (group origin = floor level)
// Ball centers: bottom row y=0.25, top row y=0.56
const BOTTOM_SHELF_Y = 0.12; // just below bottom balls (0.25 - 0.12 - half bar)
const MID_SHELF_Y = 0.41; // between the two rows
const TOP_RAIL_Y = 0.69; // just above top balls (0.56 + 0.12 + half bar)
const POST_H = TOP_RAIL_Y + BAR_H / 2; // total post height

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

  const postCy = POST_H / 2;

  return (
    <group position={position}>
      {/* Bottom shelf */}
      <mesh
        material={mat}
        position={[0, BOTTOM_SHELF_Y, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[RACK_W, BAR_H, RACK_D]} />
      </mesh>

      {/* Mid shelf — separates bottom and top rows */}
      <mesh
        material={mat}
        position={[0, MID_SHELF_Y, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[RACK_W, BAR_H, RACK_D]} />
      </mesh>

      {/* Top rail */}
      <mesh
        material={mat}
        position={[0, TOP_RAIL_Y, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[RACK_W, BAR_H, RACK_D]} />
      </mesh>

      {/* Left end post */}
      <mesh
        material={mat}
        position={[-(RACK_W / 2 - POST_W / 2), postCy, 0]}
        castShadow
      >
        <boxGeometry args={[POST_W, POST_H, RACK_D]} />
      </mesh>

      {/* Right end post */}
      <mesh
        material={mat}
        position={[RACK_W / 2 - POST_W / 2, postCy, 0]}
        castShadow
      >
        <boxGeometry args={[POST_W, POST_H, RACK_D]} />
      </mesh>
    </group>
  );
}
