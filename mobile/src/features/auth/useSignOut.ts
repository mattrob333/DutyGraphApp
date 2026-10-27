import { useCallback } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/api';
import { useSessionStore } from '@/state/session';
import { clearStoredPushToken } from '@/features/notifications/pushToken';
import { confirmAsync } from './confirm';

/** Ends this phone's participant session and clears cached participant data. */
export function useSignOut() {
  const repo = useRepository();
  const qc = useQueryClient();

  /** Sign out without asking (used after "Not me"). */
  const signOutNow = useCallback(
    async (redirect = true) => {
      try {
        await repo.logout();
      } catch {
        // Offline or already revoked: still disconnect this phone.
      }
      await useSessionStore.getState().signOut();
      await clearStoredPushToken();
      qc.clear();
      if (redirect) router.replace('/invite');
    },
    [repo, qc],
  );

  const confirmAndSignOut = useCallback(async () => {
    const ok = await confirmAsync(
      'Sign out of DutyGraph?',
      'This disconnects this phone. To reconnect, you will need a new invitation link from your advisor.',
      'Sign out',
      true,
    );
    if (ok) await signOutNow();
  }, [signOutNow]);

  return { signOutNow, confirmAndSignOut };
}
