import type { ISharedWorld } from "./ISharedWorld";
export interface PlayerState {
  position?: [number, number, number];
  rotation?: [number, number, number];
  name?: string;
  colorIndex?: number;
  emojiIndex?: number;
  webrtcId?: string;
  entityStates?: Record<number, EntitySnapshot>;
}

export interface ChatMessage {
  id: string;
  senderId: number;
  senderName: string;
  senderColorIndex: number;
  senderEmojiIndex: number;
  text: string;
  timestamp: number;
}

export interface EntitySnapshot {
  pos: [number, number, number];
  rot: [number, number, number, number];
  vel: [number, number, number];
  angvel: [number, number, number];
  held?: boolean;
  sequence?: number;
  /** Opaque game-owned state travels with the entity across ownership changes. */
  gameData?: Record<string, unknown>;
  ownerVersion?: number;
}

export interface SoundEvent {
  /** Unique ID to distinguish consecutive events (e.g. two bounces in the same spot) */
  id: number;
  pos: [number, number, number];
  surface: "floor" | "wall" | "backboard" | "rim" | "window";
  speed: number;
}

export interface IGameSync {
  readonly world: ISharedWorld;
  connect(roomName: string, localStream?: MediaStream): Promise<void>;
  disconnect(): void;
  setLocalStream?(stream: MediaStream): void;

  get myId(): number;
  get myName(): string;
  get myColorIndex(): number;
  get myEmojiIndex(): number;

  onPlayerJoin: (clientId: number, state: PlayerState) => void;
  onPlayerLeave: (clientId: number) => void;
  onPlayerUpdate: (clientId: number, state: PlayerState) => void;
  onPlayerMove: (
    clientId: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
  onEntityStatesReceived: (
    ownerId: number,
    states: Record<number, EntitySnapshot>,
  ) => void;

  onPlayerStream: (clientId: number, stream: MediaStream) => void;
  onPlayerStreamRemove: (clientId: number) => void;

  sendChatMessage(msg: string): void;
  subscribeToChat(callback: (messages: ChatMessage[]) => void): () => void;
  updateMyPresence(state: PlayerState): void;

  broadcastReset(): void;
  onResetScores: () => void;

  broadcastScore(clientId: number, points: number): void;
  onScoreUpdated: (scores: Map<number, number>) => void;

  broadcastSoundEvent(event: SoundEvent): void;
  onSoundEvent: (event: SoundEvent) => void;
}
