import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Physical dimensions (meters)
const TICKER_W = 20;
const TICKER_H = 0.5;

// Canvas resolution — 40:1 physical aspect ratio (20m / 0.5m).
// 64px height with 2560px visible width is oversampled for 640p render target.
const CANVAS_H = 64;
const VISIBLE_W = Math.round(CANVAS_H * (TICKER_W / TICKER_H)); // 2560 px
const FONT_SIZE = 36;
const FONT_SPEC = `bold ${FONT_SIZE}px monospace`;

const SCROLL_SPEED = 45; // canvas px / sec (~0.35 m/s)
const MAX_CHUNK_W = 4096; // max texture size safe limit
const CHUNK_ADVANCE_W = MAX_CHUNK_W - VISIBLE_W; // 1536 px
const FETCH_INTERVAL_MS = 60_000;

interface GameScore {
  away: string;
  awayScore: string;
  home: string;
  homeScore: string;
  status: string;
  isoDate: string;
  stateType: string;
}

interface Segment {
  text: string;
  color: string;
  width: number;
}

interface TickerChunk {
  texture: THREE.CanvasTexture;
  contentWidth: number;
  canvasWidth: number;
}

interface EspnCompetitor {
  homeAway?: "home" | "away";
  score?: string;
  team?: {
    abbreviation?: string;
    shortDisplayName?: string;
    displayName?: string;
  };
}

interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: {
    type?: {
      state?: string;
      shortDetail?: string;
    };
  };
}

interface EspnEvent {
  date?: string;
  competitions?: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
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
  if (!res.ok) {
    throw new Error(`ESPN API ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!data || typeof data !== "object") return [];

  const scoreboard = data as EspnScoreboardResponse;
  const events = scoreboard.events ?? [];

  return events.map((event): GameScore => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === "away");
    const home = competitors.find((c) => c.homeAway === "home");
    return {
      away: away?.team?.abbreviation ?? away?.team?.shortDisplayName ?? "???",
      awayScore: away?.score ?? "0",
      home: home?.team?.abbreviation ?? home?.team?.shortDisplayName ?? "???",
      homeScore: home?.score ?? "0",
      status: comp?.status?.type?.shortDetail ?? "",
      isoDate: event.date ?? "",
      stateType: comp?.status?.type?.state ?? "",
    };
  });
}

function localStatus(game: GameScore): string {
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
    out.push({ text: "   ◆   ", color: "#38bdf8" });
  }
  return out;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!sharedMeasureCtx && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    sharedMeasureCtx = canvas.getContext("2d");
  }
  return sharedMeasureCtx;
}

function measureSegments(
  raw: Array<{ text: string; color: string }>,
): Segment[] {
  const ctx = getMeasureContext();
  if (!ctx) {
    return raw.map((s) => ({ ...s, width: s.text.length * (FONT_SIZE * 0.6) }));
  }
  ctx.font = FONT_SPEC;
  return raw.map((s) => ({
    ...s,
    width: ctx.measureText(s.text).width,
  }));
}

function drawSegmentsSpan(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  totalWidth: number,
  startVirtualX: number,
  spanWidth: number,
): void {
  ctx.fillStyle = "#060c18";
  ctx.fillRect(0, 0, spanWidth, CANVAS_H);

  ctx.font = FONT_SPEC;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  if (totalWidth <= 0 || segments.length === 0) return;

  const normStartX = ((startVirtualX % totalWidth) + totalWidth) % totalWidth;

  let acc = 0;
  let startSegIdx = 0;
  let offsetInSeg = 0;

  for (let i = 0; i < segments.length; i++) {
    const w = segments[i].width;
    if (acc + w > normStartX) {
      startSegIdx = i;
      offsetInSeg = normStartX - acc;
      break;
    }
    acc += w;
  }

  let drawX = -offsetInSeg;
  let segIdx = startSegIdx;

  while (drawX < spanWidth) {
    const seg = segments[segIdx];
    ctx.fillStyle = seg.color;
    ctx.fillText(seg.text, drawX, CANVAS_H / 2 + 1);
    drawX += seg.width;
    segIdx = (segIdx + 1) % segments.length;
  }
}

function createTickerChunks(segments: Segment[]): TickerChunk[] {
  const totalWidth = segments.reduce((acc, s) => acc + s.width, 0);
  if (totalWidth <= 0) return [];

  // Case 1: Total text content fits in a single texture (<= MAX_CHUNK_W)
  if (totalWidth <= MAX_CHUNK_W) {
    let canvasW = totalWidth;
    if (canvasW < VISIBLE_W) {
      const repeats = Math.ceil(VISIBLE_W / totalWidth);
      canvasW = totalWidth * repeats;
      if (canvasW > MAX_CHUNK_W) {
        canvasW =
          Math.floor(MAX_CHUNK_W / totalWidth) * totalWidth || totalWidth;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawSegmentsSpan(ctx, segments, totalWidth, 0, canvasW);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(VISIBLE_W / canvasW, 1);
    texture.offset.set(0, 0);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    return [{ texture, contentWidth: canvasW, canvasWidth: canvasW }];
  }

  // Case 2: Multi-chunk partitioning with overlap buffer
  const numChunks = Math.ceil(totalWidth / CHUNK_ADVANCE_W);
  const chunks: TickerChunk[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startVirtualX = i * CHUNK_ADVANCE_W;
    const contentW = Math.min(CHUNK_ADVANCE_W, totalWidth - startVirtualX);
    const canvasW = contentW + VISIBLE_W;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawSegmentsSpan(ctx, segments, totalWidth, startVirtualX, canvasW);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(VISIBLE_W / canvasW, 1);
    texture.offset.set(0, 0);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    chunks.push({
      texture,
      contentWidth: contentW,
      canvasWidth: canvasW,
    });
  }

  return chunks;
}

const INITIAL_RAW_SEGMENTS = [
  {
    text: "   NCAA MEN'S BASKETBALL  ·  LOADING SCORES…   ",
    color: "#ffffff",
  },
];

export function ScoreTicker() {
  const [initialChunks] = useState<TickerChunk[]>(() => {
    const initialSegments = measureSegments(INITIAL_RAW_SEGMENTS);
    return createTickerChunks(initialSegments);
  });

  const chunksRef = useRef<TickerChunk[]>(initialChunks);
  const activeChunkIndexRef = useRef(0);
  const scrollXRef = useRef(0);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      chunksRef.current.forEach((c) => c.texture.dispose());
      chunksRef.current = [];
    };
  }, []);

  // Fetch scores on mount and every minute
  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const scores = await fetchNCAAScores();
        if (cancelled) return;

        const raw = buildRawSegments(scores);
        const measured = measureSegments(raw);
        const newChunks = createTickerChunks(measured);

        if (newChunks.length > 0) {
          // Dispose previous textures
          chunksRef.current.forEach((c) => c.texture.dispose());
          chunksRef.current = newChunks;
          activeChunkIndexRef.current = 0;
          scrollXRef.current = 0;

          if (materialRef.current) {
            materialRef.current.map = newChunks[0].texture;
            materialRef.current.needsUpdate = true;
          }
        }
      } catch {
        // Keep last known data if ESPN rate limited or network offline
      }
    };

    void load();
    const intervalId = setInterval(() => {
      void load();
    }, FETCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useFrame((_, delta) => {
    const chunks = chunksRef.current;
    if (chunks.length === 0) return;

    if (chunks.length === 1) {
      const chunk = chunks[0];
      scrollXRef.current =
        (scrollXRef.current + SCROLL_SPEED * delta) % chunk.contentWidth;
      chunk.texture.offset.x = scrollXRef.current / chunk.canvasWidth;
      return;
    }

    let activeIdx = activeChunkIndexRef.current;
    let currentChunk = chunks[activeIdx];
    scrollXRef.current += SCROLL_SPEED * delta;

    while (scrollXRef.current >= currentChunk.contentWidth) {
      scrollXRef.current -= currentChunk.contentWidth;
      activeIdx = (activeIdx + 1) % chunks.length;
      activeChunkIndexRef.current = activeIdx;
      currentChunk = chunks[activeIdx];

      if (materialRef.current) {
        materialRef.current.map = currentChunk.texture;
        materialRef.current.needsUpdate = true;
      }
    }

    currentChunk.texture.offset.x =
      scrollXRef.current / currentChunk.canvasWidth;
  });

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
        <meshBasicMaterial
          ref={materialRef}
          map={initialChunks[0]?.texture ?? null}
        />
      </mesh>
    </group>
  );
}
