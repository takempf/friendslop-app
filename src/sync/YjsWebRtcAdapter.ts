import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import type {
  IGameSync,
  PlayerState,
  ChatMessage,
  RemoteBallState,
  SoundEvent,
} from "./IGameSync";
import { COLOR_POOL, EMOJI_POOL } from "../utils/colors";

export class YjsWebRtcAdapter implements IGameSync {
  private doc: Y.Doc;
  private provider: WebrtcProvider | null = null;
  private chatArray: Y.Array<ChatMessage>;
  private scoresMap: Y.Map<number>;

  public onPlayerJoin: (clientId: number, state: PlayerState) => void =
    () => {};
  public onPlayerLeave: (clientId: number) => void = () => {};
  public onPlayerUpdate: (clientId: number, state: PlayerState) => void =
    () => {};
  public onPlayerMove: (
    clientId: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void = () => {};

  private chatListeners: Set<(messages: ChatMessage[]) => void> = new Set();

  // Track known players to detect joins and leaves reliably
  private knownPlayers: Set<number> = new Set();
  // Track last-seen appearance per player to detect changes
  private knownAppearances = new Map<
    number,
    { colorIndex?: number; emojiIndex?: number }
  >();
  private name: string = "Player_" + Math.floor(Math.random() * 1000);

  private _colorIndex: number = 0;
  private _emojiIndex: number = 0;
  private _colorAssigned: boolean = false;

  constructor() {
    this.doc = new Y.Doc();
    this.chatArray = this.doc.getArray<ChatMessage>("chat");
    this.scoresMap = this.doc.getMap<number>("scores");

    this.chatArray.observe(() => {
      const messages = this.chatArray.toArray();
      this.chatListeners.forEach((cb) => cb(messages));
    });

    this.doc.getArray<number>("resets").observe(() => {
      this.onResetScores();
    });

    this.scoresMap.observe(() => {
      const scores = new Map<number, number>();
      this.scoresMap.forEach((value: number, key: string) => {
        scores.set(Number(key), value);
      });
      this.onScoreUpdated(scores);
    });
  }

  public onBallStatesReceived: (
    ownerId: number,
    states: Record<number, RemoteBallState>,
  ) => void = () => {};

  public onResetScores: () => void = () => {};

  public onScoreUpdated: (scores: Map<number, number>) => void = () => {};

  public broadcastScore(colorIndex: number): void {
    const key = String(colorIndex);
    this.scoresMap.set(key, (this.scoresMap.get(key) ?? 0) + 1);
  }

  public onSoundEvent: (event: SoundEvent) => void = () => {};
  // Last seen sound event ID per remote peer, to deduplicate repeated awareness updates
  private knownSoundEventIds = new Map<number, number>();

  public broadcastSoundEvent(event: SoundEvent): void {
    if (!this.provider) return;
    this.provider.awareness.setLocalStateField("soundEvent", event);
  }

  public broadcastReset(): void {
    this.doc.transact(() => {
      this.doc.getArray<number>("resets").push([Date.now()]);
      this.scoresMap.clear();
    });
  }

  public onPlayerStream: (clientId: number, stream: MediaStream) => void =
    () => {};
  public onPlayerStreamRemove: (clientId: number) => void = () => {};

  public get myId(): number {
    return this.doc.clientID;
  }

  public get myName(): string {
    return this.name;
  }

  public get myColorIndex(): number {
    return this._colorIndex;
  }

  public get myColorAssigned(): boolean {
    return this._colorAssigned;
  }

  public get myEmojiIndex(): number {
    return this._emojiIndex;
  }

  public async connect(
    roomName: string,
    localStream?: MediaStream,
  ): Promise<void> {
    if (this.provider) return;
    const partykitHost = import.meta.env.VITE_PARTYKIT_HOST;
    const signalingServerUrl =
      import.meta.env.DEV || !partykitHost
        ? `wss://${window.location.host}/party/y-webrtc-signaling`
        : `wss://${partykitHost}/party/y-webrtc-signaling`;

    this.provider = new WebrtcProvider(roomName, this.doc, {
      signaling: [signalingServerUrl],
      peerOpts: localStream ? { stream: localStream } : {},
    });

    // Listen for new peers to capture their audio stream
    // y-webrtc creates simple-peer instances async, so we poll briefly.
    this.provider.on(
      "peers",
      (change: { added: string[]; removed: string[] }) => {
        change.added.forEach((webrtcId) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const room = (this.provider as any).room;
          const conn = room?.webrtcConns?.get(webrtcId);

          if (conn) {
            if (conn.peer) {
              this.attachPeerEvents(webrtcId, conn.peer);
            } else {
              // y-webrtc delays peer creation. Intercept definition
              let _peer = conn.peer;
              Object.defineProperty(conn, "peer", {
                get: () => _peer,
                set: (newPeer) => {
                  _peer = newPeer;
                  if (_peer) {
                    this.attachPeerEvents(webrtcId, _peer);
                  }
                },
              });
            }
          }
        });

        change.removed.forEach((webrtcId) => {
          const clientId = this.webrtcToClientId.get(webrtcId);
          if (clientId !== undefined) {
            this.onPlayerStreamRemove(clientId);
          }
        });
      },
    );

    const awareness = this.provider.awareness;

    // Helper: collect used color/emoji indices from other peers
    const getUsedIndices = () => {
      const states = awareness.getStates();
      const usedColors = new Set<number>();
      const usedEmojis = new Set<number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      states.forEach((state: any, clientId: number) => {
        if (clientId === this.doc.clientID) return;
        const ps = state?.playerState as PlayerState | undefined;
        if (ps?.colorIndex !== undefined) usedColors.add(ps.colorIndex);
        if (ps?.emojiIndex !== undefined) usedEmojis.add(ps.emojiIndex);
      });
      return { usedColors, usedEmojis };
    };

    // Helper: pick a random index from a pool that isn't in the used set
    const pickRandomUnused = (poolSize: number, used: Set<number>): number => {
      const available = [];
      for (let i = 0; i < poolSize; i++) {
        if (!used.has(i)) available.push(i);
      }
      if (available.length === 0) {
        // All taken – pick a truly random one
        return Math.floor(Math.random() * poolSize);
      }
      return available[Math.floor(Math.random() * available.length)];
    };

    // Helper: assign unique color/emoji and broadcast via awareness
    const assignAppearance = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const room = (this.provider as any)?.room;
      const peerId = room?.peerId;

      const { usedColors, usedEmojis } = getUsedIndices();
      this._colorIndex = pickRandomUnused(COLOR_POOL.length, usedColors);
      this._emojiIndex = pickRandomUnused(EMOJI_POOL.length, usedEmojis);
      this._colorAssigned = true;

      awareness.setLocalStateField("playerState", {
        name: this.name,
        webrtcId: peerId,
        colorIndex: this._colorIndex,
        emojiIndex: this._emojiIndex,
      });
    };

    // Set initial presence after a short delay for awareness to sync
    setTimeout(() => {
      assignAppearance();

      // Re-check once more after additional peers may have synced
      setTimeout(() => {
        const { usedColors, usedEmojis } = getUsedIndices();
        // If our indices conflict with another peer, re-assign
        if (
          usedColors.has(this._colorIndex) ||
          usedEmojis.has(this._emojiIndex)
        ) {
          assignAppearance();
        }
      }, 300);
    }, 150);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    awareness.on("change", (changes: any) => {
      const states = awareness.getStates();

      // Handle joins and updates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      states.forEach((state: any, clientId: number) => {
        if (clientId === this.doc.clientID) return; // Ignore self

        const playerState = state?.playerState as PlayerState;
        if (!playerState) return;

        if (!this.knownPlayers.has(clientId)) {
          this.knownPlayers.add(clientId);
          this.knownAppearances.set(clientId, {
            colorIndex: playerState.colorIndex,
            emojiIndex: playerState.emojiIndex,
          });

          if (playerState.webrtcId) {
            this.webrtcToClientId.set(playerState.webrtcId, clientId);
            const bufferedStream = this.bufferedStreams.get(
              playerState.webrtcId,
            );
            if (bufferedStream) {
              this.onPlayerStream(clientId, bufferedStream);
              this.bufferedStreams.delete(playerState.webrtcId);
            }
          }
          this.onPlayerJoin(clientId, playerState);
        } else {
          if (
            playerState.webrtcId &&
            !this.webrtcToClientId.has(playerState.webrtcId)
          ) {
            // Catch up mapping if missed
            this.webrtcToClientId.set(playerState.webrtcId, clientId);
            const bufferedStream = this.bufferedStreams.get(
              playerState.webrtcId,
            );
            if (bufferedStream) {
              this.onPlayerStream(clientId, bufferedStream);
              this.bufferedStreams.delete(playerState.webrtcId);
            }
          }

          // Detect appearance changes and notify
          const known = this.knownAppearances.get(clientId);
          if (
            known?.colorIndex !== playerState.colorIndex ||
            known?.emojiIndex !== playerState.emojiIndex
          ) {
            this.knownAppearances.set(clientId, {
              colorIndex: playerState.colorIndex,
              emojiIndex: playerState.emojiIndex,
            });
            this.onPlayerUpdate(clientId, playerState);
          }
        }

        if (playerState.position && playerState.rotation) {
          this.onPlayerMove(
            clientId,
            playerState.position,
            playerState.rotation,
          );
        }

        if (playerState.ballStates) {
          this.onBallStatesReceived(clientId, playerState.ballStates);
        }

        const soundEvent = state?.soundEvent as SoundEvent | undefined;
        if (soundEvent) {
          const lastId = this.knownSoundEventIds.get(clientId);
          if (soundEvent.id !== lastId) {
            this.knownSoundEventIds.set(clientId, soundEvent.id);
            this.onSoundEvent(soundEvent);
          }
        }
      });

      // Handle leaves
      changes.removed.forEach((clientId: number) => {
        if (this.knownPlayers.has(clientId)) {
          this.knownPlayers.delete(clientId);
          this.knownAppearances.delete(clientId);
          this.onPlayerLeave(clientId);

          for (const [
            webrtcId,
            mappedClientId,
          ] of this.webrtcToClientId.entries()) {
            if (mappedClientId === clientId) {
              this.webrtcToClientId.delete(webrtcId);
              this.bufferedStreams.delete(webrtcId);
              break;
            }
          }
        }
      });
    });
  }

  private webrtcToClientId = new Map<string, number>();
  private bufferedStreams = new Map<string, MediaStream>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private attachPeerEvents(webrtcId: string, peer: any) {
    if (peer._eventsAttached) return;
    peer._eventsAttached = true;
    console.log(`[WebRTC] Attaching events to peer ${webrtcId}`);

    const handleStream = (stream: MediaStream) => {
      const clientId = this.webrtcToClientId.get(webrtcId);
      if (clientId !== undefined) {
        this.onPlayerStream(clientId, stream);
      } else {
        console.log(
          `[WebRTC] Buffering stream. Mapping for ${webrtcId} not yet known.`,
        );
        this.bufferedStreams.set(webrtcId, stream);
      }
    };

    if (peer.streams && peer.streams.length > 0) {
      console.log(`[WebRTC] Peer ${webrtcId} already has stream!`);
      handleStream(peer.streams[0]);
    }

    peer.on("stream", (stream: MediaStream) => {
      console.log(
        `[WebRTC] Peer ${webrtcId} emitted stream event!`,
        stream.getTracks(),
      );
      handleStream(stream);
    });

    peer.on("track", (track: MediaStreamTrack, stream: MediaStream) => {
      console.log(`[WebRTC] Peer ${webrtcId} emitted track event!`, track.kind);
      handleStream(stream);
    });
  }

  public disconnect(): void {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
  }

  public sendChatMessage(msg: string): void {
    if (!msg.trim()) return;

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      senderId: this.doc.clientID,
      senderName: this.name,
      senderColorIndex: this._colorIndex,
      senderEmojiIndex: this._emojiIndex,
      text: msg,
      timestamp: Date.now(),
    };

    this.chatArray.push([message]);
  }

  public subscribeToChat(
    callback: (messages: ChatMessage[]) => void,
  ): () => void {
    this.chatListeners.add(callback);
    // Give initial state
    callback(this.chatArray.toArray());

    return () => {
      this.chatListeners.delete(callback);
    };
  }

  public updateMyPresence(state: PlayerState): void {
    if (!this.provider || !this._colorAssigned) return;

    const awareness = this.provider.awareness;
    const currentState = awareness.getLocalState()?.playerState || {};

    awareness.setLocalStateField("playerState", {
      ...currentState,
      ...state,
      name: this.name, // ensure name is preserved
      colorIndex: this._colorIndex,
      emojiIndex: this._emojiIndex,
    });
  }

  // Expose WebRTC peers map directly since we need Web Audio tracking later.
  // The simple-peer instances are stored in provider.webrtcConns.
  // Map<clientId, WebrtcConn>
  public getWebRtcPeers() {
    if (!this.provider) return new Map();
    // @ts-expect-error - access internal connection map for media streams
    return this.provider.webrtcConns;
  }
}
