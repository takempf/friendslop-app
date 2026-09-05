import { describe, expect, it } from "vitest";
import {
  compareSnapshots,
  validSnapshot,
  type OwnedSnapshot,
} from "./replication";
const state: OwnedSnapshot = {
  ownerId: 10,
  ownerVersion: 1,
  sequence: 5,
  pos: [0, 1, 2],
  rot: [0, 0, 0, 1],
  vel: [0, 0, 0],
  angvel: [0, 0, 0],
};
describe("equipment ownership", () => {
  it("resolves simultaneous pickups by the same peer id on both clients", () => {
    const other = { ...state, ownerId: 20, sequence: 1 };
    expect(compareSnapshots(other, state)).toBeGreaterThan(0);
    expect(compareSnapshots(state, other)).toBeLessThan(0);
  });
  it("gives a new ownership epoch precedence over old packet sequences", () => {
    expect(
      compareSnapshots(
        { ...state, ownerVersion: 2, ownerId: 1, sequence: 1 },
        { ...state, sequence: 10000 },
      ),
    ).toBeGreaterThan(0);
  });
  it("rejects reordered motion within an epoch", () => {
    expect(compareSnapshots({ ...state, sequence: 4 }, state)).toBeLessThan(0);
  });
  it("rejects corrupt transform and version data", () => {
    expect(validSnapshot(state)).toBe(true);
    expect(validSnapshot({ ...state, pos: [NaN, 0, 0] })).toBe(false);
    expect(validSnapshot({ ...state, ownerVersion: -1 })).toBe(false);
  });
});
