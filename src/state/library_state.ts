import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import type { SceneObject } from '../types';

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

export interface LibraryBlock {
  id: string;
  name: string;
  description: string;
  objects: SceneObject[]; 
}

interface LibraryState {
  blocks: LibraryBlock[];
  addBlock: (block: Omit<LibraryBlock, 'id'>) => void;
  removeBlock: (id: string) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      blocks: [],
      addBlock: (block) => set((state) => ({ blocks: [...state.blocks, { ...block, id: crypto.randomUUID() }] })),
      removeBlock: (id) => set((state) => ({ blocks: state.blocks.filter(b => b.id !== id) }))
    }),
    { 
      name: 'beam-audio-library',
      storage: createJSONStorage(() => idbStorage)
    }
  )
);
