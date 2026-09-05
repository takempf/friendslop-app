import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SharedWorld } from "@/sync/SharedWorld";
import {
  beginThrow,
  completeHole,
  DISC_GOLF_SCOPE,
  type Scorecard,
} from "./scoring";
import { caughtBasket, COURSE_PAR, HOLES, scoreLabel } from "./course";
function setup() {
  return new SharedWorld(new Y.Doc());
}
describe("six-hole disc golf", () => {
  it("counts releases, rejects wrong baskets, and deduplicates catches", () => {
    const world = setup();
    const first = beginThrow(world, 1, "One")!;
    const second = beginThrow(world, 1, "One")!;
    expect(completeHole(world, first, 0)).toBe(false);
    expect(completeHole(world, second, 1)).toBe(false);
    expect(completeHole(world, second, 0)).toBe(true);
    expect(completeHole(world, second, 0)).toBe(false);
    const card = world.records<Scorecard>(DISC_GOLF_SCOPE).get(1)!;
    expect(card.completed).toEqual([2]);
    expect(card.hole).toBe(1);
    expect(card.message).toContain("BIRDIE");
  });
  it("scores all six holes, preserves separate players, and ends the round", () => {
    const world = setup();
    beginThrow(world, 2, "Two");
    for (const [i, hole] of HOLES.entries()) {
      let shot;
      for (let j = 0; j < hole.par; j++) shot = beginThrow(world, 1, "One");
      expect(completeHole(world, shot!, i)).toBe(true);
    }
    const cards = world.records<Scorecard>(DISC_GOLF_SCOPE);
    expect(cards.get(1)?.completed.reduce((a, b) => a + b, 0)).toBe(COURSE_PAR);
    expect(cards.get(1)?.message).toContain("ROUND COMPLETE");
    expect(cards.get(2)?.strokes).toBe(1);
    expect(beginThrow(world, 1, "One")).toBeUndefined();
  });
  it("invalidates discs in flight when scores are cleared", () => {
    const world = setup();
    const shot = beginThrow(world, 1, "One")!;
    world.reset(DISC_GOLF_SCOPE);
    expect(completeHole(world, shot, 0)).toBe(false);
    expect(beginThrow(world, 1, "One")?.hole).toBe(0);
  });
  it("detects fast downward crossings, rejecting upward and side entries", () => {
    const hole = HOLES[0],
      [x, z] = hole.basket;
    expect(caughtBasket([x, 2, z], [x, 0.8, z], hole)).toBe(true);
    expect(caughtBasket([x, 0.8, z], [x, 2, z], hole)).toBe(false);
    expect(caughtBasket([x + 1, 2, z], [x + 1, 0.8, z], hole)).toBe(false);
    expect(caughtBasket([x, 0.8, z], [x, 0.7, z], hole)).toBe(false);
  });
  it("names scores relative to par and recognizes an ace", () => {
    expect(scoreLabel(1, 3)).toBe("ACE!");
    expect(scoreLabel(2, 4)).toBe("EAGLE");
    expect(scoreLabel(3, 3)).toBe("PAR");
    expect(scoreLabel(4, 3)).toBe("BOGEY");
    expect(scoreLabel(5, 3)).toBe("DOUBLE BOGEY");
  });
});
