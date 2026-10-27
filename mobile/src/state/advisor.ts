import { create } from "zustand";
import type { AdvisorSession } from "@/api/advisor/types";
import { clearVoiceAudioCache } from "@/features/voice/out";
import { clearMeetingRecordingData } from "@/features/voice/meeting";
import {
  advisorTokens,
  clearAdvisorData,
  loadAdvisorDraft,
  saveAdvisorDraft,
} from "@/storage/advisor";
type Identity = Pick<AdvisorSession, "advisor" | "company" | "role">;
interface State {
  hydrated: boolean;
  identity: Identity | null;
  activeSessions: Record<string, string>;
  biometricEnabled: boolean;
  setBiometric(enabled: boolean): Promise<void>;
  hydrate(): Promise<void>;
  setSession(session: AdvisorSession): Promise<void>;
  clear(): Promise<void>;
  activate(meetingId: string, sessionId: string): void;
}
/** Tokens stay in secure storage; only the company-scoped identity enters UI state. */
export const useAdvisorStore = create<State>()((set) => ({
  hydrated: false,
  identity: null,
  activeSessions: {},
  biometricEnabled: true,
  setBiometric: async (enabled) => {
    await saveAdvisorDraft("biometric", enabled);
    set({ biometricEnabled: enabled });
  },
  hydrate: async () => {
    const s = await advisorTokens.get();
    const activeSessions =
      (await loadAdvisorDraft<Record<string, string>>("active-sessions")) ?? {};
    const biometricEnabled =
      (await loadAdvisorDraft<boolean>("biometric")) ?? true;
    set({
      hydrated: true,
      biometricEnabled,
      activeSessions,
      identity: s
        ? { advisor: s.advisor, company: s.company, role: s.role }
        : null,
    });
  },
  setSession: async (s) => {
    const previous = await advisorTokens.get();
    if (
      previous &&
      (previous.company.id !== s.company.id ||
        previous.advisor.id !== s.advisor.id)
    ) {
      set({ identity: null, activeSessions: {}, biometricEnabled: true });
      await Promise.all([
        clearAdvisorData(),
        clearVoiceAudioCache(),
        clearMeetingRecordingData(),
      ]);
    }
    await advisorTokens.set(s);
    set({
      hydrated: true,
      identity: { advisor: s.advisor, company: s.company, role: s.role },
    });
  },
  clear: async () => {
    set({ identity: null, activeSessions: {}, biometricEnabled: true });
    const results = await Promise.allSettled([
      clearAdvisorData(),
      clearVoiceAudioCache(),
      clearMeetingRecordingData(),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  },
  activate: (meetingId, sessionId) =>
    set((s) => {
      const activeSessions = { ...s.activeSessions, [meetingId]: sessionId };
      void saveAdvisorDraft("active-sessions", activeSessions);
      return { activeSessions };
    }),
}));
