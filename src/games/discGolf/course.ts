export interface Hole {
  number: number;
  name: string;
  par: number;
  tee: [number, number];
  basket: [number, number];
}
export const HOLES: Hole[] = [
  { number: 1, name: "FIRST LIGHT", par: 3, tee: [0, -39], basket: [-8, -60] },
  {
    number: 2,
    name: "PINE ALLEY",
    par: 3,
    tee: [-13, -64],
    basket: [-30, -89],
  },
  {
    number: 3,
    name: "LONG MEADOW",
    par: 4,
    tee: [-25, -98],
    basket: [12, -113],
  },
  { number: 4, name: "THE NEEDLE", par: 3, tee: [23, -108], basket: [34, -81] },
  { number: 5, name: "CEDAR TURN", par: 4, tee: [31, -72], basket: [11, -52] },
  { number: 6, name: "HOME STRETCH", par: 3, tee: [20, -48], basket: [8, -35] },
];
export const COURSE_PAR = HOLES.reduce((sum, hole) => sum + hole.par, 0);
export const COURSE_RESET: [number, number, number] = [-6, 1.2, -34.75];
export const COURSE_BOUNDS = { minX: -46, maxX: 46, minZ: -126, maxZ: -30 };

export function scoreLabel(strokes: number, par: number): string {
  if (strokes === 1) return "ACE!";
  const relative = strokes - par;
  return relative === -3
    ? "ALBATROSS"
    : relative === -2
      ? "EAGLE"
      : relative === -1
        ? "BIRDIE"
        : relative === 0
          ? "PAR"
          : relative === 1
            ? "BOGEY"
            : relative === 2
              ? "DOUBLE BOGEY"
              : `${relative > 0 ? "+" : ""}${relative}`;
}

/** Swept plane crossing avoids tunnelling and rejects side/below/held entries. */
export function caughtBasket(
  previous: [number, number, number],
  current: [number, number, number],
  hole: Hole,
): boolean {
  const catchY = 1.05;
  if (previous[1] <= catchY || current[1] > catchY) return false;
  const t = (previous[1] - catchY) / (previous[1] - current[1]);
  const x = previous[0] + (current[0] - previous[0]) * t;
  const z = previous[2] + (current[2] - previous[2]) * t;
  return Math.hypot(x - hole.basket[0], z - hole.basket[1]) < 0.43;
}
