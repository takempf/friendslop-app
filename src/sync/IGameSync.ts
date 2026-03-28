export interface PlayerState {
  position?: [number, number, number];
  rotation?: [number, number, number];
  name?: string;
  colorIndex?: number;
  emojiIndex?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
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

export interface RemoteBallState {
  pos: [number, number, number];
  rot: [number, number, number, number];
  vel: [number, number, number];
  angvel: [number, number, number];
  held?: boolean;
  ownerVersion?: number;
}

export interface SoundEvent {
  /** Unique ID to distinguish consecutive events (e.g. two bounces in the same spot) */
  id: number;
  pos: [number, number, number];
  surface: "floor" | "wall" | "backboard" | "rim";
  speed: number;
}

export interface IGameSync {
  connect(roomName: string, localStream?: MediaStream): Promise<void>;
  disconnect(): void;

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
  onBallStatesReceived: (
    ownerId: number,
    states: Record<number, RemoteBallState>,
  ) => void;

  onPlayerStream: (clientId: number, stream: MediaStream) => void;
  onPlayerStreamRemove: (clientId: number) => void;

  sendChatMessage(msg: string): void;
  subscribeToChat(callback: (messages: ChatMessage[]) => void): () => void;
  updateMyPresence(state: PlayerState): void;

  broadcastReset(): void;
  onResetScores: () => void;

  broadcastScore(clientId: number): void;
  onScoreUpdated: (scores: Map<number, number>) => void;

  broadcastSoundEvent(event: SoundEvent): void;
  onSoundEvent: (event: SoundEvent) => void;
}
