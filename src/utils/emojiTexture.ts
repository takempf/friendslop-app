import * as THREE from "three";

const textureCache = new Map<string, THREE.CanvasTexture>();

export function getEmojiTexture(emoji: string): THREE.CanvasTexture {
  if (textureCache.has(emoji)) {
    return textureCache.get(emoji)!;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "100px sans-serif";
    // Draw the emoji in the center
    ctx.fillText(emoji, 64, 74);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  textureCache.set(emoji, texture);
  return texture;
}
