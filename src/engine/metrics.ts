import type { ImpulseResponse, AcousticMetrics } from '../types';

export function calculateMetrics(ir: ImpulseResponse, ambientNoiseSPL: number[] = Array(24).fill(30)): AcousticMetrics {
  const numOctaves = 24;
  const metrics: AcousticMetrics = {
    t30: Array(numOctaves).fill(0),
    c80: Array(numOctaves).fill(0),
    d50: Array(numOctaves).fill(0),
    spl: Array(numOctaves).fill(0),
    sti: 0,
    etc: []
  };

  const { times, energies, pressures, orders } = ir;
  if (!times || times.length === 0) return metrics;

  // 1. Binning energy into a high-resolution time grid (e.g., 1ms)
  const maxTime = Math.max(...times, 1.0);
  const binSize = 0.001; // 1ms
  const numBins = Math.ceil(maxTime / binSize);
  const energyGrid = Array.from({ length: numBins }, () => Array(numOctaves).fill(0));

  times.forEach((t, i) => {
    const bin = Math.floor(t / binSize);
    if (bin < numBins) {
      if (pressures) {
         const p = pressures[i];
         const energy = p * p; // Square pressure for energy
         for (let f = 0; f < numOctaves; f++) {
            energyGrid[bin][f] += energy;
         }
      } else if (energies) {
        for (let f = 0; f < numOctaves; f++) {
          energyGrid[bin][f] += energies[i][f];
        }
      }
    }
  });

  const broadband = energyGrid.map(bin => bin[13]); // Use 1kHz for default etc
  
  const maxBroadband = Math.max(...broadband, 1e-12);
  metrics.etc = Array.from(broadband).map((e, i) => ({
    time: i * binSize,
    energy: Math.max(-90, 10 * Math.log10(e / maxBroadband + 1e-12))
  }));

  metrics.energyGrid = energyGrid;

  // Capture individual arrivals for high-detail ETC visualization
  if (times && orders && energies) {
    metrics.arrivals = times.map((t, i) => ({
      time: t,
      energy: [...energies[i]], // Store ALL bands for each arrival
      order: orders[i]
    })).sort((a,b) => a.time - b.time);
  }

  for (let f = 0; f < numOctaves; f++) {
    // 2. SPL (Simplified)
    const totalEnergy = energies 
       ? energies.reduce((sum, e) => sum + e[f], 0) 
       : energyGrid.reduce((sum, e) => sum + e[f], 0);
    metrics.spl[f] = 10 * Math.log10(totalEnergy + 1e-12);

    // 3. Schröder Decay (Backward Integration)
    const decay = new Float32Array(numBins);
    let currentEnergy = 0;
    for (let b = numBins - 1; b >= 0; b--) {
      currentEnergy += energyGrid[b][f];
      decay[b] = currentEnergy;
    }

    // Convert decay to dB
    const decayDb = decay.map(v => 10 * Math.log10(v / decay[0] + 1e-12));

    // 4. T30 Calculation (Slope between -5dB and -35dB using Linear Regression)
    let startBin = decayDb.findIndex(v => v <= -5);
    let endBin = decayDb.findIndex(v => v <= -35);
    
    if (startBin !== -1 && endBin !== -1 && endBin > startBin + 5) {
      // Linear regression: y = ax + b
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const n = endBin - startBin + 1;
      
      for (let b = startBin; b <= endBin; b++) {
        const x = b * binSize;
        const y = decayDb[b];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      if (slope < 0) {
        metrics.t30[f] = -60 / slope;
      }
    }

    // 5. C80 (Clarity) & D50 (Definition)
    const bin80ms = Math.floor(0.08 / binSize);
    const bin50ms = Math.floor(0.05 / binSize);
    
    let early80 = 0, late80 = 0, early50 = 0, late50 = 0;
    for (let b = 0; b < numBins; b++) {
      if (b < bin80ms) early80 += energyGrid[b][f]; else late80 += energyGrid[b][f];
      if (b < bin50ms) early50 += energyGrid[b][f]; else late50 += energyGrid[b][f];
    }

    metrics.c80[f] = 10 * Math.log10(early80 / (late80 + 1e-12) + 1e-12);
    metrics.d50[f] = early50 / (early50 + late50 + 1e-12);
  }

  // 6. STI (Speech Transmission Index) - IEC 60268-16
  // Modulation frequencies (14 frequencies)
  const modFreqs = [0.63, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3, 8.0, 10.0, 12.5];
  const octaveIndices = [4, 7, 10, 13, 16, 19, 22]; // Roughly 125, 250, 500, 1k, 2k, 4k, 8k
  const weights = [0.13, 0.14, 0.11, 0.12, 0.19, 0.17, 0.14]; // STI Octave Weights
  
  let totalSti = 0;
  octaveIndices.forEach((fIdx, i) => {
    let bandMTFSum = 0;
    modFreqs.forEach(fm => {
      // Calculate MTF: m = |FT(h^2)| / integral(h^2)
      let real = 0, imag = 0, totalEnergy = 0;
      for (let b = 0; b < numBins; b++) {
        const e = energyGrid[b][fIdx];
        const phase = 2 * Math.PI * fm * (b * binSize);
        real += e * Math.cos(phase);
        imag += e * Math.sin(phase);
        totalEnergy += e;
      }
      
      const signalSPL = metrics.spl[fIdx];
      const noiseSPL = ambientNoiseSPL[fIdx];
      const snr = signalSPL - noiseSPL;
      const noiseEnergy = totalEnergy * Math.pow(10, -snr / 10); // relative to total signal energy
      
      const m = Math.sqrt(real * real + imag * imag) / (totalEnergy + noiseEnergy + 1e-12);
      
      // Effective SNR = 10 * log10(m / (1-m))
      const snrEff = 10 * Math.log10(Math.max(0.001, m / (1 - m + 1e-12)));
      // Transmission Index for this modulation freq (TI)
      const ti = Math.max(0, Math.min(1, (snrEff + 15) / 30));
      bandMTFSum += ti;
    });
    
    const mti = bandMTFSum / modFreqs.length; // Modulation Transfer Index for this octave
    totalSti += mti * weights[i];
  });

  metrics.sti = totalSti;

  return metrics;
}
