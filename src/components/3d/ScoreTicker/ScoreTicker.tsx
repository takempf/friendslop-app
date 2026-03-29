import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Physical dimensions (meters)
const TICKER_W = 20;
const TICKER_H = 0.5;

// Canvas resolution — must match physical aspect ratio (TICKER_W / TICKER_H)
// so the texture isn't stretched. 20m / 0.5m = 40:1 → 5120×128.
const CANVAS_H = 128;
const CANVAS_W = CANVAS_H * (TICKER_W / TICKER_H); // 5120
const FONT_SIZE = 72;

const SCROLL_SPEED = 90; // canvas px / sec
const FETCH_INTERVAL_MS = 60_000;

interface GameScore {
  away: string;
  awayScore: string;
  home: string;
  homeScore: string;
  status: string;
  isoDate: string; // UTC ISO string from ESPN, used to localise scheduled tip-off times
  stateType: string; // "pre" | "in" | "post"
}

interface Segment {
  text: string;
  color: string;
  width: number; // cached canvas px width
}

function todayDateParam(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchNCAAScores(): Promise<GameScore[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${todayDateParam()}`,
  );
  if (!res.ok) throw new Error(`ESPN API ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.events ?? []).map((event: any) => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const away = competitors.find((c: any) => c.homeAway === "away");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const home = competitors.find((c: any) => c.homeAway === "home");
    return {
      away: away?.team?.abbreviation ?? "???",
      awayScore: away?.score ?? "0",
      home: home?.team?.abbreviation ?? "???",
      homeScore: home?.score ?? "0",
      status: comp?.status?.type?.shortDetail ?? "",
      isoDate: event.date ?? "",
      stateType: comp?.status?.type?.state ?? "",
    };
  });
}

function localStatus(game: GameScore): string {
  // For scheduled games, convert the ISO tip-off time to the browser's locale/timezone.
  // In-progress and final games keep the raw shortDetail (e.g. "2nd 4:32", "Final").
  if (game.stateType === "pre" && game.isoDate) {
    const d = new Date(game.isoDate);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
  return game.status;
}

function buildRawSegments(
  scores: GameScore[],
): Array<{ text: string; color: string }> {
  if (scores.length === 0) {
    return [
      {
        text: "   NCAA MEN'S BASKETBALL  ·  NO GAMES SCHEDULED   ",
        color: "#ffffff",
      },
    ];
  }
  const out: Array<{ text: string; color: string }> = [];
  for (const g of scores) {
    out.push({ text: "   ", color: "#ffffff" });
    out.push({ text: g.away, color: "#e0e0ff" });
    out.push({ text: `  ${g.awayScore}`, color: "#ffcc44" });
    out.push({ text: " – ", color: "#888899" });
    out.push({ text: `${g.homeScore}  `, color: "#ffcc44" });
    out.push({ text: g.home, color: "#e0e0ff" });
    out.push({ text: `   ${localStatus(g)}`, color: "#ff7733" });
    out.push({ text: "   ◆   ", color: "#334455" });
  }
  return out;
}

function measureSegments(
  ctx: CanvasRenderingContext2D,
  raw: Array<{ text: string; color: string }>,
): Segment[] {
  ctx.font = `bold ${FONT_SIZE}px monospace`;
  return raw.map((s) => ({
    ...s,
    width: ctx.measureText(s.text).width,
  }));
}

export function ScoreTicker() {
  const segmentsRef = useRef<Segment[]>([]);
  const totalWidthRef = useRef(0);
  const scrollXRef = useRef(0);
  const dirtyRef = useRef(true); // need segment re-measure

  const [texture] = useState(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  const textureRef = useRef(texture);

  // Cleanup texture on unmount
  useEffect(() => () => textureRef.current.dispose(), []);

  // Fetch scores on mount and every minute
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const scores = await fetchNCAAScores();
        if (!cancelled) {
          const raw = buildRawSegments(scores);
          // Store raw segments; useFrame will measure them with the real canvas ctx
          segmentsRef.current = raw.map((s) => ({ ...s, width: 0 }));
          totalWidthRef.current = 0;
          dirtyRef.current = true;
        }
      } catch {
        // keep last known data — ESPN rate limit or off-season
      }
    };

    // Seed with loading placeholder immediately
    segmentsRef.current = [
      {
        text: "   NCAA MEN'S BASKETBALL  ·  LOADING SCORES…   ",
        color: "#ffffff",
        width: 0,
      },
    ];
    dirtyRef.current = true;

    load();
    const id = setInterval(load, FETCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useFrame((_, delta) => {
    const ctx = (textureRef.current.image as HTMLCanvasElement).getContext(
      "2d",
    );
    if (!ctx) return;

    ctx.font = `bold ${FONT_SIZE}px monospace`;

    // Re-measure segments whenever data refreshed
    if (dirtyRef.current) {
      const measured = measureSegments(ctx, segmentsRef.current);
      segmentsRef.current = measured;
      totalWidthRef.current = measured.reduce((s, seg) => s + seg.width, 0);
      dirtyRef.current = false;
      scrollXRef.current = 0;
    }

    const total = totalWidthRef.current;
    if (total <= 0) return;

    // Advance scroll, wrap at full loop
    scrollXRef.current = (scrollXRef.current + SCROLL_SPEED * delta) % total;

    // ── Draw ──────────────────────────────────────────────────────────────────
    // Background
    ctx.fillStyle = "#060c18";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Orange accent bars on left and right edges
    ctx.fillStyle = "#ff5500";
    ctx.fillRect(0, 0, 6, CANVAS_H);
    ctx.fillRect(CANVAS_W - 6, 0, 6, CANVAS_H);

    // Inner border
    ctx.strokeStyle = "#1a2a3a";
    ctx.lineWidth = 3;
    ctx.strokeRect(9, 2, CANVAS_W - 18, CANVAS_H - 4);

    // Draw text segments twice for seamless wrap
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const drawPass = (startX: number) => {
      let x = startX;
      for (const seg of segmentsRef.current) {
        // Skip segments fully off-screen
        if (x + seg.width > 0 && x < CANVAS_W) {
          ctx.fillStyle = seg.color;
          ctx.fillText(seg.text, x, CANVAS_H / 2 + 4);
        }
        x += seg.width;
      }
    };

    // Tile enough passes to fill the canvas regardless of total width
    const originX = -(scrollXRef.current % total);
    const numPasses = Math.ceil(CANVAS_W / total) + 1;
    for (let i = 0; i < numPasses; i++) {
      drawPass(originX + i * total);
    }

    textureRef.current.needsUpdate = true;
  });

  // Position: centered above the hoop, on the south wall face
  // Backboard top is at y ≈ 3.99, scoring indicator at y ≈ 4.05
  // Ticker center at y = 5.0 gives 0.5m clear gap
  return (
    <group position={[0, 7.75, 9.68]} rotation={[0, Math.PI, 0]}>
      {/* Housing frame — thin dark box behind the display */}
      <mesh position={[0, 0, -0.015]}>
        <boxGeometry args={[TICKER_W + 0.08, TICKER_H + 0.06, 0.025]} />
        <meshStandardMaterial color="#0a0a12" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* LED display surface */}
      <mesh>
        <planeGeometry args={[TICKER_W, TICKER_H]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}
