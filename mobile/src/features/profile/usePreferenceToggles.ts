import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useMe, useUpdatePreferences } from '@/hooks/queries';
import { showToast } from '@/state/ui';
import type { NotificationPreferences, Participant, VoicePreferences } from '@/types/domain';

/**
 * Server-owned preferences with optimistic updates: the switch flips at once,
 * rolls back and says so if the server refuses.
 */
export function usePreferenceToggles() {
  const me = useMe();
  const qc = useQueryClient();
  const update = useUpdatePreferences();

  const patch = useCallback(
    (p: { notificationPreferences?: Partial<NotificationPreferences>; voicePreferences?: Partial<VoicePreferences> }) => {
      const previous = qc.getQueryData<Participant>(qk.me);
      if (previous) {
        qc.setQueryData<Participant>(qk.me, {
          ...previous,
          notificationPreferences: { ...previous.notificationPreferences, ...p.notificationPreferences },
          voicePreferences: { ...previous.voicePreferences, ...p.voicePreferences },
        });
      }
      update.mutate(p, {
        onError: () => {
          if (previous) qc.setQueryData(qk.me, previous);
          showToast({ title: "Couldn't save that setting", body: 'Check your connection and try again.' });
        },
      });
    },
    [qc, update],
  );

  return {
    me,
    notifications: me.data?.notificationPreferences,
    voice: me.data?.voicePreferences,
    setNotification: (k: keyof NotificationPreferences, v: boolean) => patch({ notificationPreferences: { [k]: v } }),
    setVoice: (k: keyof VoicePreferences, v: boolean) => patch({ voicePreferences: { [k]: v } }),
  };
}
