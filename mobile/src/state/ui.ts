/** Ephemeral UI state: toasts, bottom sheets, connectivity banner. */
import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  /** Route to open when the toast is tapped. */
  route?: string;
}

export interface SheetContent {
  title: string;
  paragraphs: string[];
}

interface UiState {
  toast: Toast | null;
  sheet: SheetContent | null;
  /** Last request failed for network reasons; cleared on next success. */
  offline: boolean;
  showToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: () => void;
  openSheet: (s: SheetContent) => void;
  closeSheet: () => void;
  setOffline: (v: boolean) => void;
}

let seq = 0;

export const useUiStore = create<UiState>()((set) => ({
  toast: null,
  sheet: null,
  offline: false,
  showToast: (t) => set({ toast: { ...t, id: ++seq } }),
  dismissToast: () => set({ toast: null }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  setOffline: (offline) => set({ offline }),
}));

export const showToast = (t: Omit<Toast, 'id'>) => useUiStore.getState().showToast(t);
export const openSheet = (s: SheetContent) => useUiStore.getState().openSheet(s);
