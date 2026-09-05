import { describe, expect, it } from "vitest";
import { advanceWeapon, freshWeapon, reloadWeapon, WEAPONS } from "./weapons";

describe("held firearms", () => {
  it("requires a fresh press for every pistol shot", () => {
    const s = freshWeapon("falcon9");
    expect(advanceWeapon(s, "falcon9", 0, 1 / 60, true, true)).toBe(1);
    for (let i = 1; i < 120; i++)
      expect(advanceWeapon(s, "falcon9", i / 60, 1 / 60, true, false)).toBe(0);
    expect(s.ammo).toBe(7);
    expect(advanceWeapon(s, "falcon9", 2, 1 / 60, true, true)).toBe(1);
  });
  it.each([30, 60, 144, 240])("keeps automatic cadence at %i Hz", (hz) => {
    const s = freshWeapon("cmp150");
    for (let i = 0; i <= hz; i++)
      advanceWeapon(s, "cmp150", i / hz, 1 / hz, true, i === 0);
    expect(s.shots).toBe(14);
    expect(s.ammo).toBe(18);
  });
  it("blocks firing until reload completes and transfers only available reserve", () => {
    const s = freshWeapon("falcon9");
    s.ammo = 2;
    s.reserve = 3;
    reloadWeapon(s, "falcon9", 10);
    expect(advanceWeapon(s, "falcon9", 11, 0.016, true, true)).toBe(0);
    expect(s.ammo).toBe(2);
    advanceWeapon(s, "falcon9", 12, 0.016, false, false);
    expect(s.ammo).toBe(5);
    expect(s.reserve).toBe(0);
    reloadWeapon(s, "falcon9", 13);
    expect(s.reloadUntil).toBe(0);
  });
  it("cannot mint ammunition by repeatedly requesting reload", () => {
    const s = freshWeapon("dragon");
    s.ammo = 0;
    reloadWeapon(s, "dragon", 1);
    const end = s.reloadUntil;
    reloadWeapon(s, "dragon", 2);
    expect(s.reloadUntil).toBe(end);
    advanceWeapon(s, "dragon", end, 0.016, false, false);
    expect(s.ammo + s.reserve).toBe(WEAPONS.dragon.reserve);
  });
  it("starts with one shot when pressed at a real wall-clock timestamp", () => {
    const s = freshWeapon("dragon");
    expect(advanceWeapon(s, "dragon", 1800000000, 1 / 60, true, true)).toBe(1);
  });
  it("does not dump a magazine when returning after a long stall", () => {
    const s = freshWeapon("dragon");
    expect(
      advanceWeapon(s, "dragon", 1000, 1000, true, true),
    ).toBeLessThanOrEqual(2);
  });
});
