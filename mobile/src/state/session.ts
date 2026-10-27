/**
 * Auth status for routing. Tokens live in secure storage (src/storage/tokens);
 * this store only knows whether a participant session exists.
 * In mock mode the demo participant is signed in unless onboarding is replayed.
 */
import { create } from 'zustand';
import { config } from '@/api/config';
import { tokenStore } from '@/storage/tokens';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: Status;
  hydrate: () => Promise<void>;
  signedIn: () => void;
  signOut: () => Promise<void>;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  hydrate: async () => {
    if (config.dataSource === 'mock') return set({ status: 'signedIn' });
    const s = await tokenStore.get();
    set({ status: s ? 'signedIn' : 'signedOut' });
  },
  signedIn: () => set({ status: 'signedIn' }),
  signOut: async () => {
    await tokenStore.clear();
    set({ status: 'signedOut' });
  },
}));
