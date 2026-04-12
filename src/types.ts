
export interface DirectivityPattern {
  name: string;
  horizontal: number[]; // e.g., [0, 10, 20, ... 350]
  vertical: number[];   // e.g., [0, 10, 20, ... 180]
  attenuation: number[][]; // attenuation[freqIdx][angleIdx] in dB
}

export interface AcousticMaterial {
  name: string;
  category?: string;
  absorption: number[]; // 24 octave bands: 50Hz to 10kHz
  scattering?: number;  // Scattering coefficient (0-1 scalar)
  transmission?: number; // Transmission coefficient (0-1 scalar)
  density?: number;     // Volumetric attenuation coefficient
}

export interface SpeakerModel {
  id: string;
  name: string;
  manufacturer: string;
  type?: string;
  specs?: string;
  directivity: DirectivityPattern;
  imageUrl?: string;
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

export interface AcousticMetrics {
  t30: number[]; // Per octave
  c80: number[];
  d50: number[];
  spl: number[];
  sti: number; // Broadband STI (0-1)
  etc: { time: number; energy: number }[];
  arrivals?: { time: number; energy: number; order: number }[];
}

export interface SimulationResult {
  receiverId: string;
  metrics: AcousticMetrics;
  rayPaths?: { points: [number, number, number][], energy: number, time: number, order: number }[];
  position?: [number, number, number];
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
