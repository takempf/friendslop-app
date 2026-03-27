import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGameSync } from "../sync/GameSyncProvider";
import { getPlayerColor, getPlayerEmoji } from "../utils/colors";

const TEX_W = 512;
const TEX_H = 768;
const BOARD_W = 3.0;
const BOARD_H = BOARD_W * (TEX_H / TEX_W); // 4.5m

interface PlayerEntry {
  name: string;
  colorIndex: number;
  emojiIndex: number;
}

function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  players: PlayerEntry[],
  scores: Map<number, number>,
) {
  const W = TEX_W;
  const H = TEX_H;

  // Sort by score descending
  const sorted = [...players].sort(
    (a, b) => (scores.get(b.colorIndex) ?? 0) - (scores.get(a.colorIndex) ?? 0),
  );

  // Background
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d1520";
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = "#3a5a7a";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Title strip
  ctx.fillStyle = "#1a2d42";
  ctx.fillRect(8, 8, W - 16, 86);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("SCOREBOARD", W / 2, 51);

  // Title divider
  ctx.strokeStyle = "#3a5a7a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(12, 96);
  ctx.lineTo(W - 12, 96);
  ctx.stroke();

  if (sorted.length === 0) {
    ctx.fillStyle = "#5a7a9a";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No players", W / 2, H / 2);
    return;
  }

  const availH = H - 108;
  const rowH = Math.min(Math.floor(availH / sorted.length), 100);

  sorted.forEach((player, i) => {
    const y = 108 + i * rowH;
    const midY = y + rowH / 2;
    const score = scores.get(player.colorIndex) ?? 0;
    const color = getPlayerColor(player.colorIndex);
    const emoji = getPlayerEmoji(player.emojiIndex);

    // Alternating row tint
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(8, y, W - 16, rowH);

    // Emoji
    const emojiFontSize = Math.floor(rowH * 0.55);
    ctx.font = `${emojiFontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(emoji, 20, midY + 2);

    // Player name in their color
    const nameFontSize = Math.floor(rowH * 0.37);
    ctx.font = `bold ${nameFontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    const maxNameW = W - 20 - 80 - 80; // leave room for emoji and score
    let name = player.name;
    // Truncate name if too long
    while (name.length > 1 && ctx.measureText(name).width > maxNameW) {
      name = name.slice(0, -1);
    }
    ctx.fillText(name, 84, midY);

    // Score on the right
    const scoreFontSize = Math.floor(rowH * 0.5);
    ctx.font = `bold ${scoreFontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(score), W - 20, midY);

    // Row divider (skip last)
    if (i < sorted.length - 1) {
      ctx.strokeStyle = "#253545";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, y + rowH);
      ctx.lineTo(W - 12, y + rowH);
      ctx.stroke();
    }
  });
}

export function Scoreboard() {
  const { scores, myId, myName, myColorIndex, myEmojiIndex, connectedPeers } =
    useGameSync();

  // useState lazy init runs once — texture is a stable value safe to read in JSX
  const [texture] = useState(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  // Ref for effect-time mutations so texture is not a listed dep
  const textureRef = useRef(texture);

  useEffect(() => () => textureRef.current.dispose(), []);

  useEffect(() => {
    const t = textureRef.current;
    // CanvasTexture stores the source canvas as .image
    const canvas = t.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Build deduped player list: local player first, then remotes
    const seen = new Set<number>();
    const players: PlayerEntry[] = [];

    players.push({
      name: myName,
      colorIndex: myColorIndex,
      emojiIndex: myEmojiIndex,
    });
    seen.add(myColorIndex);

    for (const peer of connectedPeers) {
      if (peer.id !== myId && !seen.has(peer.colorIndex)) {
        players.push({
          name: peer.name,
          colorIndex: peer.colorIndex,
          emojiIndex: peer.emojiIndex,
        });
        seen.add(peer.colorIndex);
      }
    }

    drawScoreboard(ctx, players, scores);
    t.needsUpdate = true;
  }, [scores, myId, myName, myColorIndex, myEmojiIndex, connectedPeers]);

  // 5m to the right of the hoop center (x=0) → x=5
  // On the north wall face (z≈9.70, just in front of z=9.75 wall surface)
  // rotation [0, π, 0] so the display faces the player (toward -Z)
  return (
    <group position={[5, 4.0, 9.7]} rotation={[0, Math.PI, 0]}>
      {/* Backing frame — sits behind the display (local -Z = world +Z toward wall) */}
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[BOARD_W + 0.06, BOARD_H + 0.06, 0.02]} />
        <meshLambertMaterial color="#112030" />
      </mesh>
      {/* Canvas display */}
      <mesh>
        <planeGeometry args={[BOARD_W, BOARD_H]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}
