import * as THREE from "three";

export function createDebugTexture(
  baseColor: string,
  halfMeterLineColor: string,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // 0.5M lines — slightly darker, 1px, at center
  ctx.strokeStyle = halfMeterLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, size);
  ctx.moveTo(0, 256);
  ctx.lineTo(size, 256);
  ctx.stroke();

  // 1M lines — white, 2px at canvas edges (each tile contributes 1px; adjacent tiles merge into a 2px line)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);

  // "1M" label near top-left corner (inside the 1M mark intersection)
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px monospace";
  ctx.fillText("1M", 5, 29);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
