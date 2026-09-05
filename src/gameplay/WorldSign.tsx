import { useEffect, useRef, useState } from "react";
import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";

/** Canvas lettering stays local/offline and deliberately crisp at low resolution. */
export function WorldSign({
  lines,
  width = 3,
  height = 2,
  accent = "#efbf59",
}: {
  lines: string[];
  width?: number;
  height?: number;
  accent?: string;
}) {
  const [texture] = useState(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.magFilter = NearestFilter;
    return t;
  });
  const textureRef = useRef(texture);
  useEffect(() => {
    const t = textureRef.current;
    const ctx = (t.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#182e2c";
    ctx.fillRect(0, 0, 1024, 768);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, 1000, 744);
    const row = Math.min(100, 680 / Math.max(lines.length, 1));
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? accent : "#f4eed6";
      ctx.font = `${i === 0 ? "bold " : ""}${Math.min(i === 0 ? 62 : 44, row * 0.65)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(line, 512, 65 + i * row, 940);
    });
    t.needsUpdate = true;
  }, [lines, accent]);
  useEffect(() => () => textureRef.current.dispose(), []);
  return (
    <group>
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.14]} />
        <meshLambertMaterial color="#654a30" />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}
