import { create } from 'zustand';

interface AppState {
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  setIsOnline: (online) => set({ isOnline: online }),
}));
