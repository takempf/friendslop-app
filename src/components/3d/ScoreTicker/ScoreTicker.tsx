import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Physical dimensions (meters)
const TICKER_W = 20;
const TICKER_H = 0.5;

// Physical aspect ratio is 40:1 (20m / 0.5m).
// Each text row is 64px tall, giving 2560px visible width in texture space.
const ROW_H = 64;
const ATLAS_W = 2048;
const ATLAS_H = 2048;
const TOTAL_ROWS = ATLAS_H / ROW_H; // 32 rows = 65,536 px capacity
const VISIBLE_W = Math.round(ROW_H * (TICKER_W / TICKER_H)); // 2560 px
const FONT_SIZE = 36;
const FONT_SPEC = `bold ${FONT_SIZE}px monospace`;

const SCROLL_SPEED = 45; // texture px / sec (~0.35 m/s)
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

function renderAtlas(
  canvas: HTMLCanvasElement,
  segments: Segment[],
  totalWidth: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#060c18";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  if (totalWidth <= 0 || segments.length === 0) return;

  ctx.font = FONT_SPEC;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  let virtualX = 0;
  for (const seg of segments) {
    let drawX = virtualX;
    const segEnd = virtualX + seg.width;
    ctx.fillStyle = seg.color;

    while (drawX < segEnd) {
      const rowIndex = Math.floor(drawX / ATLAS_W);
      if (rowIndex >= TOTAL_ROWS) break;

      const rowStartX = rowIndex * ATLAS_W;
      const xInRow = drawX - rowStartX;
      const rowY = rowIndex * ROW_H;
      const offsetInSeg = drawX - virtualX;

      ctx.fillText(seg.text, xInRow - offsetInSeg, rowY + ROW_H / 2 + 1);

      drawX = (rowIndex + 1) * ATLAS_W;
    }

    virtualX = segEnd;
  }
}

const tickerVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const tickerFragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uScrollX;
  uniform float uTotalWidth;
  uniform float uVisibleWidth;

  varying vec2 vUv;

  const float ATLAS_W = 2048.0;
  const float ATLAS_H = 2048.0;
  const float ROW_H = 64.0;

  void main() {
    float xInMarquee = vUv.x * uVisibleWidth;
    float virtualX = mod(uScrollX + xInMarquee, uTotalWidth);

    float rowIndex = floor(virtualX / ATLAS_W);
    float xInRow = virtualX - rowIndex * ATLAS_W;

    vec2 uv;
    uv.x = xInRow / ATLAS_W;
    uv.y = 1.0 - (rowIndex * ROW_H + (1.0 - vUv.y) * ROW_H) / ATLAS_H;

    gl_FragColor = texture2D(uAtlas, uv);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const INITIAL_RAW_SEGMENTS = [
  {
    text: "   NCAA MEN'S BASKETBALL  ·  LOADING SCORES…   ",
    color: "#ffffff",
  },
];

interface TickerResources {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  material: THREE.ShaderMaterial;
  totalWidth: number;
}

function createTickerResources(): TickerResources {
  const segments = measureSegments(INITIAL_RAW_SEGMENTS);
  const totalWidth = segments.reduce((acc, s) => acc + s.width, 0);

  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  renderAtlas(canvas, segments, totalWidth);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.ShaderMaterial({
    vertexShader: tickerVertexShader,
    fragmentShader: tickerFragmentShader,
    uniforms: {
      uAtlas: { value: texture },
      uScrollX: { value: 0.0 },
      uTotalWidth: { value: totalWidth },
      uVisibleWidth: { value: VISIBLE_W },
    },
  });

  return { canvas, texture, material, totalWidth };
}

export function ScoreTicker() {
  const [resources] = useState(createTickerResources);
  const resourcesRef = useRef(resources);
  const scrollXRef = useRef(0);
  const totalWidthRef = useRef(resources.totalWidth);

  // Cleanup GPU resources on unmount
  useEffect(() => {
    const { texture, material } = resourcesRef.current;
    return () => {
      texture.dispose();
      material.dispose();
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
        const newTotal = measured.reduce((acc, s) => acc + s.width, 0);

        if (measured.length > 0 && newTotal > 0) {
          const res = resourcesRef.current;
          renderAtlas(res.canvas, measured, newTotal);

          // Upload updated texture to GPU ONCE
          res.texture.needsUpdate = true;
          totalWidthRef.current = newTotal;

          const uniforms = res.material.uniforms;
          uniforms.uTotalWidth.value = newTotal;
        }
      } catch {
        // Keep last known data if ESPN rate limited or offline
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
    const total = totalWidthRef.current;
    if (total <= 0) return;

    scrollXRef.current = (scrollXRef.current + SCROLL_SPEED * delta) % total;
    resourcesRef.current.material.uniforms.uScrollX.value = scrollXRef.current;
  });

  return (
    <group position={[0, 7.75, 9.68]} rotation={[0, Math.PI, 0]}>
      {/* Housing frame — thin dark box behind the display */}
      <mesh position={[0, 0, -0.015]}>
        <boxGeometry args={[TICKER_W + 0.08, TICKER_H + 0.06, 0.025]} />
        <meshStandardMaterial color="#0a0a12" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* LED display surface */}
      <mesh material={resources.material}>
        <planeGeometry args={[TICKER_W, TICKER_H]} />
      </mesh>
    </group>
  );
}
