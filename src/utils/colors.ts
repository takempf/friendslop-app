/** Convert OKLCh to a CSS hex string (#rrggbb), clamped to sRGB gamut. */
function oklchToHex(l: number, c: number, hDeg: number): string {
  // OKLCh → OKLab
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const bk = c * Math.sin(h);

  // OKLab → LMS (cube-root encoded)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * bk;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bk;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * bk;

  // LMS → linear sRGB
  const rl = l_ ** 3, rm = m_ ** 3, rs = s_ ** 3;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

  const r = gamma(clamp(+4.0767416621 * rl - 3.3077115913 * rm + 0.2309699292 * rs));
  const g = gamma(clamp(-1.2684380046 * rl + 2.6097574011 * rm - 0.3413193965 * rs));
  const b = gamma(clamp(-0.0041960863 * rl - 0.7034186147 * rm + 1.7076147010 * rs));

  const hex2 = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

// 12 perceptually-uniform player colors — evenly-spaced hues in OKLCh.
// L=0.72 (bright), C=0.20 (vivid, clamped to sRGB where needed).
const OKLCH_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export const COLOR_POOL = OKLCH_HUES.map((h) => oklchToHex(0.72, 0.20, h));

// Brighter/more-vivid variant used for scoring lights.
const COLOR_POOL_LIGHT = OKLCH_HUES.map((h) => oklchToHex(0.85, 0.24, h));

export const EMOJI_POOL = [
  "😀",
  "😅",
  "😂",
  "😎",
  "🤓",
  "🤠",
  "🥳",
  "🥸",
  "🥺",
  "😳",
  "🤔",
  "🤫",
];

export function getPlayerColor(colorIndex: number): string {
  return COLOR_POOL[colorIndex % COLOR_POOL.length];
}

export function getPlayerLightColor(colorIndex: number): string {
  return COLOR_POOL_LIGHT[colorIndex % COLOR_POOL_LIGHT.length];
}

export function getPlayerEmoji(emojiIndex: number): string {
  return EMOJI_POOL[emojiIndex % EMOJI_POOL.length];
}
