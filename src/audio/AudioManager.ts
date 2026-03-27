// A simple mock Impulse Response generator for testing.
// In a real app, you would load a .wav file.
function createMockIR(ctx: AudioContext, duration: number, decay: number) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
    }
  }
  return impulse;
}

/**
 * Convert a linear slider value to a perceptual gain using a quadratic curve.
 * Each equal slider distance maps to roughly equal perceived loudness change.
 * @param sliderValue  0–100 for master, 0–200 for per-peer
 * @returns gain multiplier (0 at 0, 1.0 at 100, 4.0 at 200)
 */
function perceptualGain(sliderValue: number): number {
  return Math.pow(sliderValue / 100, 2);
}

export class AudioManager {
  private ctx: AudioContext | null = null;

  // Reverb nodes
  private convolverGym: ConvolverNode | null = null;
  private convolverRoom: ConvolverNode | null = null;

  // Gain nodes for crossfading reverb environments
  // Gains
  private gainGym: GainNode | null = null;
  private gainRoom: GainNode | null = null;
  private dryGain: GainNode | null = null;

  private analyserMic: AnalyserNode | null = null;
  private analyserOut: AnalyserNode | null = null;
  private micDataArray: Uint8Array | null = null;
  private outDataArray: Uint8Array | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private localStream: MediaStream | null = null;

  // Master output gain (controlled by global volume slider)
  private masterGain: GainNode | null = null;
  private _masterVolume: number = 100; // slider value 0–100
  private _masterMuted: boolean = false;
  private _micMuted: boolean = false;

  // Remote player audio graph: clientId -> nodes
  private remotePeers = new Map<
    number,
    {
      source: MediaStreamAudioSourceNode;
      panner: PannerNode;
      occlusionFilter: BiquadFilterNode; // Wall occlusion low-pass
      airFilter: BiquadFilterNode; // Distance-based air absorption low-pass
      reverbSend: GainNode; // Send to room convolver (wet path)
      gain: GainNode;
      analyser: AnalyserNode;
      dataArray: Uint8Array;
      audioEl: HTMLAudioElement; // Fix for Chrome bug 933677
      _volume: number; // slider value 0–200
      _muted: boolean;
    }
  >();

  // Last known listener position for distance calculations
  private _listenerPos: [number, number, number] = [0, 0, 0];

  public async init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      return;
    }
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.analyserOut = this.ctx.createAnalyser();
    this.analyserOut.fftSize = 256;
    this.outDataArray = new Uint8Array(this.analyserOut.frequencyBinCount);

    // Create convolvers for Reverb (Acoustics)
    this.convolverGym = this.ctx.createConvolver();
    this.convolverGym.buffer = createMockIR(this.ctx, 3.0, 2.0); // large space

    this.convolverRoom = this.ctx.createConvolver();
    this.convolverRoom.buffer = createMockIR(this.ctx, 1.0, 5.0); // small space

    // Master Gains for wet/dry
    this.gainGym = this.ctx.createGain();
    this.gainRoom = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();

    this.convolverGym.connect(this.gainGym);
    this.convolverRoom.connect(this.gainRoom);

    this.gainGym.connect(this.analyserOut);
    this.gainRoom.connect(this.analyserOut);
    this.dryGain.connect(this.analyserOut);

    // Master gain sits between analyserOut and destination
    this.masterGain = this.ctx.createGain();
    this.analyserOut.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Default to gym acoustics
    this.setRoom("gym");
  }

  public async getLocalStream(deviceId?: string): Promise<MediaStream> {
    // Requirements: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });

    this.localStream = stream;

    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      this.micSource = this.ctx.createMediaStreamSource(stream);

      // Manual "Automatic Gain Control" (AGC) circuit
      this.micGain = this.ctx.createGain();
      this.micGain.gain.value = 5.0; // Boost raw mic input by 5x (very helpful on quiet Macs)

      const compressor = this.ctx.createDynamicsCompressor();
      // Web Audio applies default compression (threshold: -24, ratio: 12) which acts cleanly as a limiter

      this.micSource.connect(this.micGain);
      this.micGain.connect(compressor);

      this.analyserMic = this.ctx.createAnalyser();
      this.analyserMic.fftSize = 256;
      this.micDataArray = new Uint8Array(this.analyserMic.frequencyBinCount);

      // Connect compressor to local analyser meter
      compressor.connect(this.analyserMic);

      // Connect compressor to WebRTC outgoing destination stream!
      const destination = this.ctx.createMediaStreamDestination();
      compressor.connect(destination);

      return destination.stream; // Return the processed, loud stream to GameSyncProvider!
    }

    return stream;
  }

  public async enumerateDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    // Attempting to ask for permission so device labels are not blank, if not already granted.
    try {
      if (!this.localStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop()); // close immediately, just unlocking permissions
      }
    } catch {
      // User blocked or no mic available
    }
    return await navigator.mediaDevices.enumerateDevices();
  }

  public async setInputDevice(deviceId: string) {
    if (!this.ctx || !this.micGain) return;

    // Stop old tracks (turns off old hardware recording light)
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }

    // Get new stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        deviceId: { exact: deviceId },
      },
    });
    this.localStream = stream;

    // Disconnect old source entirely
    if (this.micSource) {
      this.micSource.disconnect();
    }

    // Connect new source to the existing GainNode
    // This allows WebRTC peers to seamlessly hear the new mic without reconnecting!
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.micGain);
  }

  public async setOutputDevice(deviceId: string) {
    if (!this.ctx) return;

    // Route Spatial Audio context to chosen speaker (standard in modern browsers)
    // @ts-expect-error - setSinkId might not be correctly typed in standard DOM lib yet
    if (typeof this.ctx.setSinkId === "function") {
      // @ts-expect-error - setSinkId is relatively new and often missing from standard DOM types
      await this.ctx.setSinkId(deviceId);
    } else {
      console.warn(
        "AudioContext.setSinkId not supported in this browser. Output routing is unavailable.",
      );
    }
  }

  public getVolumes() {
    let mic = 0;
    let out = 0;

    if (this.analyserMic && this.micDataArray) {
      // @ts-expect-error TS library mismatch
      this.analyserMic.getByteTimeDomainData(this.micDataArray);
      let sum = 0;
      for (let i = 0; i < this.micDataArray.length; i++) {
        const v = (this.micDataArray[i] - 128) / 128;
        sum += v * v;
      }
      mic = Math.sqrt(sum / this.micDataArray.length);
    }

    if (this.analyserOut && this.outDataArray) {
      // @ts-expect-error TS library mismatch
      this.analyserOut.getByteTimeDomainData(this.outDataArray);
      let sum = 0;
      for (let i = 0; i < this.outDataArray.length; i++) {
        const v = (this.outDataArray[i] - 128) / 128;
        sum += v * v;
      }
      out = Math.sqrt(sum / this.outDataArray.length);
    }

    return { mic, out };
  }

  public playTestSound() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 440 + Math.random() * 200; // random beep
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.dryGain!); // Test sound output to dry gain directly

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  public getPeerCount(): number {
    return this.remotePeers.size;
  }

  public getPeerVolumes(): Record<number, number> {
    const volumes: Record<number, number> = {};
    for (const [clientId, peer] of this.remotePeers.entries()) {
      if (peer.analyser && peer.dataArray) {
        // @ts-expect-error TS library mismatch
        peer.analyser.getByteTimeDomainData(peer.dataArray);
        let sum = 0;
        for (let i = 0; i < peer.dataArray.length; i++) {
          const v = (peer.dataArray[i] - 128) / 128;
          sum += v * v;
        }
        volumes[clientId] = Math.sqrt(sum / peer.dataArray.length);
      } else {
        volumes[clientId] = 0;
      }
    }
    return volumes;
  }

  public setRoom(roomName: "gym" | "classroom") {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (roomName === "gym") {
      this.gainGym!.gain.setTargetAtTime(0.6, now, 0.5);
      this.gainRoom!.gain.setTargetAtTime(0, now, 0.5);
      this.dryGain!.gain.setTargetAtTime(0.6, now, 0.5);
    } else {
      this.gainGym!.gain.setTargetAtTime(0, now, 0.5);
      this.gainRoom!.gain.setTargetAtTime(0.4, now, 0.5);
      this.dryGain!.gain.setTargetAtTime(0.8, now, 0.5);
    }
  }

  public addRemoteStream(clientId: number, stream: MediaStream) {
    if (!this.ctx) return;

    // Prevent duplicated adds or self-loop
    if (this.remotePeers.has(clientId)) return;

    // Remove local audio tracks from the stream just in case (e.g. self)
    // Actually we shouldn't receive our own stream via WebRTC if configured correctly.

    const source = this.ctx.createMediaStreamSource(stream);

    // Air absorption: high-frequency rolloff increases with distance (updated in updateRemotePlayer)
    const airFilter = this.ctx.createBiquadFilter();
    airFilter.type = "lowpass";
    airFilter.frequency.value = 20000; // Start unfiltered; updated per-frame by distance

    // Occlusion filter: muffles sound through walls (updated by setOcclusion)
    const occlusionFilter = this.ctx.createBiquadFilter();
    occlusionFilter.type = "lowpass";
    occlusionFilter.frequency.value = 20000; // Unmuffled by default

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    // Inverse model: gain = refDistance / distance, physically accurate 1/r falloff.
    // At 2 units: gain=1.0, at 10 units: 0.2, at 30 units: 0.07
    panner.distanceModel = "inverse";
    panner.refDistance = 2;
    panner.rolloffFactor = 1;

    // Per-peer gain node for individual volume control
    const gain = this.ctx.createGain();
    gain.gain.value = 1.0; // Default: unity (slider 100)

    // Reverb send: routes dry signal into room convolver for wet room acoustics.
    // Fixed send level so reverb-to-direct ratio naturally increases with distance (physically correct).
    const reverbSend = this.ctx.createGain();
    reverbSend.gain.value = 0.15;

    // Chrome requires MediaStream to be attached to a playing HTML audio element to prevent silence
    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.muted = true; // Prevent DOM echo (Web Audio API handles the real output)
    audioEl.play().catch(console.warn);

    // Create an analyser for this peer
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Dry path:   source → airFilter → occlusionFilter → gain → panner → analyser → analyserOut
    // Reverb send: gain → reverbSend → convolverGym / convolverRoom → gainGym/Room → analyserOut
    source.connect(airFilter);
    airFilter.connect(occlusionFilter);
    occlusionFilter.connect(gain);
    gain.connect(panner);
    gain.connect(reverbSend);
    panner.connect(analyser);

    if (this.analyserOut) {
      analyser.connect(this.analyserOut);
    }

    // Route into room convolver for wet acoustics (reverb-to-direct ratio increases naturally with distance)
    if (this.convolverGym) reverbSend.connect(this.convolverGym);
    if (this.convolverRoom) reverbSend.connect(this.convolverRoom);

    this.remotePeers.set(clientId, {
      source,
      panner,
      occlusionFilter,
      airFilter,
      reverbSend,
      gain,
      analyser,
      dataArray,
      audioEl,
      _volume: 100,
      _muted: false,
    });
  }

  public removeRemoteStream(clientId: number) {
    const peer = this.remotePeers.get(clientId);
    if (peer) {
      peer.source.disconnect();
      peer.airFilter.disconnect();
      peer.occlusionFilter.disconnect();
      peer.gain.disconnect();
      peer.reverbSend.disconnect();
      peer.panner.disconnect();
      peer.analyser.disconnect();
      this.remotePeers.delete(clientId);
    }
  }

  public updateListener(
    position: [number, number, number],
    forward: [number, number, number],
    up: [number, number, number],
  ) {
    if (!this.ctx) return;
    this._listenerPos = position;
    const listener = this.ctx.listener;

    // Check if listener properties are AudioParams (newer API) or methods
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(
        position[0],
        this.ctx.currentTime,
        0.1,
      );
      listener.positionY.setTargetAtTime(
        position[1],
        this.ctx.currentTime,
        0.1,
      );
      listener.positionZ.setTargetAtTime(
        position[2],
        this.ctx.currentTime,
        0.1,
      );

      listener.forwardX.setTargetAtTime(forward[0], this.ctx.currentTime, 0.1);
      listener.forwardY.setTargetAtTime(forward[1], this.ctx.currentTime, 0.1);
      listener.forwardZ.setTargetAtTime(forward[2], this.ctx.currentTime, 0.1);

      listener.upX.setTargetAtTime(up[0], this.ctx.currentTime, 0.1);
      listener.upY.setTargetAtTime(up[1], this.ctx.currentTime, 0.1);
      listener.upZ.setTargetAtTime(up[2], this.ctx.currentTime, 0.1);
    } else {
      listener.setPosition(position[0], position[1], position[2]);
      listener.setOrientation(
        forward[0],
        forward[1],
        forward[2],
        up[0],
        up[1],
        up[2],
      );
    }
  }

  public updateRemotePlayer(
    clientId: number,
    position: [number, number, number],
  ) {
    if (!this.ctx) return;
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;

    const { panner, airFilter } = peer;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(position[0], this.ctx.currentTime, 0.1);
      panner.positionY.setTargetAtTime(position[1], this.ctx.currentTime, 0.1);
      panner.positionZ.setTargetAtTime(position[2], this.ctx.currentTime, 0.1);
    } else {
      panner.setPosition(position[0], position[1], position[2]);
    }

    // Air absorption: high frequencies roll off with distance, simulating real acoustics.
    // Formula: 20000 * e^(-d * 0.04) — at 30 units: ~8 kHz, at 60 units: ~3 kHz
    const dx = position[0] - this._listenerPos[0];
    const dy = position[1] - this._listenerPos[1];
    const dz = position[2] - this._listenerPos[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const absorbedFreq = Math.max(800, 20000 * Math.exp(-distance * 0.04));
    airFilter.frequency.setTargetAtTime(
      absorbedFreq,
      this.ctx.currentTime,
      0.05,
    );
  }

  public setOcclusion(clientId: number, isOccluded: boolean) {
    if (!this.ctx) return;
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;

    // Apply low-pass filter if occluded (muffles sound through walls)
    const targetFreq = isOccluded ? 800 : 20000;
    peer.occlusionFilter.frequency.setTargetAtTime(
      targetFreq,
      this.ctx.currentTime,
      0.1,
    );
  }
  // ─── Volume & Mute Controls ────────────────────────────────────────

  /** Set master output volume. @param pct 0–100 slider value */
  public setMasterVolume(pct: number) {
    this._masterVolume = pct;
    if (this.masterGain && !this._masterMuted) {
      this.masterGain.gain.value = perceptualGain(pct);
    }
  }

  public getMasterVolume(): number {
    return this._masterVolume;
  }

  /** Mute/unmute all output */
  public setMasterMuted(muted: boolean) {
    this._masterMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted
        ? 0
        : perceptualGain(this._masterVolume);
    }
  }

  public isMasterMuted(): boolean {
    return this._masterMuted;
  }

  /** Mute/unmute the local microphone (stops transmitting audio to peers) */
  public setMicMuted(muted: boolean) {
    this._micMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    }
  }

  public isMicMuted(): boolean {
    return this._micMuted;
  }

  /** Set per-peer volume. @param pct 0–200 slider value (100 = unity) */
  public setPeerVolume(clientId: number, pct: number) {
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;
    peer._volume = pct;
    if (!peer._muted) {
      peer.gain.gain.value = perceptualGain(pct);
    }
  }

  public getPeerVolume(clientId: number): number {
    return this.remotePeers.get(clientId)?._volume ?? 100;
  }

  /** Mute/unmute a specific peer */
  public setPeerMuted(clientId: number, muted: boolean) {
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;
    peer._muted = muted;
    peer.gain.gain.value = muted ? 0 : perceptualGain(peer._volume);
  }

  public isPeerMuted(clientId: number): boolean {
    return this.remotePeers.get(clientId)?._muted ?? false;
  }

  // ─── Basketball Bounce Sound ─────────────────────────────────────────

  /**
   * Synthesize and play a realistic basketball bounce sound.
   * @param position  World-space [x, y, z] of the ball at impact
   * @param surface   Surface material hit
   * @param impactSpeed  Ball speed (m/s) at moment of collision
   */
  public playBounceSound(
    position: [number, number, number],
    surface: "floor" | "wall" | "backboard" | "rim",
    impactSpeed: number,
  ) {
    if (!this.ctx || !this.analyserOut) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Intensity: map speed to volume with a steep curve so low-speed contacts are quiet
    // and only hard impacts are loud. ^1.5 gives natural acoustic scaling (energy ∝ v²).
    const intensity = Math.pow(Math.min(impactSpeed / 12, 1), 1.5);
    if (intensity < 0.02) return;

    // Pitch jitter: ±8% random variation per bounce for naturalness
    const pitchJitter = 1.0 + (Math.random() - 0.5) * 0.16;

    // --- Routing: bounceGain → panner → analyserOut (dry spatial)
    //                        → reverbSend → convolverGym (wet)
    const bounceGain = ctx.createGain();
    bounceGain.gain.value = 1.0;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3;
    panner.rolloffFactor = 1.2;
    if (panner.positionX) {
      panner.positionX.value = position[0];
      panner.positionY.value = position[1];
      panner.positionZ.value = position[2];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (panner as any).setPosition(...position);
    }

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.25;

    bounceGain.connect(panner);
    panner.connect(this.analyserOut);
    bounceGain.connect(reverbSend);
    if (this.convolverGym) reverbSend.connect(this.convolverGym);

    // Schedule cleanup after all synthesis nodes have stopped
    const cleanupDelay = surface === "rim" ? 1800 : 800;
    setTimeout(() => {
      bounceGain.disconnect();
      panner.disconnect();
      reverbSend.disconnect();
    }, cleanupDelay);

    // --- Surface-specific synthesis ----------------------------------------

    if (surface === "floor") {
      // Hardwood floor: warm bassy thump + sub-bass + rubber slap attack
      const vol = intensity * 1.1;
      // Main thump: low sine with quick pitch sweep down (rubber compression)
      const thumpFreq = (95 + intensity * 25) * pitchJitter;
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        thumpFreq * 2.2,
        thumpFreq,
        0.012,
        0.28 + intensity * 0.1,
        vol * 0.85,
        bounceGain,
      );
      // Sub-bass body resonance
      this._bounceSynth_osc(
        ctx,
        now,
        "triangle",
        52 * pitchJitter,
        42 * pitchJitter,
        0.0,
        0.14,
        vol * 0.5,
        bounceGain,
      );
      // Rubber contact attack (high-passed slap)
      this._bounceSynth_noise(
        ctx,
        now,
        380 + intensity * 120,
        2.2,
        0.065 + intensity * 0.025,
        vol * 0.45,
        bounceGain,
      );
    } else if (surface === "wall") {
      // Concrete/drywall: dead, dull thud with minimal bounce character
      const vol = intensity * 0.85;
      const thumpFreq = (68 + intensity * 18) * pitchJitter;
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        thumpFreq * 1.8,
        thumpFreq,
        0.01,
        0.14 + intensity * 0.05,
        vol * 0.7,
        bounceGain,
      );
      // Heavy low-pass on noise for dull contact sound
      this._bounceSynth_noise(
        ctx,
        now,
        220 + intensity * 60,
        3.5,
        0.04,
        vol * 0.3,
        bounceGain,
      );
    } else if (surface === "backboard") {
      // Glass/fiberglass: hollow higher-pitched thud, slightly bright
      const vol = intensity * 0.95;
      const thumpFreq = (165 + intensity * 45) * pitchJitter;
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        thumpFreq * 2.0,
        thumpFreq,
        0.01,
        0.17 + intensity * 0.06,
        vol * 0.75,
        bounceGain,
      );
      // Slightly hollow sub component
      this._bounceSynth_osc(
        ctx,
        now,
        "triangle",
        88 * pitchJitter,
        70 * pitchJitter,
        0.0,
        0.09,
        vol * 0.4,
        bounceGain,
      );
      // Bright contact attack (glass character)
      this._bounceSynth_noise(
        ctx,
        now,
        850 + intensity * 250,
        2.0,
        0.048,
        vol * 0.55,
        bounceGain,
      );
    } else {
      // Rim (solid steel ring): deep low-frequency ring, like striking thick steel bar
      const vol = intensity * 1.05;
      // Dull rubber-on-steel thump — very low
      const impactFreq = (55 + intensity * 25) * pitchJitter;
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        impactFreq * 1.5,
        impactFreq,
        0.015,
        0.14,
        vol * 0.65,
        bounceGain,
      );
      // Fundamental ring: heavy steel ring resonates around 90-130 Hz
      const ringBase = (85 + intensity * 35 + Math.random() * 15) * pitchJitter;
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        ringBase * 1.03,
        ringBase,
        0.03,
        0.7 + intensity * 0.35,
        vol * 0.9,
        bounceGain,
      );
      // Inharmonic second partial (~2.7× fundamental, characteristic of a ring's bending modes)
      this._bounceSynth_osc(
        ctx,
        now,
        "sine",
        ringBase * 2.73,
        ringBase * 2.71,
        0.02,
        0.4 + intensity * 0.2,
        vol * 0.45,
        bounceGain,
      );
      // Short low-mid attack noise — the clang of contact, not a screech
      this._bounceSynth_noise(
        ctx,
        now,
        200 + intensity * 100,
        2.5,
        0.05,
        vol * 0.4,
        bounceGain,
      );
    }
  }

  /** Oscillator with pitch-sweep envelope: startFreq → endFreq, then exponential volume decay */
  private _bounceSynth_osc(
    ctx: AudioContext,
    now: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    pitchSweepDur: number,
    decayDur: number,
    volume: number,
    destination: AudioNode,
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (pitchSweepDur > 0) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(endFreq, 1),
        now + pitchSweepDur,
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decayDur);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + decayDur + 0.05);
  }

  /** Short bandpass-filtered noise burst (rubber/material contact attack) */
  private _bounceSynth_noise(
    ctx: AudioContext,
    now: number,
    filterFreq: number,
    filterQ: number,
    decayDur: number,
    volume: number,
    destination: AudioNode,
  ) {
    const bufLen = Math.ceil(ctx.sampleRate * (decayDur + 0.02));
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decayDur);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(now);
    source.stop(now + decayDur + 0.02);
  }
}

// Export a singleton
export const audioManager = new AudioManager();
