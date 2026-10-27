import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { answerSource } from "@shared/hands-free/submission";
import { useReviewBackups } from "@/features/participantExtras/useReviewBackups";
import { SKIP_LABELS } from "@shared/hands-free/deck";
import {
  hasSomethingToSend,
  toSubmission,
} from "@shared/hands-free/submission";
import { useRepository } from "@/api";
import {
  BottomActionBar,
  Button,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  Text,
} from "@/components/common";
import { errorMessage } from "@/components/common/States";
import {
  LiveRegion,
  OfflineNotice,
  SendButton,
  SendFailedNotice,
} from "@/components/handsfree";
import { AnswerCard } from "@/components/product";
import { pulseIdFromRequest } from "@/api/extras/http";
import { isNetworkError, qk } from "@/hooks/queries";
import { showToast, useUiStore } from "@/state/ui";
import { CompanionApiError } from "@/types/domain";
import type { QuestionKey, QuestionSet } from "@/types/handsfree";
import { newIdempotencyKey } from "@/utils/id";
import {
  clearDraft,
  updateDraft,
  useDraft,
  type HandsFreeDraft,
} from "./draft";
import { advisorFirst, advisorName, sendLabel, tookLabel } from "./format";
import { deckHref } from "./IntroScreen";
import { useQuestionSet } from "./queries";

/** Requests whose "Here's what we heard" call is running, so it is asked once even if the screen remounts. */
const asking = new Set<string>();

/** "Here's what we heard" (hf-19, hf-20, hf-22): check, edit, then one Send. */
export function ReviewScreen({ requestId }: { requestId: string }) {
  const q = useQuestionSet(requestId);
  const draft = useDraft(q.data);
  if (q.isPending || (q.data && draft === undefined)) return <LoadingState />;
  if (q.isError || !q.data)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!draft) {
    return (
      <Screen>
        <EmptyState>Nothing to review yet.</EmptyState>
        <Button
          label="Back to the questions"
          kind="primary"
          onPress={() => router.replace(deckHref(requestId, "voice"))}
        />
      </Screen>
    );
  }
  return <ReviewRun set={q.data} draft={draft} />;
}

function ReviewRun({
  set,
  draft,
}: {
  set: QuestionSet;
  draft: HandsFreeDraft;
}) {
  const repo = useRepository();
  const backups = useReviewBackups(set);
  const qc = useQueryClient();
  const offline = useUiStore((s) => s.offline);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [nothing, setNothing] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  // Web: the deck's live region is gone by now, so this screen says it (native: the deck announced it).
  const [heard, setHeard] = useState("");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const t = setTimeout(
      () => setHeard("Here's what we heard. Check it, then tap Send."),
      150,
    );
    return () => clearTimeout(t);
  }, []);

  // Ask once for the polished words; when that is unavailable the person's own words stand.
  useEffect(() => {
    if (draft.understood !== undefined || asking.has(set.requestId)) return;
    const answers = set.questions
      .map((q, i) => ({ q, a: draft.answers[i] }))
      .filter(
        ({ q, a }) => !q.isElse && a && a.status !== "skipped" && a.raw.trim(),
      )
      .map(({ q, a }) => ({ key: q.key, question: q.text, text: a!.raw }));
    if (!answers.length) {
      void updateDraft(set.requestId, { understood: null });
      return;
    }
    asking.add(set.requestId);
    repo
      .understandAnswers({ requestId: set.requestId, answers })
      .then((r) =>
        updateDraft(set.requestId, {
          understood: r.available ? r.items : null,
        }),
      )
      .catch(() => updateDraft(set.requestId, { understood: null }))
      .finally(() => asking.delete(set.requestId));

  }, [draft.understood === undefined]);

  if (draft.understood === undefined)
    return <LoadingState label="Putting your answers together…" />;

  const understood = new Map((draft.understood ?? []).map((u) => [u.key, u]));
  let noteShown = false;
  const blocks = set.questions.flatMap((q, i) => {
    const a = draft.answers[i];
    const answered = !!a && a.status !== "skipped" && !!a.raw.trim();
    if (q.isElse && !answered) return [];
    if (!answered)
      return [
        {
          key: q.key,
          node: (
            <AnswerCard
              key={q.key}
              state="skipped"
              title={q.short}
              reason={SKIP_LABELS[a?.reason ?? "skip"]}
              onAnswerNow={() =>
                router.replace(deckHref(set.requestId, "text"))
              }
            />
          ),
        },
      ];
    const u = understood.get(q.key);
    const own = a!.raw.trim();
    const value =
      draft.edits[q.key] ??
      (u?.understood?.trim() || own.charAt(0).toUpperCase() + own.slice(1));
    const note = !noteShown && u?.suggestion ? u.suggestion : null;
    if (note) noteShown = true;
    return [
      {
        key: q.key,
        node: (
          <AnswerCard
            key={q.key}
            title={q.short}
            value={value}
            raw={own}
            note={note}
            source={answerSource(a!)?.via}
            edited={
              draft.edits[q.key] !== undefined ||
              answerSource(a!)?.edited === true
            }
            onChange={(text) =>
              void updateDraft(set.requestId, {
                edits: { ...draft.edits, [q.key as QuestionKey]: text },
              })
            }
          />
        ),
      },
    ];
  });

  const send = async () => {
    if (sending || sent) return;
    if (backups.loading || backups.clips.length || backups.failed) {
      setFailed(
        "A recording still needs your review. Retry transcription or remove the recording before you send.",
      );
      return;
    }
    const submission = toSubmission(
      set.questions,
      draft.answers,
      draft.understood,
      draft.edits,
    );
    if (!hasSomethingToSend(submission)) {
      setNothing(true);
      return;
    }
    setNothing(false);
    const idempotencyKey = draft.idempotencyKey ?? newIdempotencyKey();
    if (!draft.idempotencyKey)
      await updateDraft(set.requestId, { idempotencyKey });
    setFailed(null);
    setSending(true);
    try {
      await repo.submitAnswers({
        requestId: set.requestId,
        idempotencyKey,
        expectedVersion: set.version,
        contentHash: set.contentHash,
        submission,
      });
    } catch (e) {
      if (!alive.current) return;
      setSending(false);
      // A network or server hiccup keeps the answers for Try again; a refusal says why.
      const retryable =
        isNetworkError(e) ||
        (e instanceof CompanionApiError && e.retryable) ||
        !(e instanceof CompanionApiError);
      const why = retryable
        ? "Your answers are safe on this phone."
        : errorMessage(e);
      setFailed(why);
      AccessibilityInfo.announceForAccessibility?.(`Not sent yet. ${why}`);
      return;
    }
    // Only now, with the server's answer, does the screen say it is done. The draft goes once
    // "You're done" is on screen (a retry before that replays the same key).
    const took = tookLabel(Date.now() - new Date(draft.startedAt).getTime());
    void qc.invalidateQueries({ queryKey: qk.today });
    const sentPulseId = pulseIdFromRequest(set.requestId);
    if (sentPulseId)
      await qc.invalidateQueries({ queryKey: qk.pulse(sentPulseId) });
    if (alive.current) setSent(true);
    setTimeout(() => {
      const pulseId = pulseIdFromRequest(set.requestId);
      router.replace(
        pulseId
          ? {
              pathname: "/pulse/[pulseId]/complete",
              params: { pulseId, acknowledged: "1" },
            }
          : {
              pathname: "/questions/[requestId]/sent",
              params: {
                requestId: set.requestId,
                advisor: set.advisorName,
                took,
              },
            },
      );
      void clearDraft(set.requestId);
    }, 350);
  };

  const finishLater = () => {
    showToast({
      title: "Saved on this phone",
      body: `Your answers for ${advisorFirst(set)} are here when you come back.`,
    });
    router.dismissTo("/today");
  };

  return (
    <Screen
      contentContainerStyle={{ paddingTop: 24 }}
      footer={
        <BottomActionBar>
          <SendButton
            label={failed ? "Try again" : sendLabel(set)}
            sending={sending}
            disabled={
              backups.loading || backups.clips.length > 0 || backups.failed
            }
            done={sent}
            onPress={() => void send()}
          />
          <Button
            label="Finish later"
            kind="link"
            full
            onPress={finishLater}
            style={{ marginTop: -6 }}
          />
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        {`Questions from ${advisorName(set)}`}
      </Text>
      <Heading style={{ marginTop: 10, marginBottom: 10 }}>
        Here's what we heard
      </Heading>
      <Text
        variant="body"
        color="muted"
        style={{ lineHeight: 24.8, marginBottom: 20 }}
      >
        Check it reads right. Change any word. Nothing is sent until you tap
        Send.
      </Text>
      {offline ? <OfflineNotice style={{ marginBottom: 14 }} /> : null}
      {/* At the top, where hf-22 shows its notice, so it is on screen next to Try again. */}
      {failed ? (
        <SendFailedNotice message={failed} style={{ marginBottom: 14 }} />
      ) : null}
      {backups.failed && !backups.clips.length ? (
        <View>
          <Text color="amber">
            Your saved recordings could not be opened. Try again before you
            send.
          </Text>
          <Button
            label="Try loading recordings again"
            onPress={() => void backups.retry()}
          />
        </View>
      ) : null}
      {backups.clips.map((clip) => (
        <AnswerCard
          key={clip.id}
          title={
            set.questions.find((q) => q.key === clip.questionKey)?.short ??
            "Your recording"
          }
          state={
            backups.transcribing ? "recording-pending" : "recording-failed"
          }
          onRetry={
            backups.transcribing ? undefined : () => void backups.retry()
          }
          onRemove={
            backups.transcribing
              ? undefined
              : () => void backups.remove(clip.id)
          }
          note="Try transcription again, or remove this recording and type your answer on its card."
        />
      ))}
      <View>{blocks.map((b) => b.node)}</View>
      {nothing ? (
        <View accessibilityLiveRegion="polite" style={{ marginTop: 4 }}>
          <Text variant="meta" color="muted">
            Answer at least one question before you send.
          </Text>
          <Button
            label="Start the questions again"
            kind="link"
            onPress={() =>
              void clearDraft(set.requestId).then(() =>
                router.replace(deckHref(set.requestId, draft.mode)),
              )
            }
            style={{ paddingHorizontal: 0 }}
          />
        </View>
      ) : null}
      {Platform.OS === "web" ? <LiveRegion text={heard} /> : null}
    </Screen>
  );
}
