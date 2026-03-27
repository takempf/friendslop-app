import { useMemo } from "react";
import * as THREE from "three";
import { BOARD_FRONT_FACE_Z, RIM_RADIUS } from "@/constants/basketball";

const CANVAS_SIZE = 2048;
const FLOOR_SIZE = 20; // meters
const SCALE = CANVAS_SIZE / FLOOR_SIZE; // 102.4 px/m

// Canvas (0,0) = world NW corner (-10, -10 in XZ)
// canvas_x = (world_X + 10) * SCALE
// canvas_y = (world_Z + 10) * SCALE  (south wall Z=10 → canvas_y=2048)
function worldToCanvas(wx: number, wz: number): [number, number] {
  return [(wx + FLOOR_SIZE / 2) * SCALE, (wz + FLOOR_SIZE / 2) * SCALE];
}

function createCourtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // NBA measurements (meters)
  const BASKET_Z = BOARD_FRONT_FACE_Z - RIM_RADIUS; // ≈ 8.834m
  const BASELINE_Z = 10;
  const THREE_PT_RADIUS = 7.24; // 23 ft 9 in
  const THREE_PT_CORNER_X = 6.706; // 22 ft from basket center
  const FREE_THROW_LINE_Z = BOARD_FRONT_FACE_Z - 4.572; // 15 ft from backboard ≈ 4.49m
  const LANE_HALF_W = 2.438; // half of 16-ft lane
  const FT_CIRCLE_RADIUS = 1.829; // 6 ft
  const RESTRICTED_RADIUS = 1.219; // 4 ft
  const BLOCK_OUTER = 0.25; // hash mark extends this far from lane line

  const [bx, by] = worldToCanvas(0, BASKET_Z);

  // --- Paint / key fill ---
  const [paintL, paintTop] = worldToCanvas(-LANE_HALF_W, FREE_THROW_LINE_Z);
  const [paintR, paintBot] = worldToCanvas(LANE_HALF_W, BASELINE_Z);
  ctx.fillStyle = "rgba(170, 70, 10, 0.30)";
  ctx.fillRect(paintL, paintTop, paintR - paintL, paintBot - paintTop);

  // Line style
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Where the 3-pt arc meets the corner straight (inward Z from basket):
  // sqrt(R² - cornerX²) toward center court
  const arcOffset = Math.sqrt(THREE_PT_RADIUS ** 2 - THREE_PT_CORNER_X ** 2); // ≈ 2.729m
  const arcStartZ = BASKET_Z - arcOffset;

  // --- Three-point corner straights ---
  // Right corner (positive X side)
  const [rx0, ry0] = worldToCanvas(THREE_PT_CORNER_X, BASELINE_Z);
  const [rx1, ry1] = worldToCanvas(THREE_PT_CORNER_X, arcStartZ);
  ctx.beginPath();
  ctx.moveTo(rx0, ry0);
  ctx.lineTo(rx1, ry1);
  ctx.stroke();

  // Left corner (negative X side)
  const [lx0, ly0] = worldToCanvas(-THREE_PT_CORNER_X, BASELINE_Z);
  const [lx1, ly1] = worldToCanvas(-THREE_PT_CORNER_X, arcStartZ);
  ctx.beginPath();
  ctx.moveTo(lx0, ly0);
  ctx.lineTo(lx1, ly1);
  ctx.stroke();

  // --- Three-point arc ---
  // Basket is near bottom of canvas (canvas_y≈1929). Arc goes toward smaller canvas_y
  // (toward center court). CCW from right-corner angle to left-corner angle passes
  // through the top (angle ≈ -90°), which is the court-facing portion. ✓
  const r3px = THREE_PT_RADIUS * SCALE;
  const angleR = Math.atan2(ry1 - by, rx1 - bx);
  const angleL = Math.atan2(ly1 - by, lx1 - bx);
  ctx.beginPath();
  ctx.arc(bx, by, r3px, angleR, angleL, true); // CCW → passes through top of arc
  ctx.stroke();

  // --- Free throw lane lines ---
  // Right
  const [rlx0, rly0] = worldToCanvas(LANE_HALF_W, BASELINE_Z);
  const [rlx1, rly1] = worldToCanvas(LANE_HALF_W, FREE_THROW_LINE_Z);
  ctx.beginPath();
  ctx.moveTo(rlx0, rly0);
  ctx.lineTo(rlx1, rly1);
  ctx.stroke();

  // Left
  const [llx0, lly0] = worldToCanvas(-LANE_HALF_W, BASELINE_Z);
  const [llx1, lly1] = worldToCanvas(-LANE_HALF_W, FREE_THROW_LINE_Z);
  ctx.beginPath();
  ctx.moveTo(llx0, lly0);
  ctx.lineTo(llx1, lly1);
  ctx.stroke();

  // Free throw line
  const [ftlx, ftly] = worldToCanvas(-LANE_HALF_W, FREE_THROW_LINE_Z);
  const [ftrx, ftry] = worldToCanvas(LANE_HALF_W, FREE_THROW_LINE_Z);
  ctx.beginPath();
  ctx.moveTo(ftlx, ftly);
  ctx.lineTo(ftrx, ftry);
  ctx.stroke();

  // --- Free throw circle ---
  // Basket is below FT circle center in canvas (larger canvas_y = larger Z = closer to baseline).
  // Solid half faces the basket (downward in canvas = CW arc from 0 to π).
  // Dashed half faces center court (upward in canvas = CCW arc from 0 to π).
  const [ftcx, ftcy] = worldToCanvas(0, FREE_THROW_LINE_Z);
  const ftRadPx = FT_CIRCLE_RADIUS * SCALE;

  // Solid — toward basket (bottom half of circle in canvas)
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(ftcx, ftcy, ftRadPx, 0, Math.PI, false); // CW → bottom half
  ctx.stroke();

  // Dashed — away from basket (top half of circle in canvas)
  ctx.setLineDash([22, 18]);
  ctx.beginPath();
  ctx.arc(ftcx, ftcy, ftRadPx, 0, Math.PI, true); // CCW → top half
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Block marks (NBA: 7 ft and 11 ft from baseline) ---
  const blockPositions = [
    BASELINE_Z - 2.134, // 7 ft  → Z ≈ 7.866
    BASELINE_Z - 3.353, // 11 ft → Z ≈ 6.647
  ];
  for (const blockZ of blockPositions) {
    // Right block: extends outward (positive X from lane line)
    const [brx0, bry0] = worldToCanvas(LANE_HALF_W, blockZ);
    const [brx1, bry1] = worldToCanvas(LANE_HALF_W + BLOCK_OUTER, blockZ);
    ctx.beginPath();
    ctx.moveTo(brx0, bry0);
    ctx.lineTo(brx1, bry1);
    ctx.stroke();

    // Left block: extends outward (negative X from lane line)
    const [blx0, bly0] = worldToCanvas(-LANE_HALF_W, blockZ);
    const [blx1, bly1] = worldToCanvas(-LANE_HALF_W - BLOCK_OUTER, blockZ);
    ctx.beginPath();
    ctx.moveTo(blx0, bly0);
    ctx.lineTo(blx1, bly1);
    ctx.stroke();
  }

  // --- Restricted area arc (4-ft radius, faces center court) ---
  // Center = basket. Court side = smaller canvas_y (upward). CCW from 0 to π = top half. ✓
  const restrictedPx = RESTRICTED_RADIUS * SCALE;
  ctx.beginPath();
  ctx.arc(bx, by, restrictedPx, 0, Math.PI, true); // CCW → top half = toward center court
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

export function CourtMarkings() {
  const texture = useMemo(() => createCourtTexture(), []);

  return (
    <mesh
      position={[0, 0.002, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[20, 20]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
