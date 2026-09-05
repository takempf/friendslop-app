export type WeaponId = "falcon9" | "dragon" | "cmp150";
export interface WeaponDefinition {
  name: string;
  magazine: number;
  reserve: number;
  interval: number;
  reloadSeconds: number;
  automatic: boolean;
  spread: number;
  recoil: number;
  secondary: string;
  color: string;
}
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  falcon9: {
    name: "FALCON 9",
    magazine: 8,
    reserve: 80,
    interval: 0.18,
    reloadSeconds: 1.15,
    automatic: false,
    spread: 0.001,
    recoil: 0.065,
    secondary: "PISTOL WHIP",
    color: "#969fae",
  },
  dragon: {
    name: "DRAGON",
    magazine: 30,
    reserve: 240,
    interval: 0.1,
    reloadSeconds: 1.8,
    automatic: true,
    spread: 0.008,
    recoil: 0.042,
    secondary: "PROXIMITY SELF-DESTRUCT",
    color: "#786956",
  },
  cmp150: {
    name: "CMP150",
    magazine: 32,
    reserve: 256,
    interval: 0.075,
    reloadSeconds: 1.45,
    automatic: true,
    spread: 0.012,
    recoil: 0.027,
    secondary: "FOLLOW LOCK-ON",
    color: "#526681",
  },
};

export interface WeaponState {
  ammo: number;
  reserve: number;
  nextShot: number;
  reloadUntil: number;
  secondary: boolean;
  recoil: number;
  shots: number;
}
export function freshWeapon(id: WeaponId): WeaponState {
  return {
    ammo: WEAPONS[id].magazine,
    reserve: WEAPONS[id].reserve,
    nextShot: 0,
    reloadUntil: 0,
    secondary: false,
    recoil: 0,
    shots: 0,
  };
}
export function reloadWeapon(state: WeaponState, id: WeaponId, now: number) {
  if (
    !state.reloadUntil &&
    state.ammo < WEAPONS[id].magazine &&
    state.reserve > 0
  )
    state.reloadUntil = now + WEAPONS[id].reloadSeconds;
}
/** Frame-rate independent cadence with bounded catch-up after stalls. */
export function advanceWeapon(
  state: WeaponState,
  id: WeaponId,
  now: number,
  delta: number,
  firing: boolean,
  pressed: boolean,
): number {
  const weapon = WEAPONS[id];
  state.recoil *= Math.exp(-12 * Math.min(delta, 0.1));
  if (state.reloadUntil) {
    if (now < state.reloadUntil) return 0;
    const transfer = Math.min(weapon.magazine - state.ammo, state.reserve);
    state.ammo += transfer;
    state.reserve -= transfer;
    state.reloadUntil = 0;
  }
  if (!firing || (!weapon.automatic && !pressed)) {
    state.nextShot = Math.max(state.nextShot, now);
    return 0;
  }
  if (!state.ammo) {
    reloadWeapon(state, id, now);
    return 0;
  }
  if (pressed) state.nextShot = Math.max(state.nextShot, now);
  let count = 0;
  state.nextShot = Math.max(state.nextShot, now - 0.1);
  while (now + 1e-8 >= state.nextShot && state.ammo > 0 && count < 3) {
    state.ammo--;
    state.shots++;
    state.recoil = Math.min(0.22, state.recoil + weapon.recoil);
    state.nextShot += weapon.interval;
    count++;
    if (!weapon.automatic) break;
  }
  return count;
}
