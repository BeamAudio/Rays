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

  public updateIR(ir: ImpulseResponse, listenerRotation: [number, number, number] = [0, 0, 0]) {
    this.ensureContext();
    if (!this.context) return;

    const sr = this.context.sampleRate;
    const maxTime = Math.max(...ir.times, 0.5) + 0.5; // End tail
    const length = Math.ceil(maxTime * sr);
    
    // Create a Stereo Buffer
    const buffer = this.context.createBuffer(2, length, sr);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    const listenerYaw = listenerRotation[1]; // Rotation around Y axis

    for (let i = 0; i < ir.times.length; i++) {
      const time = ir.times[i];
      const energies = ir.energies?.[i] ?? []; // 24 octave bands
      const angle = ir.angles?.[i] ?? [0, 0]; // [azimuth, elevation]
      
      const idx = Math.floor(time * sr);
      
      if (idx < length) {
        // Average energy across speech-critical bands
        let avgEnergy = 0;
        for (let f = 10; f <= 16; f++) avgEnergy += energies[f];
        avgEnergy /= 7;
        const amp = Math.sqrt(avgEnergy);
        
        // --- Spatial Audio Logic ---
        // Adjust azimuth based on listener's rotation
        const relativeAzimuth = angle[0] - listenerYaw;
        
        // Simple Sine-based ILD (Interaural Level Difference)
        const panning = Math.sin(relativeAzimuth); // -1 (Left) to 1 (Right)
        const leftGain = Math.sqrt(0.5 * (1 - panning));
        const rightGain = Math.sqrt(0.5 * (1 + panning));
        
        // Simple ITD (Interaural Time Difference)
        // Max delay is approx 0.66ms for human head
        const maxITD = 0.00066; 
        const itdShift = Math.floor(panning * maxITD * sr);

        const width = time < 0.05 ? 1 : 12;
        for (let w = 0; w < width && (idx + w + Math.abs(itdShift)) < length; w++) {
          const noise = (Math.random() * 2 - 1);
          const val = amp * noise * (1.0 - w/width);
          
          // Apply ITD by shifting the index for one ear
          const lIdx = itdShift > 0 ? idx + w + itdShift : idx + w;
          const rIdx = itdShift < 0 ? idx + w + Math.abs(itdShift) : idx + w;
          
          if (lIdx < length) leftData[lIdx] += val * leftGain;
          if (rIdx < length) rightData[rIdx] += val * rightGain;
        }
      }
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < length; i++) {
      max = Math.max(max, Math.abs(leftData[i]), Math.abs(rightData[i]));
    }
    if (max > 0) {
      for (let i = 0; i < length; i++) {
        leftData[i] /= (max * 1.05);
        rightData[i] /= (max * 1.05);
      }
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
