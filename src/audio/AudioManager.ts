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

  // Analysers
  private analyserMic: AnalyserNode | null = null;
  private analyserOut: AnalyserNode | null = null;
  private micDataArray: Uint8Array | null = null;
  private outDataArray: Uint8Array | null = null;

  // Remote player audio graph: clientId -> nodes
  private remotePeers = new Map<number, {
    source: MediaStreamAudioSourceNode;
    panner: PannerNode;
    filter: BiquadFilterNode;
    audioEl: HTMLAudioElement; // Fix for Chrome bug 933677
  }>();

  public async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();

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

  public async getLocalStream(): Promise<MediaStream> {
    // Requirements: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    if (this.ctx) {
      const micSource = this.ctx.createMediaStreamSource(stream);
      this.analyserMic = this.ctx.createAnalyser();
      this.analyserMic.fftSize = 256;
      this.micDataArray = new Uint8Array(this.analyserMic.frequencyBinCount);
      micSource.connect(this.analyserMic);
    }

    return stream;
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

    // BYPASS SPATIAL AUDIO FOR DEBUGGING
    // Source -> Filter -> Direct Master AnalyserOut
    source.connect(filter);
    if (this.analyserOut) {
      filter.connect(this.analyserOut);
    }

    this.remotePeers.set(clientId, { source, panner, filter, audioEl });
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
      // @ts-ignore fallback for older browsers
      listener.setPosition(position[0], position[1], position[2]);
      // @ts-ignore
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
      // @ts-ignore
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
