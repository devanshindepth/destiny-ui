import { create } from 'zustand';

interface PreviewStoreState {
  previewPath: string | null;
  frameReady: boolean;
  pendingCss: string | null; // buffered while frame is loading
  // actions
  setPreviewPath: (path: string | null) => void;
  setFrameReady: (ready: boolean) => void;
  setPendingCss: (css: string | null) => void;
}

export const usePreviewStore = create<PreviewStoreState>()((set) => ({
  previewPath: null,
  frameReady: false,
  pendingCss: null,
  setPreviewPath: (path) => set({ previewPath: path }),
  setFrameReady: (ready) => set({ frameReady: ready }),
  setPendingCss: (css) => set({ pendingCss: css }),
}));
