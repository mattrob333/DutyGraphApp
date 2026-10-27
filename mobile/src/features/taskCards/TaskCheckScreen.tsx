import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useParticipantExtrasRepository,
  type TaskCardRecord,
  type TaskDecisionInput,
} from "@/api/extras";
import {
  BottomActionBar,
  Button,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  Text,
} from "@/components/common";
import {
  SpeakingIndicator,
  TaskCardView,
  TASK_CHOICES,
  taskRows,
} from "@/components/product";
import { newIdempotencyKey } from "@/utils/id";
import { errorMessage } from "@/components/common/States";
import { qk, useMe } from "@/hooks/queries";
import { usePreferencesStore } from "@/state/preferences";
import { createVoiceOut } from "@/features/voice/out";
import {
  cardVersions,
  clearTaskReview,
  loadTaskReview,
  saveTaskReview,
  type Choice,
} from "./reviewStore";

export function TaskCheckScreen({ requestId }: { requestId: string }) {
  const repo = useParticipantExtrasRepository();
  const q = useQuery({
    queryKey: ["task-check", requestId],
    queryFn: () => repo.getTaskCards(requestId),
  });
  if (q.isPending) return <LoadingState label="Opening your Task Cards…" />;
  if (q.isError || !q.data)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const revision = JSON.stringify(
    q.data.map((c) => [c.id, c.version, c.hash, c.needsAttestation]),
  );
  return (
    <TaskCheckRun
      key={`${requestId}:${revision}`}
      requestId={requestId}
      cards={q.data}
    />
  );
}

function TaskCheckRun({
  requestId,
  cards,
}: {
  requestId: string;
  cards: TaskCardRecord[];
}) {
  const repo = useParticipantExtrasRepository();
  const qc = useQueryClient();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const inputs = useRef<TaskDecisionInput[] | undefined>(undefined);
  const voice = useRef<ReturnType<typeof createVoiceOut> | null>(null);
  const generation = useRef(0);
  const me = useMe();
  const speakQuestions = me.data?.voicePreferences?.speakQuestions ?? true;
  const speed = usePreferencesStore((s) => s.voiceSpeed);
  const stopVoice = useCallback(() => {
    generation.current++;
    voice.current?.stop();
    setSpeaking(false);
  }, []);
  useFocusEffect(useCallback(() => () => stopVoice(), [stopVoice]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopVoice();
    });
    return () => sub.remove();
  }, [stopVoice]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await loadTaskReview(requestId, cards);
      const queued = await repo.getPendingTaskDecisions();
      if (!alive) return;
      if (saved) {
        setChoices(saved.choices);
        inputs.current = saved.inputs;
      } else {
        const relevant = queued.filter((q) =>
          cards.some(
            (c) =>
              c.id === q.taskCardId &&
              c.version === q.recordVersion &&
              c.hash === q.contentHash,
          ),
        );
        setChoices(
          Object.fromEntries(
            relevant.map((q) => [
              q.taskCardId,
              { decision: q.decision, note: q.note ?? "" },
            ]),
          ),
        );
        inputs.current = relevant.length ? relevant : undefined;
      }
      setLoaded(true);
    })().catch((e) => {
      if (alive) {
        setFailed(errorMessage(e));
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
      generation.current++;
      void voice.current?.dispose();
    };
  }, [requestId, repo, cards]);
  const choose = (id: string, patch: Partial<Choice>) => {
    const next = {
      ...choices,
      [id]: { ...choices[id], note: choices[id]?.note ?? "", ...patch },
    };
    setChoices(next);
    inputs.current = undefined;
    void saveTaskReview(requestId, {
      choices: next,
      versions: cardVersions(cards),
    }).catch((e) => setFailed(errorMessage(e)));
  };
  const card = cards[index];
  const read = async () => {
    if (!card) return;
    stopVoice();
    const run = generation.current;
    const output = createVoiceOut({
      repository: repo,
      requestId,
      speed,
      downloadHeaders: () => repo.getVoiceDownloadHeaders(),
    });
    voice.current = output;
    const lines = [
      { id: `${card.id}-title`, text: card.title },
      ...taskRows(card.data).flatMap((r, i) => {
        const text = `${r.label}. ${r.value}`;
        return Array.from({ length: Math.ceil(text.length / 380) }, (_, j) => ({
          id: `${card.id}-${i}-${j}`,
          text: text.slice(j * 380, (j + 1) * 380),
        }));
      }),
    ];
    setSpeaking(true);
    try {
      await output.prepare(lines);
      for (const line of lines) {
        if (run !== generation.current) return;
        await output.play(line.id);
      }
    } finally {
      if (run === generation.current) setSpeaking(false);
    }
  };
  const send = async () => {
    if (sending) return;
    stopVoice();
    setFailed(null);
    setSending(true);
    try {
      const outgoing =
        inputs.current ??
        cards
          .filter((c) => c.needsAttestation && choices[c.id]?.decision)
          .map((c) => ({
            taskCardId: c.id,
            decision: choices[c.id].decision!,
            note:
              choices[c.id].decision === "correct"
                ? undefined
                : choices[c.id].note.trim() || undefined,
            recordVersion: c.version,
            contentHash: c.hash,
            idempotencyKey: newIdempotencyKey(),
          }));
      if (!outgoing.length)
        throw new Error("Choose a response before you send.");
      inputs.current = outgoing;
      const savedReview = {
        choices,
        inputs: outgoing,
        versions: cardVersions(cards),
      };
      await saveTaskReview(requestId, savedReview);
      const results = [];
      for (const input of outgoing)
        results.push(await repo.decideTaskCard(input));
      if (results.some((r) => r.pending)) setPending(true);
      else {
        setSent(true);
        await clearTaskReview(requestId, savedReview);
        void qc.invalidateQueries({ queryKey: qk.today });
      }
    } catch (e) {
      setFailed(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  if (!loaded) return <LoadingState />;
  if (sent || pending)
    return (
      <Screen
        footer={
          <BottomActionBar>
            <Button
              label="Back to Today"
              kind="primary"
              onPress={() => router.replace("/today")}
            />
            {pending ? (
              <Button
                label="Try sending again"
                full
                onPress={() => {
                  setPending(false);
                  setReview(true);
                }}
              />
            ) : null}
          </BottomActionBar>
        }
      >
        <Heading>{sent ? "Sent. Thank you." : "Saved on this phone"}</Heading>
        <Text color="muted">
          {sent
            ? "Your advisor has your Task Card review."
            : "Your advisor will see this when your app is updated."}
        </Text>
        {pending ? (
          <Text style={{ marginTop: 12 }} color="muted">
            This review is waiting to send. Your Task Cards have not changed.
          </Text>
        ) : null}
      </Screen>
    );
  if (!cards.length || cards.every((c) => !c.needsAttestation))
    return (
      <Screen>
        <Heading>
          {cards.length
            ? "Your Task Cards are already reviewed"
            : "No Task Cards to review"}
        </Heading>
        <Button
          label="Back to Today"
          onPress={() => router.replace("/today")}
        />
      </Screen>
    );
  const allChosen = cards.every(
    (c) => !!choices[c.id]?.decision || !c.needsAttestation,
  );
  return (
    <Screen
      footer={
        <BottomActionBar>
          {review ? (
            <>
              <Button
                label={failed ? "Try again" : "Send review"}
                kind="primary"
                loading={sending}
                disabled={!allChosen}
                onPress={() => void send()}
              />
              <Button
                label="Back to Task Cards"
                full
                disabled={sending}
                onPress={() => setReview(false)}
              />
            </>
          ) : (
            <>
              <Button
                label={
                  index === cards.length - 1
                    ? "Review choices"
                    : "Next Task Card"
                }
                kind="primary"
                disabled={!choices[card.id]?.decision && card.needsAttestation}
                onPress={() => {
                  stopVoice();
                  index === cards.length - 1
                    ? setReview(true)
                    : setIndex(index + 1);
                }}
              />
              {index > 0 ? (
                <Button
                  label="Previous Task Card"
                  full
                  onPress={() => {
                    stopVoice();
                    setIndex(index - 1);
                  }}
                />
              ) : null}
            </>
          )}
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        {review
          ? "Check before you send"
          : `Task Card ${index + 1} of ${cards.length}`}
      </Text>
      <Heading>
        {review ? "Your Task Card review" : "Does this describe your work?"}
      </Heading>
      <Text color="muted" style={{ marginBottom: 16 }}>
        Your choices are proposals. Your advisor reviews them before anything
        changes.
      </Text>
      {failed ? (
        <Text
          color="red"
          accessibilityRole="alert"
          style={{ marginBottom: 16 }}
        >
          {failed} Your choices are saved on this phone.
        </Text>
      ) : null}
      {speaking ? (
        <View>
          <SpeakingIndicator />
          <Button label="Stop reading" kind="link" onPress={stopVoice} />
        </View>
      ) : null}
      {review ? (
        cards.map((c, i) => (
          <View key={c.id} style={{ marginBottom: 16 }}>
            <Text variant="bodyStrong">{c.title}</Text>
            <Text color="muted">
              {TASK_CHOICES.find((x) => x.value === choices[c.id]?.decision)
                ?.label ??
                (!c.needsAttestation
                  ? "Already reviewed"
                  : "Choose a response")}
            </Text>
            {choices[c.id]?.note && choices[c.id]?.decision !== "correct" ? (
              <Text color="muted">{choices[c.id].note}</Text>
            ) : null}
            <Button
              label={`Change response for ${c.title}`}
              kind="link"
              disabled={sending}
              onPress={() => {
                setIndex(i);
                setReview(false);
              }}
            />
          </View>
        ))
      ) : (
        <TaskCardView
          data={{ ...card.data, title: card.title }}
          decision={
            choices[card.id]?.decision ??
            (!card.needsAttestation ? "correct" : undefined)
          }
          note={
            choices[card.id]?.decision === "correct"
              ? undefined
              : choices[card.id]?.note
          }
          disabled={!card.needsAttestation}
          onDecision={(decision) => choose(card.id, { decision })}
          onNote={
            choices[card.id]?.decision === "correct"
              ? undefined
              : (note) => choose(card.id, { note })
          }
          onRead={speakQuestions ? () => void read() : undefined}
        />
      )}
    </Screen>
  );
}
