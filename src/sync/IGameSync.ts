export interface PlayerState {
  position?: [number, number, number];
  rotation?: [number, number, number];
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  senderId: number;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface IGameSync {
  connect(roomName: string, localStream?: MediaStream): Promise<void>;
  disconnect(): void;
  
  get myId(): number;
  get myName(): string;

  onPlayerJoin: (clientId: number, state: PlayerState) => void;
  onPlayerLeave: (clientId: number) => void;
  onPlayerMove: (clientId: number, position: [number, number, number], rotation: [number, number, number]) => void;
  
  onPlayerStream: (clientId: number, stream: MediaStream) => void;
  onPlayerStreamRemove: (clientId: number) => void;
  
  sendChatMessage(msg: string): void;
  subscribeToChat(callback: (messages: ChatMessage[]) => void): () => void;
  updateMyPresence(state: PlayerState): void;
}
