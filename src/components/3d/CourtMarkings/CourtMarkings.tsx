import { useMemo } from "react";
import { createCourtTexture } from "@/components/3d/textures/CourtTexture/CourtTexture";

export function CourtMarkings() {
  const texture = useMemo(() => createCourtTexture(), []);

  return (
    <mesh
      position={[0, 0.002, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[20, 20]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
