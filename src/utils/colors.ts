export function getPlayerColor(clientId: number): string {
  // Use 12 equidistant HSL colors deterministically assigned by clientId
  const hue = (clientId % 12) * 30; // 360 / 12 = 30
  return `hsl(${hue}, 80%, 60%)`;
}

const EMOJIS = ['😀', '😅', '😂', '😎', '🤓', '🤠', '🥳', '🥸', '🥺', '😳', '🤔', '🤫'];

export function getPlayerEmoji(clientId: number): string {
  return EMOJIS[clientId % 12];
}
