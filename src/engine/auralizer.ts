import type { ImpulseResponse } from '../types';

export class Auralizer {
  private context!: AudioContext;
  private convolver!: ConvolverNode;
  private dryGain!: GainNode;
  private wetGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private source: AudioBufferSourceNode | null = null;
  private sampleBuffer: AudioBuffer | null = null;
  private isRunning: boolean = false;

  constructor() {
    // Lazy initialization to avoid SSR/Build crashes
  }

  private ensureContext() {
    if (this.context) return;
    if (typeof window === 'undefined') return;

    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.convolver = this.context.createConvolver();
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    
    this.dryGain.gain.value = 1.0;
    this.wetGain.gain.value = 0.5;
    
    // Safety Limiter
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-3, this.context.currentTime);
    this.limiter.knee.setValueAtTime(10, this.context.currentTime);
    this.limiter.ratio.setValueAtTime(12, this.context.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.context.currentTime);
    this.limiter.release.setValueAtTime(0.25, this.context.currentTime);

    // Default impulse (Dirac delta)
    const emptyIR = this.context.createBuffer(1, 10, this.context.sampleRate);
    emptyIR.getChannelData(0)[0] = 1.0;
    this.convolver.buffer = emptyIR;

    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.limiter);
    this.dryGain.connect(this.limiter);
    this.limiter.connect(this.context.destination);
  }

  public async setSampleFromUrl(url: string) {
    this.ensureContext();
    if (!this.context) return;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.sampleBuffer = await this.context.decodeAudioData(arrayBuffer);
  }

  public updateIR(ir: ImpulseResponse) {
    this.ensureContext();
    if (!this.context) return;

    const sr = this.context.sampleRate;
    const maxTime = Math.max(...ir.times, 0.5) + 0.5; // End tail
    const length = Math.ceil(maxTime * sr);
    const buffer = this.context.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);

    // Technique: Stochastic Synthesis
    // For every ray hit, we place a short burst of noise scaled by energy
    // This preserves both the timing and the spectral distribution (averaging bands)
    
    for (let i = 0; i < ir.times.length; i++) {
      const time = ir.times[i];
      const energies = ir.energies?.[i] ?? []; // 24 octave bands
      const idx = Math.floor(time * sr);
      
      if (idx < length) {
        // Simple broadband reconstruction: average middle-high bands (500Hz-2kHz)
        // 500Hz = idx 10, 2kHz = idx 16
        let avgEnergy = 0;
        for (let f = 10; f <= 16; f++) avgEnergy += energies[f];
        avgEnergy /= 7;
        
        const amp = Math.sqrt(avgEnergy);
        
        // Add a small spike (Dirac-like for early, noise-like for late)
        // For early reflections (< 50ms), we use a sharper grain
        const width = time < 0.05 ? 1 : 12;
        for (let w = 0; w < width && (idx + w) < length; w++) {
          const noise = (Math.random() * 2 - 1);
          data[idx + w] += amp * noise * (1.0 - w/width);
        }
      }
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < length; i++) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) {
      for (let i = 0; i < length; i++) data[i] /= (max * 1.05);
    }

    this.convolver.buffer = buffer;
  }

  public setMix(dry: number, wet: number) {
    this.ensureContext();
    if (!this.context) return;
    this.dryGain.gain.setTargetAtTime(dry, this.context.currentTime, 0.05);
    this.wetGain.gain.setTargetAtTime(wet, this.context.currentTime, 0.05);
  }

  public play() {
    this.ensureContext();
    if (!this.context || !this.sampleBuffer || this.isRunning) return;
    
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    this.source = this.context.createBufferSource();
    this.source.buffer = this.sampleBuffer;
    this.source.loop = true;
    
    this.source.connect(this.convolver);
    this.source.connect(this.dryGain);
    
    this.source.start();
    this.isRunning = true;
  }

  public stop() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.isRunning = false;
  }

  public toggle() {
    if (this.isRunning) this.stop(); else this.play();
  }
}

// Singleton instance for global access
export const auralizer = new Auralizer();
