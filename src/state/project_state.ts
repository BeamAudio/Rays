import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

// Custom storage object for IndexedDB
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export interface DirectivityPattern {
  name: string;
  horizontal: number[]; // e.g., [0, 10, 20, ... 350]
  vertical: number[];   // e.g., [0, 10, 20, ... 180]
  // attenuation[freqIdx][angleIdx] in dB. 
  // angleIdx = verticalIdx * horizontal.length + horizontalIdx
  attenuation: number[][];
}

export interface AcousticMaterial {
  name: string;
  absorption: number[]; // 1/3 Octave bands: 50Hz to 10kHz (24 bands)
  scattering: number;
  transmission?: number; // For volumetric transparency
  density?: number; // For volumetric absorption/attenuation (dB/m)
}

export interface SceneObject {
  id: string;
  name: string;
  type: 'mesh' | 'source' | 'receiver' | 'plane';
  shape: 'box' | 'sphere' | 'mesh' | 'plane';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material?: AcousticMaterial;
  // For sources
  intensity?: number;
  spectrum?: number[];
  sourceType?: 'point' | 'line' | 'volumetric';
  directivity?: 'omni' | 'cardioid' | 'custom';
  directivityData?: DirectivityPattern;
  // For planes
  resolution?: number; // points per meter
  // Compiled geometry for simulation
  triangles?: number[]; // Flattened [x1, y1, z1, x2, y2, z2, x3, y3, z3, ...]
}

import type { AcousticMetrics } from '../engine/metrics';

export interface RayPath {
  points: [number, number, number][];
  energy: number;
  time: number;
}

export interface SimulationResult {
  receiverId: string;
  metrics: AcousticMetrics;
  position?: [number, number, number];
  etc?: { time: number; energy: number }[]; // Energy Time Curve
  rayPaths?: RayPath[];
}



export interface EnvironmentSettings {
  temperature: number; // Celsius
  humidity: number; // %
  pressure: number; // kPa
  rayCount: number;
  maxBounces: number;
  ismOrder: number;
}

export interface SpeakerModel {
  id: string;
  name: string;
  manufacturer: string;
  type: 'Point-Source' | 'Line-Array' | 'Ceiling' | 'Other';
  directivity: DirectivityPattern;
  image?: string;
  specs?: string;
}

export type Perspective = 'WORKSPACE' | 'MARKETPLACE' | 'DESIGNER';

interface ProjectState {
  currentView: Perspective;
  viewMode: '2D' | '3D';
  past: SceneObject[][];
  future: SceneObject[][];
  environmentSettings: EnvironmentSettings;
  objects: SceneObject[];
  selectedId: string | null;
  results: SimulationResult[];
  isSimulating: boolean;
  simulationProgress: number;
  showRays: boolean;
  showHeatmap: boolean;
  showRoomModes: boolean;
  selectedMode: [number, number, number];
  maxVisibleBounces: number;
  selectedRayIndex: number | null;
  selectedBand: number; // 0=50Hz ... 23=10kHz, 24=Broadband
  currentTime: number; // ms, for scrubber
  ambientNoiseSPL: number[]; // 24 octave bands
  auralizationSettings: { sampleUrl: string; dry: number; wet: number; isPlaying: boolean; };
  installedModels: SpeakerModel[];
  setEnvironmentSettings: (settings: Partial<EnvironmentSettings>) => void;
  addObject: (obj: Omit<SceneObject, 'id'>) => void;
  removeObject: (id: string) => void;
  setSelected: (id: string | null) => void;
  setSelectedRayIndex: (index: number | null) => void;
  setSelectedBand: (index: number) => void;
  setCurrentTime: (time: number) => void;
  updateObject: (id: string, updates: Partial<SceneObject>) => void;
  setSimulationResults: (results: SimulationResult[]) => void;
  setSimulating: (isSimulating: boolean, progress?: number) => void;
  setVisualizationOptions: (options: { showRays?: boolean; showHeatmap?: boolean; showRoomModes?: boolean; selectedMode?: [number, number, number]; maxVisibleBounces?: number }) => void;
  setAmbientNoise: (noise: number[]) => void;
  setAuralization: (settings: Partial<ProjectState['auralizationSettings']>) => void;
  setCurrentView: (view: Perspective) => void;
  setViewMode: (mode: '2D' | '3D') => void;
  undo: () => void;
  redo: () => void;
  installModel: (model: SpeakerModel) => void;
  uninstallModel: (id: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentView: 'WORKSPACE',
      viewMode: '3D',
      past: [],
      future: [],
      installedModels: [], // User's community/installed models
      environmentSettings: {
        temperature: 20,
        humidity: 50,
        pressure: 101.325,
        rayCount: 25000,
        maxBounces: 30,
        ismOrder: 2,
      },
      objects: [],
      selectedId: null,
      results: [],
      isSimulating: false,
      simulationProgress: 0,
      showRays: true,
      showHeatmap: true,
      showRoomModes: false,
      selectedMode: [1, 0, 0],
      maxVisibleBounces: 5,
      selectedRayIndex: null,
      selectedBand: 24, // Default to Broadband
      currentTime: Number.MAX_SAFE_INTEGER,
      ambientNoiseSPL: Array(24).fill(30), // Default 30dB baseline
      auralizationSettings: { sampleUrl: 'https://www.soundjay.com/buttons/sounds/beep-01a.mp3', dry: 1.0, wet: 0.5, isPlaying: false },
      setEnvironmentSettings: (settings) => set((state) => ({ environmentSettings: { ...state.environmentSettings, ...settings } })),
      setCurrentTime: (time) => set({ currentTime: time }),
      
      undo: () => {
        const { past, future, objects } = get();
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        set({
          past: newPast,
          objects: previous,
          future: [objects, ...future].slice(0, 50),
          selectedId: null // Clear selection to avoid stale references
        });
      },

      redo: () => {
        const { past, future, objects } = get();
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);
        set({
          past: [...past, objects].slice(-50),
          objects: next,
          future: newFuture,
          selectedId: null
        });
      },

      addObject: (obj) => set((state) => ({
        past: [...state.past, state.objects].slice(-50),
        future: [],
        objects: [...state.objects, { ...obj, id: crypto.randomUUID() }]
      })),
      removeObject: (id) => set((state) => ({
        past: [...state.past, state.objects].slice(-50),
        future: [],
        objects: state.objects.filter((o) => o.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
      })),
      setSelected: (id) => set({ selectedId: id }),
      setSelectedRayIndex: (index) => set({ selectedRayIndex: index }),
      setSelectedBand: (index) => set({ selectedBand: index }),
      updateObject: (id, updates) => set((state) => {
        // Only push to history if the update is significant (position/scale/rotation/material)
        // This prevents excessive history entries for minor metadata changes
        const isSignificant = 'position' in updates || 'scale' in updates || 'rotation' in updates || 'material' in updates || 'intensity' in updates || 'directivity' in updates;
        
        return {
          past: isSignificant ? [...state.past, state.objects].slice(-50) : state.past,
          future: isSignificant ? [] : state.future,
          objects: state.objects.map((o) => (o.id === id ? { ...o, ...updates } : o))
        };
      }),
      setSimulationResults: (results) => set({ results, isSimulating: false, simulationProgress: 0 }),
      setSimulating: (isSimulating, progress) => set({ isSimulating, simulationProgress: progress || 0 }),
      setVisualizationOptions: (opts) => set((state) => ({ ...state, ...opts })),
      setAmbientNoise: (noise) => set({ ambientNoiseSPL: noise }),
      setAuralization: (settings) => set((state) => ({ auralizationSettings: { ...state.auralizationSettings, ...settings } })),
      setCurrentView: (view) => set({ currentView: view }),
      setViewMode: (mode) => set({ viewMode: mode }),
      installModel: (model) => set((state) => ({ 
        installedModels: [...state.installedModels.filter(m => m.id !== model.id), model] 
      })),
      uninstallModel: (id) => set((state) => ({ 
        installedModels: state.installedModels.filter(m => m.id !== id) 
      })),
    }),
    {
      name: 'beam-audio-project',
      version: 2, // Stability recovery version
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        objects: state.objects,
        showRays: state.showRays,
        showHeatmap: state.showHeatmap,
        maxVisibleBounces: state.maxVisibleBounces
      } as any),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Zustand Rehydration Error]:', error);
        }
        if (state) {
          try {
            if (!Array.isArray(state.past)) state.past = [];
            if (!Array.isArray(state.future)) state.future = [];
          } catch (e) {
            console.error('[State Recovery Failed]:', e);
          }
        }
      }
    }
  )
);
