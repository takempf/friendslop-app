import type { Party, PartyServer, PartyConnection } from "partykit/server";

export default class YWebrtcSignalingServer implements PartyServer {
  topics = new Map<string, Set<PartyConnection>>();
  subscribedTopics = new WeakMap<PartyConnection, Set<string>>();

  constructor(readonly party: Party) {}

  onConnect(conn: PartyConnection) {
    this.subscribedTopics.set(conn, new Set());
  }

  onClose(conn: PartyConnection) {
    const topics = this.subscribedTopics.get(conn);
    if (topics) {
      topics.forEach((topicName) => {
        const subs = this.topics.get(topicName);
        if (subs) {
          subs.delete(conn);
          if (subs.size === 0) {
            this.topics.delete(topicName);
          }
        }
      });
    }
    this.subscribedTopics.delete(conn);
  }

  onMessage(message: string | ArrayBuffer, conn: PartyConnection) {
    let parsed:
      | { type?: string; topics?: string[]; topic?: string; clients?: number }
      | undefined;
    try {
      if (typeof message === "string") {
        parsed = JSON.parse(message);
      } else {
        parsed = JSON.parse(new TextDecoder().decode(message));
      }
    } catch {
      return; // Invalid JSON
    }

    if (parsed && parsed.type) {
      switch (parsed.type) {
        case "subscribe":
          (parsed.topics || []).forEach((topicName: string) => {
            if (typeof topicName === "string") {
              const topic = this.topics.get(topicName) || new Set();
              topic.add(conn);
              this.topics.set(topicName, topic);

              const subs = this.subscribedTopics.get(conn) || new Set();
              subs.add(topicName);
              this.subscribedTopics.set(conn, subs);
            }
          });
          break;
        case "unsubscribe":
          (parsed.topics || []).forEach((topicName: string) => {
            const subs = this.topics.get(topicName);
            if (subs) {
              subs.delete(conn);
            }
          });
          break;
        case "publish":
          if (parsed.topic) {
            const receivers = this.topics.get(parsed.topic);
            if (receivers) {
              parsed.clients = receivers.size;
              const msgStr = JSON.stringify(parsed);
              receivers.forEach((receiver) => {
                receiver.send(msgStr);
              });
            }
          }
          break;
        case "ping":
          conn.send(JSON.stringify({ type: "pong" }));
          break;
      }
    }
  }
}
