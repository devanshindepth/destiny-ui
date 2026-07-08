import { create } from 'zustand';

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface ConnectionStoreState {
  status: ConnectionStatus;
  lastPatchTimestamp: number | null;
  reconnectAttempts: number;
  // actions
  setStatus: (status: ConnectionStatus) => void;
  setLastPatchTimestamp: (ts: number) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useConnectionStore = create<ConnectionStoreState>()((set) => ({
  status: 'disconnected',
  lastPatchTimestamp: null,
  reconnectAttempts: 0,
  setStatus: (status) => set({ status }),
  setLastPatchTimestamp: (ts) => set({ lastPatchTimestamp: ts }),
  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}));
