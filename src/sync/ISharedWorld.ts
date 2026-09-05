import type { OwnedSnapshot } from "@/gameplay/replication";

export type SessionRecord = { [key: string]: unknown };
/** Transport-independent durable state contract for game modules. */
export interface ISharedWorld {
  checkpoint(id: number, snapshot: OwnedSnapshot): void;
  getEntities(): Map<number, OwnedSnapshot>;
  subscribeEntities(callback: () => void): () => void;
  epoch(scope: string): string;
  reset(scope: string): void;
  setRecord(scope: string, player: number, record: SessionRecord): void;
  records<T extends SessionRecord>(scope: string): Map<number, T>;
  subscribe(callback: () => void): () => void;
}
