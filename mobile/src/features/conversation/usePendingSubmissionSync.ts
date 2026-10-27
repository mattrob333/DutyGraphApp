/**
 * Retries every saved submission on app start, whenever the app returns to the
 * foreground, and periodically while it is open (connectivity can return
 * without an app state change). Uses each submission's saved idempotency key.
 * Covers conversation reviews and the hands-free question cards' answers.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRepository } from "@/api";
import { syncPendingAnswers } from "@/api/http/pendingAnswers";
import {
  captureDraftOwner,
  isDraftOwnerCurrent,
  clearDraft,
} from "@/features/handsfree/draft";
import { hfKeys } from "@/features/handsfree/queries";
import { qk } from "@/hooks/queries";
import { useSessionStore } from "@/state/session";
import { showToast } from "@/state/ui";
import { track } from "@/analytics/events";
import { syncPendingSubmissions } from "./pendingSync";
import { reviewSummary } from "./reviewLogic";
import { useResultStore } from "./resultStore";

const INTERVAL_MS = 60_000;

export function usePendingSubmissionSync() {
  const repo = useRepository();
  const qc = useQueryClient();
  const signedIn = useSessionStore((s) => s.status === "signedIn");

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const run = async () => {
      const owner = captureDraftOwner();
      const { sent } = await syncPendingSubmissions(repo).catch(() => ({
        sent: [] as Awaited<ReturnType<typeof syncPendingSubmissions>>["sent"],
      }));
      const answers = await syncPendingAnswers(repo).catch(() => ({
        sent: [] as Awaited<ReturnType<typeof syncPendingAnswers>>["sent"],
      }));
      if (!isDraftOwnerCurrent(owner)) return;
      for (const { pending } of answers.sent) {
        await clearDraft(pending.requestId, owner, pending.contentHash);
        qc.invalidateQueries({
          queryKey: hfKeys.questionSet(pending.requestId),
        });
      }
      if (!alive || (!sent.length && !answers.sent.length)) return;
      for (const { pending, result } of sent) {
        useResultStore.getState().put(pending.sessionId, {
          result,
          summary: reviewSummary(pending.items),
        });
        track("review_submitted", {
          retried: true,
          items: pending.items.length,
        });
        qc.invalidateQueries({ queryKey: qk.conversation(pending.sessionId) });
      }
      qc.invalidateQueries({ queryKey: qk.today });
      qc.invalidateQueries({ queryKey: qk.work });
      qc.invalidateQueries({ queryKey: qk.meetings });
      qc.invalidateQueries({ queryKey: ["pulse"] });
      showToast({
        title: "Sent",
        body: "Your saved answers reached DutyGraph.",
      });
    };
    void run();
    const sub = AppState.addEventListener(
      "change",
      (s) => s === "active" && void run(),
    );
    const timer = setInterval(() => void run(), INTERVAL_MS);
    return () => {
      alive = false;
      sub.remove();
      clearInterval(timer);
    };
  }, [repo, qc, signedIn]);
}
