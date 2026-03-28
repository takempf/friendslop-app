import { memo } from "react";
import { Sky, Cloud, Clouds } from "@react-three/drei";
import { SUN_POSITION } from "@/constants/sunPosition";
import { debugConfig } from "@/debug/config";

export const PartlyCloudySky = memo(function PartlyCloudySky() {
  if (!debugConfig.showClouds) return null;

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={SUN_POSITION}
        turbidity={3}
        rayleigh={0.4}
        mieCoefficient={0.002}
        mieDirectionalG={0.85}
      />

      <Clouds>
        <Cloud
          position={[0, 38, -100]}
          segments={20} // Reduced from 30
          bounds={[40, 8, 16]}
          volume={18}
          color="white"
          opacity={0.9}
          speed={0.1}
          growth={6}
          fade={20}
        />
        <Cloud
          position={[60, 44, -50]}
          segments={15} // Reduced from 22
          bounds={[30, 7, 12]}
          volume={14}
          color="white"
          opacity={0.85}
          speed={0.08}
          growth={5}
          fade={20}
        />
        <Cloud
          position={[-70, 42, 30]}
          segments={18} // Reduced from 25
          bounds={[34, 7, 14]}
          volume={16}
          color="white"
          opacity={0.85}
          speed={0.12}
          growth={5.5}
          fade={20}
        />
        <Cloud
          position={[20, 50, 90]}
          segments={12} // Reduced from 18
          bounds={[26, 6, 10]}
          volume={12}
          color="white"
          opacity={0.8}
          speed={0.07}
          growth={5}
          fade={20}
        />
        <Cloud
          position={[-40, 46, -80]}
          segments={14} // Reduced from 20
          bounds={[28, 6, 12]}
          volume={13}
          color="white"
          opacity={0.8}
          speed={0.09}
          growth={5}
          fade={20}
        />
      </Clouds>
    </>
  );
});
