/**
 * Device-local preferences. Non-sensitive, persisted with AsyncStorage.
 * Notification preferences are server-owned (PATCH /me/preferences); this
 * store only holds what is inherently per-device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppearancePreference } from '@/types/domain';

interface PreferencesState {
  appearance: AppearancePreference;
  autoAdvance: boolean;
  followUps: 'table' | 'ai';
  setAutoAdvance: (enabled: boolean) => void;
  setFollowUps: (mode: 'table' | 'ai') => void;
  voiceSpeed: 0.9 | 1 | 1.1;
  setVoiceSpeed: (speed: 0.9 | 1 | 1.1) => void;
  /** Participant has read the microphone disclosure and chosen to use voice. */
  micConsented: boolean;
  /** Participant has seen the notifications permission screen (granted or not). */
  notificationsAsked: boolean;
  /** Reduce motion beyond the OS setting. */
  reduceMotion: boolean;
  setAppearance: (a: AppearancePreference) => void;
  setMicConsented: (v: boolean) => void;
  setNotificationsAsked: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  reset: () => void;
}

const initial = { autoAdvance: false, followUps: 'table' as 'table' | 'ai', voiceSpeed: 1 as 0.9 | 1 | 1.1, appearance: 'system' as AppearancePreference, micConsented: false, notificationsAsked: false, reduceMotion: false };

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...initial,
      setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
      setFollowUps: (followUps) => set({ followUps }),
      setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
      setAppearance: (appearance) => set({ appearance }),
      setMicConsented: (micConsented) => set({ micConsented }),
      setNotificationsAsked: (notificationsAsked) => set({ notificationsAsked }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      reset: () => set(initial),
    }),
    { name: 'dg.companion.preferences', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
