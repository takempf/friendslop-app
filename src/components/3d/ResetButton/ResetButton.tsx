import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useBasketball } from "@/contexts/BasketballContext";
import { sharedOutlineMat, sharedStrokeMat } from "@/utils/outlineMaterial";
import { RESET_BUTTON_POS } from "@/constants/basketball";

const BUTTON_W = 0.8;
const BUTTON_H = 0.4;
const BUTTON_D = 0.1;

function createLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#bb0000";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RESET", 128, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const labelTexture = createLabelTexture();

// Body, stroke and outline are all the same box — share one geometry.
const buttonBox = new THREE.BoxGeometry(BUTTON_W, BUTTON_H, BUTTON_D);

export function ResetButton() {
  const { buttonCandidateRef } = useBasketball();
  const outlineRef = useRef<THREE.Mesh>(null);
  const strokeRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const isCandidate = buttonCandidateRef.current;
    if (outlineRef.current) outlineRef.current.visible = isCandidate;
    if (strokeRef.current) strokeRef.current.visible = isCandidate;
  });

  // rotation [0, π, 0] so the label plane faces the player (toward -Z)
  return (
    <group position={RESET_BUTTON_POS} rotation={[0, Math.PI, 0]}>
      {/* Button body */}
      <mesh castShadow geometry={buttonBox}>
        <meshStandardMaterial color="#cc1111" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* RESET label on front face (local +Z after rotation = world -Z toward player) */}
      <mesh position={[0, 0, BUTTON_D / 2 + 0.002]}>
        <planeGeometry args={[BUTTON_W - 0.06, BUTTON_H - 0.06]} />
        <meshBasicMaterial map={labelTexture} transparent />
      </mesh>
      {/* Outline: black outer stroke */}
      <mesh
        ref={strokeRef}
        visible={false}
        renderOrder={1}
        geometry={buttonBox}
        material={sharedStrokeMat}
      />
      {/* Outline: white inner fill */}
      <mesh
        ref={outlineRef}
        visible={false}
        renderOrder={2}
        geometry={buttonBox}
        material={sharedOutlineMat}
      />
    </group>
  );
}
