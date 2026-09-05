import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  accuracy,
  activeTrial,
  createTrial,
  finishTrial,
  hitTarget,
  recordShot,
  targetAt,
} from "./trials";
const origin = new Vector3(-8, 1.8, -22),
  direction = new Vector3(-1, 0, 0);
describe("range targets and scoring", () => {
  it("scores actual bullseye/ring impacts, misses, walls, and backfaces", () => {
    const target = targetAt(0, undefined, 0);
    expect(hitTarget(origin, direction, target)?.points).toBe(10);
    expect(
      hitTarget(origin.clone().add(new Vector3(0, 0.25, 0)), direction, target)
        ?.points,
    ).toBe(5);
    expect(
      hitTarget(origin.clone().add(new Vector3(0, 2, 0)), direction, target),
    ).toBeNull();
    expect(hitTarget(origin, direction, target, 4)).toBeNull();
    expect(
      hitTarget(origin, direction, { ...target, angle: Math.PI }),
    ).toBeNull();
    expect(
      hitTarget(origin, direction, { ...target, angle: Math.PI / 2 }),
    ).toBeNull();
  });
  it("rejects shots during countdown, after the deadline, and after completion", () => {
    const t = createTrial(1, "A", "falcon9", "bronze", 0);
    expect(recordShot(t, [], 2)).toBe(t);
    expect(recordShot(t, [], t.end)).toBe(t);
    const done = finishTrial(t);
    expect(recordShot(done, [], 4)).toBe(done);
  });
  it("counts misses in accuracy and destroys then respawns a target", () => {
    let t = createTrial(1, "A", "falcon9", "bronze", 0);
    for (let i = 0; i < 4; i++)
      t = recordShot(t, [hitTarget(origin, direction, targetAt(0, t, 4))!], 4);
    expect(t.destroyed).toBe(1);
    expect(t.score).toBe(40);
    expect(targetAt(0, t, 4.1).visible).toBe(false);
    expect(targetAt(0, t, 5.6).visible).toBe(true);
    t = recordShot(t, [], 5);
    expect(accuracy(t)).toBe(80);
  });
  it("requires score AND accuracy AND destruction goals", () => {
    const t = {
      ...createTrial(1, "A", "falcon9", "bronze", 0),
      score: 100,
      shots: 10,
      hits: 8,
      destroyed: 2,
    };
    expect(finishTrial(t).status).toBe("passed");
    expect(finishTrial({ ...t, hits: 1 }).status).toBe("failed");
    expect(finishTrial({ ...t, destroyed: 1 }).status).toBe("failed");
    expect(finishTrial({ ...t, score: 20 }).status).toBe("failed");
  });
  it("animates harder targets deterministically for spectators", () => {
    const t = createTrial(1, "A", "dragon", "gold", 0);
    expect(targetAt(1, t, 5)).toEqual(targetAt(1, { ...t }, 5));
    expect(targetAt(1, t, 6).point).not.toEqual(targetAt(1, t, 5).point);
  });
  it("resolves simultaneous starts independently of arrival order and releases departed/expired sessions", () => {
    const a = createTrial(10, "A", "dragon", "gold", 0),
      b = createTrial(20, "B", "cmp150", "gold", 0);
    expect(activeTrial([b, a], 2, new Set([10, 20]))?.owner).toBe(10);
    expect(activeTrial([a, b], 2, new Set([10, 20]))?.owner).toBe(10);
    expect(activeTrial([a, b], 2, new Set([20]))?.owner).toBe(20);
    expect(activeTrial([a, b], 100, new Set([10, 20]))).toBeUndefined();
  });
});
