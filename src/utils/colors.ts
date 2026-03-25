export const COLOR_POOL = [
  "hsl(0, 80%, 60%)",
  "hsl(30, 80%, 60%)",
  "hsl(60, 80%, 60%)",
  "hsl(90, 80%, 60%)",
  "hsl(120, 80%, 60%)",
  "hsl(150, 80%, 60%)",
  "hsl(180, 80%, 60%)",
  "hsl(210, 80%, 60%)",
  "hsl(240, 80%, 60%)",
  "hsl(270, 80%, 60%)",
  "hsl(300, 80%, 60%)",
  "hsl(330, 80%, 60%)",
];

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

export function getPlayerEmoji(emojiIndex: number): string {
  return EMOJI_POOL[emojiIndex % EMOJI_POOL.length];
}
