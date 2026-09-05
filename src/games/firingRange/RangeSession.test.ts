import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Vector3 } from "three";
import { SharedWorld } from "@/sync/SharedWorld";
import { RangeSession } from "./RangeSession";
import { RANGE_SCOPE, type Trial } from "./trials";
const bay = new Vector3(-8, 1.8, -22),
  west = new Vector3(-1, 0, 0);
function setup(id = 1, doc = new Y.Doc()) {
  const session = new RangeSession();
  session.attach(new SharedWorld(doc), id, `Player ${id}`);
  session.setConnected([1, 2]);
  return { session, doc };
}
describe("shared firing trial lifecycle", () => {
  it("finishes, reports the result, then starts a fresh trial with another weapon", () => {
    const { session: s } = setup();
    s.start("falcon9", "bronze", 0, bay);
    s.update(4, bay, "falcon9");
    s.shoot(bay, west, 100, 4, "falcon9");
    expect(s.mine?.score).toBe(10);
    s.update(44, bay, "falcon9");
    expect(s.mine?.status).toBe("failed");
    s.start("cmp150", "silver", 45, bay);
    expect(s.mine?.weapon).toBe("cmp150");
    expect(s.mine?.score).toBe(0);
    expect(s.resetWeapon).toBe(2);
  });
  it("aborts on dropping or leaving the bay, while allowing an armed Dragon throw", () => {
    const { session: s } = setup();
    s.start("dragon", "bronze", 0, bay);
    s.update(4, bay, undefined, true);
    expect(s.mine?.status).toBe("active");
    s.update(5, bay, undefined);
    expect(s.mine?.status).toBe("aborted");
    s.start("dragon", "bronze", 6, bay);
    s.update(10, new Vector3(-12, 1.8, -22), "dragon");
    expect(s.mine?.status).toBe("aborted");
  });
  it("converges simultaneous network starts and makes spectators unable to score for the owner", () => {
    const a = setup(1),
      b = setup(2);
    a.session.start("falcon9", "bronze", 0, bay);
    b.session.start("dragon", "bronze", 0, bay);
    const ua = Y.encodeStateAsUpdate(a.doc),
      ub = Y.encodeStateAsUpdate(b.doc);
    Y.applyUpdate(a.doc, ub);
    Y.applyUpdate(b.doc, ua);
    a.session.update(4, bay, "falcon9");
    b.session.update(4, bay, "dragon");
    expect(b.session.mine?.status).toBe("aborted");
    b.session.shoot(bay, west, 100, 4, "dragon");
    expect(b.session.world?.records<Trial>(RANGE_SCOPE).get(1)?.score).toBe(0);
    a.session.shoot(bay, west, 100, 4, "falcon9");
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    expect(b.session.world?.records<Trial>(RANGE_SCOPE).get(1)?.score).toBe(10);
  });
  it("counts a mine once and allows time to recover the Dragon after detonation", () => {
    const { session: s } = setup();
    s.start("dragon", "bronze", 0, bay);
    s.update(4, bay, "dragon");
    s.launchMine("mine-1", 4);
    s.explode(new Vector3(-16, 1.8, -22), 5, s.mine!.id, "mine-1");
    expect(s.mine?.shots).toBe(1);
    expect(s.mine?.hits).toBe(1);
    expect(s.mine?.destroyed).toBe(1);
    s.explode(new Vector3(-16, 1.8, -22), 7, s.mine!.id, "mine-1");
    expect(s.mine?.hits).toBe(1);
    s.update(8, bay, undefined);
    expect(s.mine?.status).toBe("active");
    s.update(16, bay, undefined);
    expect(s.mine?.status).toBe("aborted");
  });
  it("restores a trial for late joiners and ignores a previous trial's delayed explosion", () => {
    const a = setup();
    a.session.start("dragon", "bronze", 0, bay);
    const oldId = a.session.mine!.id;
    a.session.update(44, bay, "dragon");
    a.session.start("dragon", "bronze", 45, bay);
    a.session.update(49, bay, "dragon");
    a.session.explode(new Vector3(-16, 1.8, -22), 49, oldId);
    expect(a.session.mine?.score).toBe(0);
    const b = setup(2);
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    b.session.update(49, bay, undefined);
    expect(b.session.winner?.id).toBe(a.session.mine?.id);
  });
});
