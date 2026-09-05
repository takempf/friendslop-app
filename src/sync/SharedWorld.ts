import * as Y from "yjs";
import {
  compareSnapshots,
  validSnapshot,
  type OwnedSnapshot,
} from "@/gameplay/replication";

import type { ISharedWorld, SessionRecord } from "./ISharedWorld";

/** Durable checkpoints and game-scoped records. Awareness carries live motion;
 * this document carries sleeping objects, late-join state and scorecards. */
export class SharedWorld implements ISharedWorld {
  private checkpoints: Y.Map<OwnedSnapshot>;
  private sessions: Y.Map<SessionRecord>;
  private epochs: Y.Map<string>;
  constructor(privateDoc: Y.Doc) {
    this.checkpoints = privateDoc.getMap("world:checkpoints:v2");
    this.sessions = privateDoc.getMap("world:sessions:v2");
    this.epochs = privateDoc.getMap("world:epochs:v2");
  }
  checkpoint(id: number, snapshot: OwnedSnapshot): void {
    if (!validSnapshot(snapshot)) return;
    // Separate writer keys avoid Y.Map last-writer conflicts between owners.
    this.checkpoints.set(`${id}:${snapshot.ownerId}`, snapshot);
  }
  getEntities(): Map<number, OwnedSnapshot> {
    const entities = new Map<number, OwnedSnapshot>();
    this.checkpoints.forEach((snapshot, key) => {
      if (!validSnapshot(snapshot)) return;
      const id = Number(key.split(":")[0]);
      const old = entities.get(id);
      if (!old || compareSnapshots(snapshot, old) > 0)
        entities.set(id, snapshot);
    });
    return entities;
  }
  subscribeEntities(callback: () => void): () => void {
    this.checkpoints.observe(callback);
    return () => this.checkpoints.unobserve(callback);
  }
  epoch(scope: string): string {
    return this.epochs.get(scope) ?? "initial";
  }
  reset(scope: string): void {
    this.epochs.set(scope, crypto.randomUUID());
  }
  setRecord(scope: string, player: number, record: SessionRecord): void {
    this.sessions.set(`${scope}:${this.epoch(scope)}:${player}`, record);
  }
  records<T extends SessionRecord>(scope: string): Map<number, T> {
    const prefix = `${scope}:${this.epoch(scope)}:`;
    const result = new Map<number, T>();
    this.sessions.forEach((record, key) => {
      if (key.startsWith(prefix))
        result.set(Number(key.slice(prefix.length)), record as T);
    });
    return result;
  }
  subscribe(callback: () => void): () => void {
    this.sessions.observe(callback);
    this.epochs.observe(callback);
    return () => {
      this.sessions.unobserve(callback);
      this.epochs.unobserve(callback);
    };
  }
}
