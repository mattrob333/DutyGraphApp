/**
 * Condition toggles for the mock data source, mirroring the prototype's
 * "States" panel. Visible under Me → Developer only when
 * EXPO_PUBLIC_DATA_SOURCE=mock. The HTTP repository ignores them.
 */
import { create } from 'zustand';

export interface SimulationFlags {
  offline: boolean;
  micDenied: boolean;
  holdSend: boolean;
  failSend: boolean;
  pulseOverdue: boolean;
  teamIncomplete: boolean;
  providerError: boolean;
}

interface SimulationState extends SimulationFlags {
  toggle: (k: keyof SimulationFlags) => void;
  set: (patch: Partial<SimulationFlags>) => void;
  reset: () => void;
}

const initial: SimulationFlags = {
  offline: false,
  micDenied: false,
  holdSend: false,
  failSend: false,
  pulseOverdue: false,
  teamIncomplete: false,
  providerError: false,
};

export const useSimulationStore = create<SimulationState>()((set) => ({
  ...initial,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<SimulationState>),
  set: (patch) => set(patch),
  reset: () => set(initial),
}));

export const simulationFlags = (): SimulationFlags => useSimulationStore.getState();
