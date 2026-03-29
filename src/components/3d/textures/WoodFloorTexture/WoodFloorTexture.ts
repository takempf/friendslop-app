import * as THREE from "three";

/**
 * Creates a tiling hardwood floor texture suitable for a gymnasium.
 * Each tile represents a ~0.15m-wide plank running along the Z axis.
 * Planks have wood-grain streaks and subtle color variation.
 */
export function createWoodFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // --- Base fill: warm reddish-brown tone ---
  ctx.fillStyle = "#eeac56ff";
  ctx.fillRect(0, 0, size, size);

  // --- Plank separators (horizontal lines = seams between planks) ---
  // Each plank is ~30px wide in texture space (so ~17 planks per tile)
  const plankHeight = 30;
  ctx.strokeStyle = "#8a3820";
  ctx.lineWidth = 1.5;
  for (let y = plankHeight; y < size; y += plankHeight) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // --- Wood grain: subtle streaks running along plank length ---
  const rng = mulberry32(42);
  for (let i = 0; i < 180; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 40 + rng() * 120;
    const alpha = 0.04 + rng() * 0.1;
    const dark = rng() > 0.5;
    ctx.strokeStyle = dark
      ? `rgba(100,28,10,${alpha})`
      : `rgba(235,130,65,${alpha})`;
    ctx.lineWidth = 0.5 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y + len);
    ctx.stroke();
  }

  // --- Per-plank color variation ---
  for (let row = 0; row * plankHeight < size; row++) {
    const v = (rng() - 0.5) * 0.12;
    const r = Math.round(217 + v * 255);
    const g = Math.round(112 + v * 255);
    const b = Math.round(72 + v * 255);
    ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
    ctx.fillRect(0, row * plankHeight + 2, size, plankHeight - 3);
  }

  // --- Subtle specular highlight (lighter strip down the center of each plank) ---
  for (let row = 0; row * plankHeight < size; row++) {
    const y = row * plankHeight + plankHeight / 2;
    const grad = ctx.createLinearGradient(
      0,
      y - plankHeight / 2,
      0,
      y + plankHeight / 2,
    );
    grad.addColorStop(0, "rgba(255,220,140,0)");
    grad.addColorStop(0.5, "rgba(255,220,140,0.08)");
    grad.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, row * plankHeight, size, plankHeight);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.rotation = Math.PI / 2;
  texture.center.set(0.5, 0.5);
  return texture;
}

/** Deterministic pseudo-random number generator (returns 0–1). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
