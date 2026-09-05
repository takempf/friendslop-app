import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SharedWorld } from "./SharedWorld";
import type { OwnedSnapshot } from "@/gameplay/replication";
const snapshot: OwnedSnapshot = {
  ownerId: 10,
  ownerVersion: 1,
  sequence: 1,
  pos: [4, 0.035, -45],
  rot: [0, 0, 0, 1],
  vel: [0, 0, 0],
  angvel: [0, 0, 0],
};
function pair() {
  const a = new Y.Doc(),
    b = new Y.Doc();
  return {
    a,
    b,
    wa: new SharedWorld(a),
    wb: new SharedWorld(b),
    exchange() {
      const ua = Y.encodeStateAsUpdate(a),
        ub = Y.encodeStateAsUpdate(b);
      Y.applyUpdate(a, ub);
      Y.applyUpdate(b, ua);
    },
  };
}
describe("durable multiplayer state", () => {
  it("restores a sleeping disc and scorecard for a late joiner", () => {
    const p = pair();
    p.wa.checkpoint(12, snapshot);
    p.wa.setRecord("disc-golf", 10, { completed: [3, 4], name: "A" });
    Y.applyUpdate(p.b, Y.encodeStateAsUpdate(p.a));
    expect(p.wb.getEntities().get(12)).toEqual(snapshot);
    expect(p.wb.records("disc-golf").get(10)?.completed).toEqual([3, 4]);
  });
  it("converges concurrent claims independently of Yjs map conflict ordering", () => {
    const p = pair();
    p.wa.checkpoint(12, snapshot);
    p.wb.checkpoint(12, { ...snapshot, ownerId: 20 });
    p.exchange();
    expect(p.wa.getEntities().get(12)?.ownerId).toBe(20);
    expect(p.wb.getEntities()).toEqual(p.wa.getEntities());
    p.wa.checkpoint(12, { ...snapshot, ownerVersion: 2 });
    p.exchange();
    expect(p.wb.getEntities().get(12)?.ownerId).toBe(10);
  });
  it("isolates score resets and excludes old-round writes arriving afterward", () => {
    const p = pair();
    p.wa.setRecord("basketball", 10, { points: 8 });
    p.wa.setRecord("disc-golf", 10, { completed: [3] });
    p.exchange();
    p.wa.reset("disc-golf");
    p.wb.setRecord("disc-golf", 20, { completed: [2] });
    p.exchange();
    expect(p.wa.records("disc-golf").size).toBe(0);
    expect(p.wb.records("disc-golf").size).toBe(0);
    expect(p.wb.records("basketball").get(10)?.points).toBe(8);
  });
  it("converges concurrent resets and concurrent player records", () => {
    const p = pair();
    p.wa.reset("disc-golf");
    p.wb.reset("disc-golf");
    p.exchange();
    expect(p.wa.epoch("disc-golf")).toBe(p.wb.epoch("disc-golf"));
    p.wa.setRecord("disc-golf", 10, { strokes: 2 });
    p.wb.setRecord("disc-golf", 20, { strokes: 3 });
    p.exchange();
    expect(p.wa.records("disc-golf").size).toBe(2);
    expect(p.wa.records("disc-golf")).toEqual(p.wb.records("disc-golf"));
  });
});
