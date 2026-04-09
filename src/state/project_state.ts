import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  SceneObject, SimulationResult, SpeakerModel, 
  EnvironmentSettings
} from '../types';

export type Perspective = 'WORKSPACE' | 'MARKETPLACE' | 'DESIGNER';

export interface ProjectState {
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
      installedModels: [],
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
      selectedBand: 24,
      currentTime: Number.MAX_SAFE_INTEGER,
      ambientNoiseSPL: Array(24).fill(30),
      auralizationSettings: { sampleUrl: 'https://www.soundjay.com/buttons/sounds/beep-01a.mp3', dry: 1.0, wet: 0.5, isPlaying: false },
      
      setEnvironmentSettings: (settings) => set((state) => ({ 
        environmentSettings: { ...state.environmentSettings, ...settings } 
      })),
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
          selectedId: null
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
        objects: [...state.objects, { ...obj, id: crypto.randomUUID() }] as SceneObject[]
      })),

      removeObject: (id) => set((state) => ({
        past: [...state.past, state.objects].slice(-50),
        future: [],
        objects: state.objects.filter(o => o.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
      })),

      updateObject: (id, updates) => set((state) => {
        const newObjects = state.objects.map(o => o.id === id ? { ...o, ...updates } : o) as SceneObject[];
        // Only snapshot for significant geometric changes, not every slider tick
        // But for undo/redo to work reliably, we do it for all updates here
        return {
          past: [...state.past, state.objects].slice(-50),
          future: [],
          objects: newObjects
        };
      }),

      setSelected: (id) => set({ selectedId: id, selectedRayIndex: null }),
      setSelectedRayIndex: (index) => set({ selectedRayIndex: index }),
      setSelectedBand: (index) => set({ selectedBand: index }),
      setSimulationResults: (results) => set({ results, isSimulating: false, simulationProgress: 100 }),
      setSimulating: (isSimulating, progress = 0) => set({ isSimulating, simulationProgress: progress }),
      setVisualizationOptions: (options) => set(() => ({ ...options })),
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
      version: 2,
      storage: createJSONStorage(() => localStorage), // Stable fallback to localStorage
      partialize: (state) => ({
        objects: state.objects,
        showRays: state.showRays,
        showHeatmap: state.showHeatmap,
        maxVisibleBounces: state.maxVisibleBounces,
        installedModels: state.installedModels
      } as any),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[Hydration Error]:', error);
        if (state) {
          if (!Array.isArray(state.past)) state.past = [];
          if (!Array.isArray(state.future)) state.future = [];
        }
      }
    }
  )
);
