import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearPendingTaskDecisions,
  useParticipantExtrasRepository,
} from "@/api/extras";
import { useSessionStore } from "@/state/session";
import { CompanionApiError } from "@/types/domain";
import { qk } from "@/hooks/queries";
/** Confirmed choices retry with their saved keys; draft choices never reach this queue. */
export function usePendingTaskDecisionSync() {
  const repo = useParticipantExtrasRepository();
  const qc = useQueryClient();
  const signedIn = useSessionStore((s) => s.status === "signedIn");
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    let busy = false;
    const run = async () => {
      if (!alive || busy || useSessionStore.getState().status !== "signedIn")
        return;
      busy = true;
      try {
        const results = await repo.retryPendingTaskDecisions();
        if (alive && results.some((r) => r.acknowledged)) {
          void qc.invalidateQueries({ queryKey: qk.today });
          void qc.invalidateQueries({ queryKey: ["task-check"] });
        }
      } catch (e) {
        if (e instanceof CompanionApiError && e.status === 401) {
          await clearPendingTaskDecisions();
          await useSessionStore.getState().signOut();
          qc.clear();
        }
      } finally {
        busy = false;
      }
    };
    void run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    const interval = setInterval(() => void run(), 60_000);
    return () => {
      alive = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, [repo, qc, signedIn]);
}
