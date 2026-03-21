import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { IGameSync, PlayerState, ChatMessage } from './IGameSync';
import { YjsWebRtcAdapter } from './YjsWebRtcAdapter';
import { audioManager } from '../audio/AudioManager';

interface SyncContextType {
  sync: IGameSync | null;
  getPlayers: () => Map<number, PlayerState>;
  chatMessages: ChatMessage[];
  connectedPeers: { id: number, name: string }[];
  audioBlocked: boolean;
  myId: number;
  myName: string;
}

const SyncContext = createContext<SyncContextType>({
  sync: null,
  getPlayers: () => new Map(),
  chatMessages: [],
  connectedPeers: [],
  audioBlocked: false,
  myId: 0,
  myName: 'Connecting...'
});

// eslint-disable-next-line react-refresh/only-export-components
export const useGameSync = () => useContext(SyncContext);

export function GameSyncProvider({ children, roomName }: { children: React.ReactNode, roomName: string }) {
  // useMemo guarantees a single synchronous instantiation without breaking render or state mutation rules
  const sync = React.useMemo(() => new YjsWebRtcAdapter(), []);
  const playersRef = useRef<Map<number, PlayerState>>(new Map());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<{ id: number, name: string }[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const adapter = sync;

    const updatePeersList = () => {
      const peers = Array.from(playersRef.current.entries()).map(([id, state]) => ({
        id,
        name: state.name || `Player ${id}`
      }));
      setConnectedPeers(peers);
    };

    adapter.onPlayerJoin = (id: number, state: PlayerState) => {
      playersRef.current.set(id, state);
      updatePeersList();
    };

    adapter.onPlayerLeave = (id: number) => {
      playersRef.current.delete(id);
      updatePeersList();
      audioManager.removeRemoteStream(id);
    };

    // Fast-path for 3D updates without React re-renders
    adapter.onPlayerMove = (id: number, position: [number, number, number], rotation: [number, number, number]) => {
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

    const unsubChat = adapter.subscribeToChat(setChatMessages);

    let isCancelled = false;

    // Init audio and connect
    const startConnection = async () => {
      try {
        const localStream = await audioManager.getLocalStream();
        if (isCancelled) {
           // Release constraints if cancelled
           localStream.getTracks().forEach(t => t.stop());
           return;
        }
        adapter.connect(roomName, localStream).catch(console.error);
      } catch {
        console.warn("Audio Context or Mic access blocked. Connecting without mic.");
        if (isCancelled) return;
        setAudioBlocked(true);
        adapter.connect(roomName).catch(console.error);
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

  return (
    <SyncContext.Provider value={{ 
      sync, 
      getPlayers, 
      chatMessages, 
      connectedPeers, 
      audioBlocked,
      myId: sync.myId,
      myName: sync.myName
    }}>
      {children}
    </SyncContext.Provider>
  );
}
