import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, Group } from "three";
import { useGameSync } from "@/sync/GameSyncProvider";
import { getPlayerColor } from "@/utils/colors";
import { useDiscGolfCards } from "./useDiscGolfCards";
import { HOLES } from "./course";

/** Personal navigation is derived from the local player's replicated card.
 * Other players' progress cannot move this marker. No extra network traffic. */
export function GoalBeacon() {
  const { myId, myColorIndex } = useGameSync();
  const cards = useDiscGolfCards();
  const hole = HOLES[cards.get(myId)?.hole ?? 0];
  const root = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (root.current) root.current.visible = camera.position.z < -30;
  });
  if (!hole) return null;
  const color = getPlayerColor(myColorIndex);
  return (
    <group ref={root} position={[hole.basket[0], 0, hole.basket[1]]}>
      {/* Tall translucent shell and narrow bright core stay legible over trees. */}
      <mesh position={[0, 8, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.65, 0.85, 16, 24, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.17}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 8, 0]} renderOrder={3}>
        <cylinderGeometry args={[0.1, 0.16, 16, 12, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.65}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.08, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
