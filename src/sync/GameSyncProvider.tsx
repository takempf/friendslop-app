import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import type {
  IGameSync,
  PlayerState,
  ChatMessage,
  RemoteBallState,
  SoundEvent,
} from "./IGameSync";
import { YjsWebRtcAdapter } from "./YjsWebRtcAdapter";
import { audioManager } from "../audio/AudioManager";

interface ConnectedPeer {
  id: number;
  name: string;
  colorIndex: number;
  emojiIndex: number;
}

interface SyncContextType {
  sync: IGameSync | null;
  getPlayers: () => Map<number, PlayerState>;
  chatMessages: ChatMessage[];
  connectedPeers: ConnectedPeer[];
  audioBlocked: boolean;
  myId: number;
  myName: string;
  myColorIndex: number;
  myEmojiIndex: number;
  remoteBallStates: React.RefObject<
    Map<number, RemoteBallState & { ownerId: number }>
  >;
  pendingPresenceRef: React.RefObject<Partial<PlayerState>>;
  queuePresenceUpdate: (patch: Partial<PlayerState>) => void;
  broadcastReset: () => void;
  subscribeToReset: (cb: () => void) => () => void;
  broadcastSoundEvent: (event: SoundEvent) => void;
  scores: Map<number, number>;
  broadcastScore: (clientId: number, points: number) => void;
}

const SyncContext = createContext<SyncContextType>({
  sync: null,
  getPlayers: () => new Map(),
  chatMessages: [],
  connectedPeers: [],
  audioBlocked: false,
  myId: 0,
  myName: "Connecting...",
  myColorIndex: 0,
  myEmojiIndex: 0,
  remoteBallStates: { current: new Map() },
  pendingPresenceRef: { current: {} },
  queuePresenceUpdate: () => {},
  broadcastReset: () => {},
  subscribeToReset: () => () => {},
  broadcastSoundEvent: () => {},
  scores: new Map(),
  broadcastScore: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useGameSync = () => useContext(SyncContext);

export function GameSyncProvider({
  children,
  roomName,
}: {
  children: React.ReactNode;
  roomName: string;
}) {
  // useMemo guarantees a single synchronous instantiation without breaking render or state mutation rules
  const sync = React.useMemo(() => new YjsWebRtcAdapter(), []);
  const playersRef = useRef<Map<number, PlayerState>>(new Map());
  const remoteBallStates = useRef<
    Map<number, RemoteBallState & { ownerId: number }>
  >(new Map());
  const pendingPresenceRef = useRef<Partial<PlayerState>>({});
  const queuePresenceUpdate = React.useCallback(
    (patch: Partial<PlayerState>) => {
      pendingPresenceRef.current = { ...pendingPresenceRef.current, ...patch };
    },
    [],
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<ConnectedPeer[]>([]);
  const [scores, setScores] = useState<Map<number, number>>(new Map());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [myColorIndex, setMyColorIndex] = useState(0);
  const [myEmojiIndex, setMyEmojiIndex] = useState(0);

  useEffect(() => {
    const adapter = sync;

    const updatePeersList = () => {
      const peers = Array.from(playersRef.current.entries()).map(
        ([id, state]) => ({
          id,
          name: state.name || `Player ${id}`,
          colorIndex: state.colorIndex ?? 0,
          emojiIndex: state.emojiIndex ?? 0,
        }),
      );
      setConnectedPeers(peers);
    };

    // eslint-disable-next-line react-hooks/immutability
    adapter.onPlayerJoin = (id: number, state: PlayerState) => {
      playersRef.current.set(id, state);
      updatePeersList();
    };

    adapter.onPlayerLeave = (id: number) => {
      playersRef.current.delete(id);
      updatePeersList();
      audioManager.removeRemoteStream(id);
      for (const [ballId, state] of remoteBallStates.current.entries()) {
        if (state.ownerId === id) remoteBallStates.current.delete(ballId);
      }
    };

    adapter.onPlayerUpdate = (id: number, state: PlayerState) => {
      const existing = playersRef.current.get(id);
      if (existing) {
        existing.colorIndex = state.colorIndex;
        existing.emojiIndex = state.emojiIndex;
      }
      updatePeersList();
    };

    adapter.onBallStatesReceived = (ownerId, states) => {
      for (const [ballId, state] of Object.entries(states)) {
        remoteBallStates.current.set(Number(ballId), { ...state, ownerId });
      }
    };

    // Fast-path for 3D updates without React re-renders
    adapter.onPlayerMove = (
      id: number,
      position: [number, number, number],
      rotation: [number, number, number],
    ) => {
      const p = playersRef.current.get(id);
      if (p) {
        p.position = position;
        p.rotation = rotation;
      }
    };

    adapter.onPlayerStream = (id: number, stream: MediaStream) => {
      audioManager.addRemoteStream(id, stream);
    };

    adapter.onPlayerStreamRemove = (id: number) => {
      audioManager.removeRemoteStream(id);
    };

    adapter.onResetScores = () => {
      resetListeners.current.forEach((cb) => cb());
    };

    adapter.onScoreUpdated = (newScores) => {
      setScores(new Map(newScores));
    };

    adapter.onSoundEvent = ({ pos, surface, speed }) => {
      audioManager.playBounceSound(pos, surface, speed);
    };

    const unsubChat = adapter.subscribeToChat(setChatMessages);

    let isCancelled = false;

    // Init audio and connect
    const startConnection = async () => {
      try {
        const localStream = await audioManager.getLocalStream();
        if (isCancelled) {
          // Release constraints if cancelled
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        adapter
          .connect(roomName, localStream)
          .then(() => {
            // Poll until appearance is assigned (happens ~150ms after connect)
            const poll = setInterval(() => {
              if (adapter.myColorAssigned) {
                setMyColorIndex(adapter.myColorIndex);
                setMyEmojiIndex(adapter.myEmojiIndex);
                clearInterval(poll);
              }
            }, 60);
            setTimeout(() => clearInterval(poll), 3000);
          })
          .catch(console.error);
      } catch {
        console.warn(
          "Audio Context or Mic access blocked. Connecting without mic.",
        );
        if (isCancelled) return;
        setAudioBlocked(true);
        adapter
          .connect(roomName)
          .then(() => {
            const poll = setInterval(() => {
              if (adapter.myColorAssigned) {
                setMyColorIndex(adapter.myColorIndex);
                setMyEmojiIndex(adapter.myEmojiIndex);
                clearInterval(poll);
              }
            }, 60);
            setTimeout(() => clearInterval(poll), 3000);
          })
          .catch(console.error);
      }
    };

    startConnection();

    return () => {
      isCancelled = true;
      unsubChat();
      adapter.disconnect();
    };
  }, [roomName, sync]);

  // stabilize the callback so it isn't recreated every render
  const getPlayers = React.useCallback(() => playersRef.current, []);

  const resetListeners = useRef<Set<() => void>>(new Set());

  const subscribeToReset = React.useCallback((cb: () => void) => {
    resetListeners.current.add(cb);
    return () => {
      resetListeners.current.delete(cb);
    };
  }, []);

  const broadcastReset = React.useCallback(() => sync.broadcastReset(), [sync]);
  const broadcastScore = React.useCallback(
    (clientId: number, points: number) => sync.broadcastScore(clientId, points),
    [sync],
  );
  const broadcastSoundEvent = React.useCallback(
    (event: SoundEvent) => sync.broadcastSoundEvent(event),
    [sync],
  );

  return (
    <SyncContext.Provider
      value={{
        sync,
        getPlayers,
        chatMessages,
        connectedPeers,
        audioBlocked,
        myId: sync.myId,
        myName: sync.myName,
        myColorIndex,
        myEmojiIndex,
        remoteBallStates,
        pendingPresenceRef,
        queuePresenceUpdate,
        broadcastReset,
        subscribeToReset,
        broadcastSoundEvent,
        scores,
        broadcastScore,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
