import type { DirectivityPattern } from '../types';

// Standard 1/3 Octave frequencies (24 bands)
const FREQS = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];

function THREE_DOT_Z(_x: number, _y: number, z: number) {
  // In our coordinate system, forward is Z+
  return z; 
}

export const DirectivityLibrary: Record<string, DirectivityPattern> = {
  'omni': {
    name: 'Omnidirectional',
    horizontal: Array.from({ length: 36 }, (_, i) => i * 10),
    vertical: Array.from({ length: 19 }, (_, i) => i * 10),
    attenuation: Array.from({ length: 24 }, () => Array(36 * 19).fill(0))
  },
  'cardioid': generateCardioid(),
  'horn_90x60': generateHorn(90, 60),
  'ceiling_60': generateHorn(60, 60)
};

function generateCardioid(): DirectivityPattern {
  const horizontal = Array.from({ length: 36 }, (_, i) => i * 10);
  const vertical = Array.from({ length: 19 }, (_, i) => i * 10);
  const attenuation: number[][] = [];

  for (let f = 0; f < 24; f++) {
    const band: number[] = [];
    for (let v = 0; v < 19; v++) {
      const vAngle = (v * 10 - 90) * Math.PI / 180; // normalized to axis
      for (let h = 0; h < 36; h++) {
        const hAngle = (h * 10) * Math.PI / 180;
        
        const x = Math.cos(vAngle) * Math.cos(hAngle);
        const y = Math.cos(vAngle) * Math.sin(hAngle);
        const z = Math.sin(vAngle);
        
        const theta = Math.acos(Math.max(-1, Math.min(1, THREE_DOT_Z(x, y, z)))); 
        const atten = 20 * Math.log10(0.5 * (1 + Math.cos(theta)) + 0.001);
        band.push(Math.max(-40, atten));
      }
    }
    attenuation.push(band);
  }

  return { name: 'Generic Cardioid', horizontal, vertical, attenuation };
}

function generateHorn(hSpread: number, vSpread: number): DirectivityPattern {
  const horizontal = Array.from({ length: 36 }, (_, i) => i * 10);
  const vertical = Array.from({ length: 19 }, (_, i) => i * 10);
  const attenuation: number[][] = [];

  for (let f = 0; f < 24; f++) {
    const band: number[] = [];
    const hS = hSpread * Math.pow(1000 / FREQS[f], 0.1);
    const vS = vSpread * Math.pow(1000 / FREQS[f], 0.1);

    for (let v = 0; v < 19; v++) {
      const vDeg = v * 10 - 90;
      for (let h = 0; h < 36; h++) {
        const hDeg = h * 10 > 180 ? h * 10 - 360 : h * 10;
        const hDist = Math.max(0, Math.abs(hDeg) - hS/2);
        const vDist = Math.max(0, Math.abs(vDeg) - vS/2);
        const atten = -(hDist * 0.5 + vDist * 0.8);
        band.push(Math.max(-40, atten));
      }
    }
    attenuation.push(band);
  }

  return { name: hSpread === 90 ? '90x60 Horn' : '60x60 Ceiling Speaker', horizontal, vertical, attenuation };
}
