import { useCallback } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRepository } from "@/api";
import { tokenStore } from "@/storage/tokens";
import { useSessionStore } from "@/state/session";
import { clearStoredPushToken } from "@/features/notifications/pushToken";
import { confirmAsync } from "./confirm";
import { clearAllDrafts } from "@/features/handsfree/draft";
import { clearPendingTaskDecisions } from "@/api/extras";
import { clearVoiceAudioCache } from "@/features/voice/out";

/** Ends this phone's participant session and clears cached participant data. */
export function useSignOut() {
  const repo = useRepository();
  const qc = useQueryClient();

  /** Sign out without asking (used after "Not me"). */
  const signOutNow = useCallback(
    async (redirect = true) => {
      useSessionStore.setState({ status: "signedOut" });
      const ended = useSessionStore.getState();
      const drafts = clearAllDrafts();
      const revocation = repo.logout().catch(() => {});
      await Promise.allSettled([
        drafts,
        clearStoredPushToken(),
        clearPendingTaskDecisions(),
        clearVoiceAudioCache(),
      ]);
      if (useSessionStore.getState() === ended) qc.clear();
      await revocation;
      // A delayed logout must not clear or reroute a replacement enrollment.
      if (useSessionStore.getState() !== ended) return;
      await tokenStore.clear();
      if (redirect && useSessionStore.getState() === ended)
        router.replace("/invite");
    },
    [repo, qc],
  );

  const confirmAndSignOut = useCallback(async () => {
    const ok = await confirmAsync(
      "Sign out of DutyGraph?",
      "This disconnects this phone. To reconnect, you will need a new invitation link from your advisor.",
      "Sign out",
      true,
    );
    if (ok) await signOutNow();
  }, [signOutNow]);

  return { signOutNow, confirmAndSignOut };
}
