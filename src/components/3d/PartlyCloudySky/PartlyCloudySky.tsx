import { useState, useEffect, type JSX } from "react";
import { Sky } from "@react-three/drei";
import { VolumetricClouds } from "@/components/3d/VolumetricClouds/VolumetricClouds";
import { SUN_POSITION } from "@/constants/sunPosition";
import { gameConfig, subscribeToConfig } from "@/config";

export function PartlyCloudySky(): JSX.Element {
  const [, tick] = useState(0);

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

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

      {gameConfig.showClouds && (
        <VolumetricClouds
          coverage={0.5}
          density={1.0}
          resolutionScale={gameConfig.cloudResolution}
          marchSteps={gameConfig.cloudSteps}
          lightSteps={gameConfig.cloudLightSteps}
          detailOctaves={gameConfig.cloudDetail}
        />
      )}
    </>
  );
}
