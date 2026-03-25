import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import type {
  IGameSync,
  PlayerState,
  ChatMessage,
  RemoteBallState,
} from "./IGameSync";
import { COLOR_POOL, EMOJI_POOL } from "../utils/colors";

export class YjsWebRtcAdapter implements IGameSync {
  private doc: Y.Doc;
  private provider: WebrtcProvider | null = null;
  private chatArray: Y.Array<ChatMessage>;

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

  constructor() {
    this.doc = new Y.Doc();
    this.chatArray = this.doc.getArray<ChatMessage>("chat");

    this.chatArray.observe(() => {
      const messages = this.chatArray.toArray();
      this.chatListeners.forEach((cb) => cb(messages));
    });
  }

  public onBallStatesReceived: (
    ownerId: number,
    states: Record<number, RemoteBallState>,
  ) => void = () => {};

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

    // Set initial presence data, waiting slightly for provider context
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const room = (this.provider as any)?.room;
      const peerId = room?.peerId;

      // Pick unique color and emoji indices from current awareness states
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

      let colorIdx = 0;
      while (usedColors.has(colorIdx) && colorIdx < COLOR_POOL.length)
        colorIdx++;
      let emojiIdx = 0;
      while (usedEmojis.has(emojiIdx) && emojiIdx < EMOJI_POOL.length)
        emojiIdx++;

      this._colorIndex = colorIdx % COLOR_POOL.length;
      this._emojiIndex = emojiIdx % EMOJI_POOL.length;

      awareness.setLocalStateField("playerState", {
        name: this.name,
        webrtcId: peerId,
        colorIndex: this._colorIndex,
        emojiIndex: this._emojiIndex,
      });
    }, 50);

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
    if (!this.provider) return;

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
