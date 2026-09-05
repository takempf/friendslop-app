import { WorldSign } from "@/gameplay/WorldSign";
import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { SUN_POSITION } from "@/constants/sunPosition";
import { SHADOW_MAP_SIZE } from "@/constants/render";

// Required once for RectAreaLight to work with MeshStandardMaterial.
RectAreaLightUniformsLib.init();
import { BasketballHoop } from "@/components/3d/BasketballHoop/BasketballHoop";
import { BallRack } from "@/components/3d/BallRack/BallRack";
import { Basketballs } from "@/components/3d/Basketballs/Basketballs";
import { Scoreboard } from "@/components/3d/Scoreboard/Scoreboard";
import { ResetButton } from "@/components/3d/ResetButton/ResetButton";
import { Banner } from "@/components/3d/Banner/Banner";
import { ScoreTicker } from "@/components/3d/ScoreTicker/ScoreTicker";
import tennesseeBanner from "@/assets/tennessee-iowa-state-banner.jpg";
import tennesseeMiamiBanner from "@/assets/tennessee-miami-ohio-victory-banner.png";
import { createDebugTexture } from "@/components/3d/textures/DebugTexture/DebugTexture";
import { createWoodFloorTexture } from "@/components/3d/textures/WoodFloorTexture/WoodFloorTexture";
import { createCourtTexture } from "@/components/3d/textures/CourtTexture/CourtTexture";
import { createCourtFloorMaterial } from "@/components/3d/materials/CourtFloorMaterial/CourtFloorMaterial";

// Texture.clone() shares the underlying Source, so all clones reuse a single GPU
// upload — only `repeat` differs. Cache per repeat so the blocks share a handful
// of texture objects, and so a re-render doesn't allocate a fresh clone (and
// re-upload) for every wall in the level.
const repeatedTextures = new Map<string, THREE.CanvasTexture>();

function repeatedTexture(
  base: THREE.CanvasTexture,
  [rx, ry]: [number, number],
): THREE.CanvasTexture {
  const key = `${base.uuid}:${rx}:${ry}`;
  let texture = repeatedTextures.get(key);
  if (!texture) {
    texture = base.clone();
    texture.repeat.set(rx, ry);
    texture.needsUpdate = true;
    repeatedTextures.set(key, texture);
  }
  return texture;
}

// Helper component for Walls/Floors
const Block = ({
  position,
  args,
  color,
  restitution = 0,
  wallTexture,
  textureRepeat,
  castShadow = true,
  material,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  restitution?: number;
  wallTexture?: THREE.CanvasTexture;
  textureRepeat?: [number, number];
  /** Floors sit at the bottom of the level and have nothing below them to
   *  shade — leaving them out of the shadow pass costs nothing visually. */
  castShadow?: boolean;
  /** Overrides the default textured/flat material — used by the gym floor,
   *  which carries the court markings in its own shader. */
  material?: THREE.Material;
}) => {
  const clonedTexture =
    wallTexture && textureRepeat
      ? repeatedTexture(wallTexture, textureRepeat)
      : null;

  return (
    <RigidBody
      type="fixed"
      position={position}
      colliders="cuboid"
      restitution={restitution}
    >
      <mesh castShadow={castShadow} receiveShadow material={material}>
        <boxGeometry args={args} />
        {!material &&
          (clonedTexture ? (
            <meshLambertMaterial map={clonedTexture} />
          ) : (
            <meshLambertMaterial color={color} />
          ))}
      </mesh>
    </RigidBody>
  );
};

// A rectangular light bar mounted above a banner, aimed at its face.
// Position is the top-center of the banner (same as Banner's position prop).
function BannerLight({
  position,
  width,
}: {
  position: [number, number, number];
  width: number;
}) {
  const [x, y, z] = position;

  const HOUSING_H = 0.08;
  const HOUSING_D = 0.12;
  const DIFFUSER_H = 0.01;
  // Light sits just above the banner top, flush against the wall.
  const lightY = y + HOUSING_H / 2;
  const lightZ = z - HOUSING_D / 2;

  const rotation = useMemo((): THREE.Euler => {
    const dummy = new THREE.RectAreaLight();
    dummy.position.set(x, lightY, lightZ);
    dummy.lookAt(x, lightY - 1.0, lightZ - 0.3);
    return dummy.rotation.clone();
  }, [x, lightY, lightZ]);

  return (
    <group>
      {/* Housing body — dark metal box */}
      <mesh position={[x, lightY, lightZ]}>
        <boxGeometry args={[width, HOUSING_H, HOUSING_D]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.5} metalness={0.8} />
      </mesh>

      {/* Diffuser strip on the bottom face — warm emissive panel */}
      <mesh position={[x, lightY - HOUSING_H / 2 - DIFFUSER_H / 2, lightZ]}>
        <boxGeometry args={[width - 0.02, DIFFUSER_H, HOUSING_D - 0.02]} />
        <meshStandardMaterial
          color="#fff8f0"
          emissive="#fff8f0"
          emissiveIntensity={2.5}
          roughness={0.9}
        />
      </mesh>

      {/* The actual RectAreaLight */}
      <rectAreaLight
        position={[x, lightY - HOUSING_H / 2, lightZ]}
        rotation={rotation}
        width={width}
        height={HOUSING_D}
        intensity={12}
        color="#fff8f0"
      />
    </group>
  );
}

export function SchoolEnvironment() {
  const wallHeight = 8;
  const wallThickness = 0.5;
  const debugTex = useMemo(() => createDebugTexture("#b0b0b0", "#979797"), []);
  const floorTex = useMemo(() => createWoodFloorTexture(), []);
  const courtFloorMat = useMemo(
    () =>
      createCourtFloorMaterial(
        repeatedTexture(floorTex, [10, 10]),
        createCourtTexture(),
      ),
    [floorTex],
  );

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
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-near={40}
        shadow-camera-far={160}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />

      {/* --- Gymnasium --- */}
      {/* Floor 20x20 — court markings live in this material's shader */}
      <Block
        position={[0, -0.25, 0]}
        args={[20, 0.5, 20]}
        color="#eeac56"
        restitution={0.84}
        material={courtFloorMat}
        castShadow={false}
      />

      {/* Walls for Gym */}
      {/* West Wall — split into 4 segments around a 16m × 5m window */}
      {/* Bottom strip: full width, 1.5m tall */}
      <Block
        position={[-10, 0.75, 0]}
        args={[wallThickness, 1.5, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[20, 1.5]}
      />
      {/* Top strip: full width, 1.5m tall */}
      <Block
        position={[-10, 7.25, 0]}
        args={[wallThickness, 1.5, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[20, 1.5]}
      />
      {/* Left end cap (near Z=-10): 2m wide, 5m tall */}
      <Block
        position={[-10, 4, -9]}
        args={[wallThickness, 5, 2]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[2, 5]}
      />
      {/* Right end cap (near Z=+10): 2m wide, 5m tall */}
      <Block
        position={[-10, 4, 9]}
        args={[wallThickness, 5, 2]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[2, 5]}
      />
      {/* West window glass pane */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0.6}>
        <mesh position={[-9.75, 4, 0]}>
          <boxGeometry args={[0.05, 5, 16]} />
          <meshStandardMaterial
            color="#a8d8ea"
            transparent
            opacity={0.25}
            roughness={0}
            metalness={0.1}
          />
        </mesh>
      </RigidBody>

      {/* East Wall — split into 4 segments around a 16m × 5m window */}
      {/* Bottom strip: full width, 1.5m tall */}
      <Block
        position={[10, 0.75, 0]}
        args={[wallThickness, 1.5, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[20, 1.5]}
      />
      {/* Top strip: full width, 1.5m tall */}
      <Block
        position={[10, 7.25, 0]}
        args={[wallThickness, 1.5, 20]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[20, 1.5]}
      />
      {/* Left end cap (near Z=-10): 2m wide, 5m tall */}
      <Block
        position={[10, 4, -9]}
        args={[wallThickness, 5, 2]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[2, 5]}
      />
      {/* Right end cap (near Z=+10): 2m wide, 5m tall */}
      <Block
        position={[10, 4, 9]}
        args={[wallThickness, 5, 2]}
        color="#dcdcdc"
        wallTexture={debugTex}
        textureRepeat={[2, 5]}
      />
      {/* East window glass pane */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0.6}>
        <mesh position={[9.75, 4, 0]}>
          <boxGeometry args={[0.05, 5, 16]} />
          <meshStandardMaterial
            color="#a8d8ea"
            transparent
            opacity={0.25}
            roughness={0}
            metalness={0.1}
          />
        </mesh>
      </RigidBody>
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
        castShadow={false}
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
      {/* Rear exit: open double doors, continuous floor into Pine Six. */}
      <Block
        position={[0, 5.6, -30]}
        args={[4, 4.8, wallThickness]}
        color="#f5f5dc"
      />
      {[-1.7, 1.7].map((x) => (
        <Block
          key={x}
          position={[x, 1.6, -30]}
          args={[0.6, 3.2, 0.5]}
          color="#36524d"
        />
      ))}
      {[-1.4, 1.4].map((x) => (
        <group
          key={x}
          position={[x, 0, -30]}
          rotation={[0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
        >
          <Block
            position={[x < 0 ? 0.65 : -0.65, 1.5, 0]}
            args={[1.3, 3, 0.1]}
            color="#567568"
          />
          <mesh position={[x < 0 ? 0.65 : -0.65, 2, 0.06]}>
            <boxGeometry args={[0.8, 0.85, 0.02]} />
            <meshLambertMaterial color="#a6c7b5" />
          </mesh>
        </group>
      ))}
      <group position={[0, 3.7, -29.7]}>
        <WorldSign
          lines={["PINE SIX", "DISC GOLF / 6 HOLES"]}
          width={2.8}
          height={0.8}
        />
      </group>
      <group position={[0, 3.7, -30.3]} rotation={[0, Math.PI, 0]}>
        <WorldSign
          lines={["GYM / BASKETBALL", "WELCOME BACK"]}
          width={2.8}
          height={0.8}
        />
      </group>

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
        castShadow={false}
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
      <ScoreTicker />
      <BasketballHoop />
      <Scoreboard />
      <ResetButton />
      <Banner
        position={[-5.0, 6.0, 9.7]}
        imageSrc={tennesseeBanner}
        width={2.0 * (1024 / 558)}
        height={2.0}
      />
      <BannerLight position={[-5.0, 6.0, 9.7]} width={2.0 * (1024 / 558)} />
      <Banner
        position={[-5.0, 3.2, 9.7]}
        imageSrc={tennesseeMiamiBanner}
        width={2.0 * (2752 / 1536)}
        height={2.0}
      />
      <BannerLight position={[-5.0, 3.2, 9.7]} width={2.0 * (2752 / 1536)} />
      {/* Ball racks in the two rear corners of the court */}
      <BallRack position={[-8, 0, -8]} />
      <BallRack position={[8, 0, -8]} />
      <Basketballs />

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
        castShadow={false}
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
