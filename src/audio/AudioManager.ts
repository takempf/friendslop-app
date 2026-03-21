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

  // Remote player audio graph: clientId -> nodes
  private remotePeers = new Map<number, {
    source: MediaStreamAudioSourceNode;
    panner: PannerNode;
    filter: BiquadFilterNode;
    analyser: AnalyserNode;
    dataArray: Uint8Array;
    audioEl: HTMLAudioElement; // Fix for Chrome bug 933677
  }>();

  public async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') {
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
    
    this.analyserOut.connect(this.ctx.destination);

    // Default to gym acoustics
    this.setRoom('gym');
  }

  public async getLocalStream(deviceId?: string): Promise<MediaStream> {
    // Requirements: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {})
      }
    });

    this.localStream = stream;

    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop()); // close immediately, just unlocking permissions
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
      this.localStream.getTracks().forEach(t => t.stop());
    }

    // Get new stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        deviceId: { exact: deviceId }
      }
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
    if (typeof this.ctx.setSinkId === 'function') {
      // @ts-expect-error - setSinkId is relatively new and often missing from standard DOM types
      await this.ctx.setSinkId(deviceId);
    } else {
      console.warn("AudioContext.setSinkId not supported in this browser. Output routing is unavailable.");
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
    osc.type = 'sine';
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

  public setRoom(roomName: 'gym' | 'classroom') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    if (roomName === 'gym') {
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
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000; // Unmuffled by default

    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear'; // Easier to hear from far away
    panner.refDistance = 2; // Full volume up to 2 units
    panner.maxDistance = 50; // Drops to 0 only at 50 units
    panner.rolloffFactor = 1;

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

    // BYPASS SPATIAL AUDIO FOR DEBUGGING
    // Source -> Filter -> Analyser -> Direct Master AnalyserOut
    source.connect(filter);
    filter.connect(analyser);

    if (this.analyserOut) {
      analyser.connect(this.analyserOut);
    }

    this.remotePeers.set(clientId, { source, panner, filter, analyser, dataArray, audioEl });
  }

  public removeRemoteStream(clientId: number) {
    const peer = this.remotePeers.get(clientId);
    if (peer) {
      peer.source.disconnect();
      peer.filter.disconnect();
      peer.panner.disconnect();
      this.remotePeers.delete(clientId);
    }
  }

  public updateListener(position: [number, number, number], forward: [number, number, number], up: [number, number, number]) {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    
    // Check if listener properties are AudioParams (newer API) or methods
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(position[0], this.ctx.currentTime, 0.1);
      listener.positionY.setTargetAtTime(position[1], this.ctx.currentTime, 0.1);
      listener.positionZ.setTargetAtTime(position[2], this.ctx.currentTime, 0.1);
      
      listener.forwardX.setTargetAtTime(forward[0], this.ctx.currentTime, 0.1);
      listener.forwardY.setTargetAtTime(forward[1], this.ctx.currentTime, 0.1);
      listener.forwardZ.setTargetAtTime(forward[2], this.ctx.currentTime, 0.1);
      
      listener.upX.setTargetAtTime(up[0], this.ctx.currentTime, 0.1);
      listener.upY.setTargetAtTime(up[1], this.ctx.currentTime, 0.1);
      listener.upZ.setTargetAtTime(up[2], this.ctx.currentTime, 0.1);
    } else {
      listener.setPosition(position[0], position[1], position[2]);
      listener.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
    }
  }

  public updateRemotePlayer(clientId: number, position: [number, number, number]) {
    if (!this.ctx) return;
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;

    const { panner } = peer;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(position[0], this.ctx.currentTime, 0.1);
      panner.positionY.setTargetAtTime(position[1], this.ctx.currentTime, 0.1);
      panner.positionZ.setTargetAtTime(position[2], this.ctx.currentTime, 0.1);
    } else {
      panner.setPosition(position[0], position[1], position[2]);
    }
  }

  public setOcclusion(clientId: number, isOccluded: boolean) {
    if (!this.ctx) return;
    const peer = this.remotePeers.get(clientId);
    if (!peer) return;

    // Apply low-pass filter if occluded (muffles sound through walls)
    const targetFreq = isOccluded ? 800 : 20000;
    peer.filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
  }
}

// Export a singleton
export const audioManager = new AudioManager();
