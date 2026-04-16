
export const OCTAVE_1_3_FREQS = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
export const OCTAVE_1_1_FREQS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

// Mapping from 1/3rd to 1/1 octave indices
export const MAP_1_3_TO_1_1 = [
  { fullIdx: 0, subIndices: [0, 1, 2] },    // 63Hz
  { fullIdx: 1, subIndices: [3, 4, 5] },    // 125Hz
  { fullIdx: 2, subIndices: [6, 7, 8] },    // 250Hz
  { fullIdx: 3, subIndices: [9, 10, 11] },  // 500Hz
  { fullIdx: 4, subIndices: [12, 13, 14] }, // 1kHz
  { fullIdx: 5, subIndices: [15, 16, 17] }, // 2kHz
  { fullIdx: 6, subIndices: [18, 19, 20] }, // 4kHz
  { fullIdx: 7, subIndices: [21, 22, 23] }, // 8kHz
];

// A-Weighting values for 1/3 octave bands
export const A_WEIGHTING_1_3 = [-30.2, -26.2, -22.5, -19.1, -16.1, -13.4, -10.9, -8.6, -6.6, -4.8, -3.2, -1.9, -0.8, 0, 0.6, 1.0, 1.2, 1.3, 1.2, 1.0, 0.5, -0.1, -1.1, -2.5];

export interface DirectivityPattern {
  name: string;
  horizontal: number[]; // e.g., [0, 10, 20, ... 350]
  vertical: number[];   // e.g., [0, 10, 20, ... 180]
  attenuation: number[][]; // attenuation[freqIdx][angleIdx] in dB
}

export interface AcousticMaterial {
  name: string;
  category?: string;
  type?: 'broadband' | 'resonator' | 'panel' | 'bass-trap' | 'custom';
  absorption: number[]; // 24 octave bands: 50Hz to 10kHz
  scattering?: number;  // Scattering coefficient (0-1 scalar)
  transmission?: number; // Transmission coefficient (0-1 scalar)
  density?: number;     // Volumetric attenuation coefficient
  thickness?: number;   // Physical thickness in meters
  flowResistivity?: number; // Rayls/m
}

export interface SpeakerModel {
  id: string;
  name: string;
  manufacturer: string;
  type?: string;
  specs?: string;
  directivity: DirectivityPattern;
  imageUrl?: string;
  frequencyResponse?: number[]; // 24 bands relative responses in dB
  pwl?: number; // Maximum Sound Power Level (PWL) in dB
}

export interface SceneObject {
  id: string;
  name: string;
  type: 'source' | 'receiver' | 'mesh' | 'plane';
  shape: 'box' | 'sphere' | 'plane' | 'mesh';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material?: AcousticMaterial;
  triangles?: number[]; // Flattened Float32Array for mesh geometry [v1x, v1y, v1z, v2x, ...]
  speakerModel?: SpeakerModel;
  resolution?: number; // for planes (pts/m)
  // Source properties
  sourceType?: 'omni' | 'point' | 'line' | 'directional';
  directivity?: 'omni' | 'cardioid' | 'custom'; // Directivity mode string
  directivityData?: DirectivityPattern;           // Full balloon data when mode is 'custom'
  intensity?: number;
  muted?: boolean;
  solo?: boolean;
}

export interface VolumetricResult {
  receiverId: string;
  position: [number, number, number];
  metrics: AcousticMetrics;
}

export interface AcousticMetrics {
  t30: number[]; // Per octave
  c80: number[];
  d50: number[];
  spl: number[];
  splA?: number; // Broadband A-weighted SPL
  sti: number; // Broadband STI (0-1)
  etc: { time: number; energy: number }[];
  arrivals?: { time: number; energy: number[]; order: number }[];
  energyGrid?: number[][]; // [binIdx][octaveIdx] for dynamic filtering
}
export interface SimulationResult {
  receiverId: string;
  metrics: AcousticMetrics;
  rayPaths?: { points: [number, number, number][], energy: number, time: number, order: number }[];
  receiverPos?: [number, number, number];
}

export interface EnvironmentSettings {
  temperature: number;
  humidity: number;
  pressure: number;
  rayCount: number;
  maxBounces: number;
  ismOrder: number;
}

export interface ImpulseResponse {
  times: number[];
  orders?: number[]; // reflection order for each arrival
  energies?: number[][]; // [timeIdx][octaveIdx]
  angles?: [number, number][]; // [timeIdx][azimuth, elevation] in radians
  pressures?: number[]; // [timeIdx]
  paths?: { points: [number, number, number][], energy: number, time: number, order: number }[];
}

export interface NumericalImpulseResponse {
  times: number[];
  pressures: number[];
  paths?: any[]; // Keep for compatibility with UI
}
