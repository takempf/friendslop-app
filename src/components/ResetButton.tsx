import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBasketball } from "../contexts/BasketballContext";
import { sharedOutlineMat, sharedStrokeMat } from "../utils/outlineMaterial";

const BUTTON_W = 0.8;
const BUTTON_H = 0.4;
const BUTTON_D = 0.1;
const INTERACT_RANGE = 2.5;

// Centered below the scoreboard (scoreboard at [5, 4.0, 9.70], bottom edge y≈1.75)
const BUTTON_X = 5;
const BUTTON_Y = 1.4;
const BUTTON_Z = 9.68;

const _toButton = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _buttonWorldPos = new THREE.Vector3(BUTTON_X, BUTTON_Y, BUTTON_Z);

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

export function ResetButton() {
  const { buttonCandidateRef } = useBasketball();
  const outlineRef = useRef<THREE.Mesh>(null);
  const strokeRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    _toButton.subVectors(_buttonWorldPos, camera.position);
    const dist = _toButton.length();
    camera.getWorldDirection(_forward);
    const dot = _forward.dot(_toButton.clone().normalize());

    const isCandidate = dist < INTERACT_RANGE && dot > 0.3;
    buttonCandidateRef.current = isCandidate;

    if (outlineRef.current) outlineRef.current.visible = isCandidate;
    if (strokeRef.current) strokeRef.current.visible = isCandidate;
  });

  // rotation [0, π, 0] so the label plane faces the player (toward -Z)
  return (
    <group position={[BUTTON_X, BUTTON_Y, BUTTON_Z]} rotation={[0, Math.PI, 0]}>
      {/* Button body */}
      <mesh castShadow>
        <boxGeometry args={[BUTTON_W, BUTTON_H, BUTTON_D]} />
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
        material={sharedStrokeMat}
      >
        <boxGeometry args={[BUTTON_W, BUTTON_H, BUTTON_D]} />
      </mesh>
      {/* Outline: white inner fill */}
      <mesh
        ref={outlineRef}
        visible={false}
        renderOrder={2}
        material={sharedOutlineMat}
      >
        <boxGeometry args={[BUTTON_W, BUTTON_H, BUTTON_D]} />
      </mesh>
    </group>
  );
}
