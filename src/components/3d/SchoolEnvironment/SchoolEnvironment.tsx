import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { SUN_POSITION } from "@/constants/sunPosition";
import { BasketballHoop } from "@/components/3d/BasketballHoop/BasketballHoop";
import { Basketballs } from "@/components/3d/Basketballs/Basketballs";
import { CourtMarkings } from "@/components/3d/CourtMarkings/CourtMarkings";
import { Scoreboard } from "@/components/3d/Scoreboard/Scoreboard";
import { ResetButton } from "@/components/3d/ResetButton/ResetButton";
import { Banner } from "@/components/3d/Banner/Banner";
import tennesseeBanner from "@/assets/tennessee-iowa-state-banner.jpg";
import tennesseeMiamiBanner from "@/assets/tennessee-miami-ohio-victory-banner.png";
import { createDebugTexture } from "@/components/3d/textures/DebugTexture/DebugTexture";

// Helper component for Walls/Floors
const Block = ({
  position,
  args,
  color,
  restitution = 0,
  wallTexture,
  textureRepeat,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  restitution?: number;
  wallTexture?: THREE.CanvasTexture;
  textureRepeat?: [number, number];
}) => {
  const clonedTexture = useMemo(() => {
    if (!wallTexture || !textureRepeat) return null;
    const t = wallTexture.clone();
    t.repeat.set(textureRepeat[0], textureRepeat[1]);
    t.needsUpdate = true;
    return t;
  }, [wallTexture, textureRepeat]);

  return (
    <RigidBody
      type="fixed"
      position={position}
      colliders="cuboid"
      restitution={restitution}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        {clonedTexture ? (
          <meshLambertMaterial map={clonedTexture} />
        ) : (
          <meshLambertMaterial color={color} />
        )}
      </mesh>
    </RigidBody>
  );
};

export function SchoolEnvironment() {
  const wallHeight = 8;
  const wallThickness = 0.5;
  const debugTex = useMemo(() => createDebugTexture("#b0b0b0", "#979797"), []);
  const floorTex = useMemo(() => createDebugTexture("#c87030", "#a85820"), []);

  // Convenience: wall repeat for X-thin walls (visible face = depth × height)
  const wr = (depth: number): [number, number] => [depth, wallHeight];
  // Convenience: wall repeat for Z-thin walls (visible face = width × height)
  const wc = (width: number): [number, number] => [width, wallHeight];

  return (
    <group>
      {/* Lights */}
      {/* Hemisphere light approximates GI: sky blue from above, warm ground bounce from below */}
      <hemisphereLight args={["#aacfee", "#7a5230", 1.2]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={200}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0001}
      />

      {/* --- Gymnasium --- */}
      {/* Floor 20x20 */}
      <Block
        position={[0, -0.25, 0]}
        args={[20, 0.5, 20]}
        color="#8b5a2b"
        restitution={0.84}
        wallTexture={floorTex}
        textureRepeat={[20, 20]}
      />

      {/* Walls for Gym */}
      {/* West Wall */}
      <Block
        position={[-10, wallHeight / 2, 0]}
        args={[wallThickness, wallHeight, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={wr(20)}
      />
      {/* East Wall */}
      <Block
        position={[10, wallHeight / 2, 0]}
        args={[wallThickness, wallHeight, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={wr(20)}
      />
      {/* South Wall */}
      <Block
        position={[0, wallHeight / 2, 10]}
        args={[20, wallHeight, wallThickness]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={wc(20)}
      />
      {/* North Wall - with a gap for the hallway */}
      <Block
        position={[-6, wallHeight / 2, -10]}
        args={[8, wallHeight, wallThickness]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={wc(8)}
      />
      <Block
        position={[6, wallHeight / 2, -10]}
        args={[8, wallHeight, wallThickness]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={wc(8)}
      />
      {/* The Hallway gap is from X=-2 to X=2 at Z=-10 */}

      {/* --- Hallway --- */}
      {/* Floor 4x20 (Z from -10 to -30) */}
      <Block
        position={[0, -0.25, -20]}
        args={[4, 0.5, 20]}
        color="#708090"
        restitution={0.84}
        wallTexture={floorTex}
        textureRepeat={[4, 20]}
      />

      {/* Hallway Walls */}
      <Block
        position={[-2, wallHeight / 2, -20]}
        args={[wallThickness, wallHeight, 20]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(20)}
      />
      <Block
        position={[2, wallHeight / 2, -20]}
        args={[wallThickness, wallHeight, 20]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(20)}
      />
      {/* End of Hallway */}
      <Block
        position={[0, wallHeight / 2, -30]}
        args={[4, wallHeight, wallThickness]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wc(4)}
      />

      {/* --- Classroom A (West of Hallway at Z=-25) --- */}
      {/* Opening in West Hallway wall is at Z=-25, width=2 */}
      <Block
        position={[-2, wallHeight / 2, -15]}
        args={[wallThickness, wallHeight, 10]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(10)}
      />
      <Block
        position={[-2, wallHeight / 2, -28]}
        args={[wallThickness, wallHeight, 6]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(6)}
      />

      {/* Floor 10x10 */}
      <Block
        position={[-7.5, -0.25, -25]}
        args={[10, 0.5, 10]}
        color="#5f9ea0"
        restitution={0.84}
        wallTexture={floorTex}
        textureRepeat={[10, 10]}
      />
      {/* Classroom A Walls */}
      <Block
        position={[-12.5, wallHeight / 2, -25]}
        args={[wallThickness, wallHeight, 10]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wr(10)}
      />
      <Block
        position={[-7.5, wallHeight / 2, -20]}
        args={[10, wallHeight, wallThickness]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wc(10)}
      />
      <Block
        position={[-7.5, wallHeight / 2, -30]}
        args={[10, wallHeight, wallThickness]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wc(10)}
      />

      {/* Basketball */}
      <BasketballHoop />
      <Scoreboard />
      <ResetButton />
      <Banner
        position={[-5.0, 6.0, 9.70]}
        imageSrc={tennesseeBanner}
        width={2.0 * (1024 / 558)}
        height={2.0}
      />
      <Banner
        position={[-5.0, 3.2, 9.70]}
        imageSrc={tennesseeMiamiBanner}
        width={2.0 * (2752 / 1536)}
        height={2.0}
      />
      <Basketballs />
      <CourtMarkings />

      {/* --- Classroom B (East of Hallway at Z=-25) --- */}
      {/* Opening in East Hallway wall is at Z=-25, width=2 */}
      <Block
        position={[2, wallHeight / 2, -15]}
        args={[wallThickness, wallHeight, 10]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(10)}
      />
      <Block
        position={[2, wallHeight / 2, -28]}
        args={[wallThickness, wallHeight, 6]}
        color="#f5f5dc"
        wallTexture={debugTex}
        textureRepeat={wr(6)}
      />

      {/* Floor 10x10 */}
      <Block
        position={[7.5, -0.25, -25]}
        args={[10, 0.5, 10]}
        color="#5f9ea0"
        restitution={0.84}
        wallTexture={floorTex}
        textureRepeat={[10, 10]}
      />
      {/* Classroom B Walls */}
      <Block
        position={[12.5, wallHeight / 2, -25]}
        args={[wallThickness, wallHeight, 10]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wr(10)}
      />
      <Block
        position={[7.5, wallHeight / 2, -20]}
        args={[10, wallHeight, wallThickness]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wc(10)}
      />
      <Block
        position={[7.5, wallHeight / 2, -30]}
        args={[10, wallHeight, wallThickness]}
        color="#fdf5e6"
        wallTexture={debugTex}
        textureRepeat={wc(10)}
      />
    </group>
  );
}
