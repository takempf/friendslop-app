import { compareSnapshots, validSnapshot } from "@/gameplay/replication";
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
  EntitySnapshot,
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
  remoteEntityStates: React.RefObject<
    Map<number, EntitySnapshot & { ownerId: number }>
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
  remoteEntityStates: { current: new Map() },
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
  const remoteEntityStates = useRef<
    Map<number, EntitySnapshot & { ownerId: number }>
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

  // The sync adapter is an imperative object whose callback slots are wired up
  // here; the rule reads that as mutating a value captured during render.
  // eslint-disable-next-line react-hooks/immutability
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
      // Keep checkpoints after disconnect; the elected peer recovers orphaned bodies.
    };

    adapter.onPlayerUpdate = (id: number, state: PlayerState) => {
      const existing = playersRef.current.get(id);
      if (existing) {
        existing.colorIndex = state.colorIndex;
        existing.emojiIndex = state.emojiIndex;
      }
      updatePeersList();
    };

    adapter.onEntityStatesReceived = (ownerId, states) => {
      for (const [ballId, state] of Object.entries(states)) {
        if (!validSnapshot(state)) continue;
        const incoming = { ...state, ownerId };
        const existing = remoteEntityStates.current.get(Number(ballId));
        if (!existing || compareSnapshots(incoming, existing) > 0) {
          remoteEntityStates.current.set(Number(ballId), incoming);
        }
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

    const loadCheckpoints = () => {
      adapter.world.getEntities().forEach((state, id) => {
        if (state.ownerId === adapter.myId) return;
        const old = remoteEntityStates.current.get(id);
        if (!old || compareSnapshots(state, old) > 0)
          remoteEntityStates.current.set(id, state);
      });
    };
    const unsubEntities = adapter.world.subscribeEntities(loadCheckpoints);
    loadCheckpoints();

    const unsubChat = adapter.subscribeToChat(setChatMessages);

    let isCancelled = false;

    // Connect immediately so player presence, movement, and 3D spawning happen right away
    adapter
      .connect(roomName)
      .then(() => {
        if (isCancelled) return;
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

    // Acquire microphone asynchronously without blocking player spawn or networking
    audioManager
      .getLocalStream()
      .then((localStream) => {
        if (isCancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setAudioBlocked(false);
        adapter.setLocalStream?.(localStream);
      })
      .catch(() => {
        if (isCancelled) return;
        console.warn(
          "Audio Context or Mic access blocked. Continuing without mic.",
        );
        setAudioBlocked(true);
      });

    return () => {
      isCancelled = true;
      unsubChat();
      unsubEntities();
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
        remoteEntityStates,
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
