import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { createCardBackup } from "@/features/voice/cardBackup";
import { router } from "expo-router";
import {
  cardStatus,
  deckReady,
  deckText,
  progressLabel,
  progressSegments,
  shownIndex,
  type DeckMode,
} from "@shared/hands-free/deck";
import { useRepository } from "@/api";
import {
  useParticipantExtrasRepository,
  type ParticipantFeatureConfig,
} from "@/api/extras";
import { useMe } from "@/hooks/queries";
import { usePreferencesStore } from "@/state/preferences";
import { createVoiceOut } from "@/features/voice/out";
import { ErrorState, LoadingState, Text } from "@/components/common";
import {
  CaptionBox,
  CardDeck,
  DeckBar,
  LiveRegion,
  OfflineNotice,
  ProgressSegments,
  QuestionCard,
  SkipSheet,
  SpeechErrorNotice,
  TypingBox,
} from "@/components/handsfree";
import { useReducedMotion } from "@/components/voice/useReducedMotion";
import { createLiveSpeech, type LiveSpeech } from "@/features/voice/live";
import { simulationFlags } from "@/state/simulation";
import { useColors } from "@/theme";
import type { QuestionSet } from "@/types/handsfree";
import {
  newDraft,
  saveDraft,
  useDraft,
  useDraftStore,
  type HandsFreeDraft,
} from "./draft";
import { advisorName } from "./format";
import { useQuestionSet } from "./queries";
import {
  useHandsFreeDeck,
  type DeckClock,
  type MicBlock,
} from "./useHandsFreeDeck";

export interface DeckScreenProps {
  requestId: string;
  /** How the person chose to start: Start with voice or Type instead. A saved draft keeps its own. */
  mode?: DeckMode;
  /** The phone refused the microphone on the explanation screen: typing with the note. */
  micBlocked?: boolean;
  /** Tests pass a fake recognizer and clock. */
  speech?: LiveSpeech;
  clock?: DeckClock;
}

/** The card's height at the default text size (the design's 352 px). */
const CARD_HEIGHT = 352;

export const reviewHref = (requestId: string) =>
  requestId.startsWith("pulse:")
    ? {
        pathname: "/pulse/[pulseId]/review" as const,
        params: { pulseId: requestId.slice(6) },
      }
    : {
        pathname: "/questions/[requestId]/review" as const,
        params: { requestId },
      };

/** The question cards (hf-05 … hf-18): one card at a time, no taps needed while answering. */
export function DeckScreen({
  requestId,
  mode,
  micBlocked,
  speech,
  clock,
}: DeckScreenProps) {
  const extras = useParticipantExtrasRepository();
  const featureConfig = useQuery({
    queryKey: ["participant-features"],
    queryFn: () => extras.getConfig(),
  });
  const q = useQuestionSet(requestId);
  const draft = useDraft(q.data);
  if (featureConfig.isPending || q.isPending || (q.data && draft === undefined))
    return <LoadingState />;
  if (q.isError || !q.data)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <DeckRun
      featureConfig={featureConfig.data}
      set={q.data}
      draft={draft ?? null}
      mode={micBlocked ? "voice" : mode}
      blocked={!!micBlocked}
      speech={speech}
      clock={clock}
    />
  );
}

function DeckRun({
  featureConfig,
  set,
  draft,
  mode,
  blocked,
  speech: injected,
  clock,
}: {
  featureConfig?: ParticipantFeatureConfig;
  set: QuestionSet;
  draft: HandsFreeDraft | null;
  mode?: DeckMode;
  blocked?: boolean;
  speech?: LiveSpeech;
  clock?: DeckClock;
}) {
  const c = useColors();
  const repo = useRepository();
  const extras = useParticipantExtrasRepository();
  const me = useMe();
  const demoAutoAdvance = usePreferencesStore((s) => s.autoAdvance);
  const demoFollowUps = usePreferencesStore((s) => s.followUps);
  const speed = usePreferencesStore((s) => s.voiceSpeed);
  const speakQuestions = me.data?.voicePreferences?.speakQuestions ?? true;
  const output = useMemo(
    () =>
      createVoiceOut({
        repository: extras,
        requestId: set.requestId,
        speed,
        enabled: speakQuestions,
        downloadHeaders: () => extras.getVoiceDownloadHeaders(),
      }),
    [extras, set.requestId, speed, speakQuestions],
  );
  useEffect(() => {
    void output.prepare(
      set.questions.map((question) => ({
        id: `question-${question.key}`,
        text: question.text,
      })),
    );
    return () => {
      void output.dispose();
    };
  }, [output, set.questions]);
  const backup = useMemo(
    () =>
      !injected && repo.kind === "http"
        ? createCardBackup(set.requestId, (clip) =>
            extras.transcribeCardBackup(clip),
          )
        : null,
    [injected, repo.kind, set.requestId, extras],
  );
  const reduce = useReducedMotion();
  // Larger text needs a taller card so the chips stay inside it (card text scales up to 1.8x).
  const { fontScale } = useWindowDimensions();
  const cardHeight = Math.round(
    CARD_HEIGHT * Math.min(Math.max(fontScale || 1, 1), 1.8),
  );
  const speech = useMemo(
    () =>
      injected ??
      createLiveSpeech({
        requestId: set.requestId,
        grant: () => extras.createLiveTranscriptionGrant(set.requestId),
      }),
    [injected, set.requestId, extras],
  );
  const startMode: DeckMode = mode ?? draft?.mode ?? "voice";
  // Known before starting: no recognizer in this build, or the demo's "Microphone blocked" toggle.
  const initialBlock: MicBlock =
    startMode !== "voice"
      ? null
      : speech.kind === "unavailable"
        ? "unavailable"
        : blocked ||
            (speech.kind === "simulated" && simulationFlags().micDenied)
          ? "permission"
          : null;

  const base = useRef(draft ?? newDraft(set, startMode));
  const onAnswers = useCallback(
    (answers: HandsFreeDraft["answers"], m: DeckMode) => {
      const current =
        useDraftStore.getState().drafts[set.requestId] ?? base.current;
      void saveDraft({ ...current, answers, mode: m });
    },
    [set.requestId],
  );
  const onDone = useCallback(
    () => router.replace(reviewHref(set.requestId)),
    [set.requestId],
  );

  const deckRepo = useMemo(
    () => ({
      checkCoverage:
        featureConfig?.followUps === "ai" ||
        (repo.kind === "mock" && demoFollowUps === "ai")
          ? (input: Parameters<typeof repo.checkCoverage>[0]) =>
              extras.checkCoverage(input)
          : (input: Parameters<typeof repo.checkCoverage>[0]) =>
              repo.checkCoverage(input),
    }),
    [repo, extras, featureConfig?.followUps, demoFollowUps],
  );
  const { state, send, micBlock, replay } = useHandsFreeDeck({
    set,
    mode: startMode,
    answers: draft?.answers,
    speech,
    voiceOut: output,
    speak: !injected && speakQuestions,
    backup,
    autoAdvance:
      repo.kind === "mock" ? demoAutoAdvance : featureConfig?.autoAdvance,
    followUps: repo.kind === "mock" ? demoFollowUps : featureConfig?.followUps,
    repo: deckRepo,
    micBlock: initialBlock,
    clock,
    onAnswers,
    onDone,
  });

  const shown = shownIndex(state);
  const current = state.questions[state.idx];
  const voice = state.mode === "voice";
  const onCurrent = state.view == null;
  const listeningish =
    state.phase === "listening" ||
    state.phase === "checking" ||
    state.phase === "more";
  const live =
    voice && onCurrent && !state.paused && !state.speechError && listeningish;
  const canPrev = state.view != null ? state.view > 0 : state.idx > 0;
  const canFwd = state.view != null;
  const returnLabel =
    state.view != null
      ? current?.isElse
        ? "Back to the last card"
        : `Back to question ${state.idx + 1}`
      : null;

  if (state.phase === "done") {
    return (
      <View style={{ flex: 1 }}>
        <LoadingState label="Getting your answers ready…" />
        {Platform.OS === "web" ? <LiveRegion text={state.announce} /> : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <Text
              variant="bodyStrong"
              accessibilityRole="header"
              style={{ fontSize: 15, lineHeight: 19.5 }}
            >
              {progressLabel(state)}
            </Text>
            <Text
              variant="small"
              color="faint"
              numberOfLines={1}
              style={{ flexShrink: 1, lineHeight: 17 }}
            >
              {`From ${advisorName(set)}`}
            </Text>
          </View>
          <ProgressSegments
            segments={progressSegments(state)}
            reduce={reduce}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <CardDeck
            height={cardHeight}
            count={state.questions.length}
            shown={shown}
            reduce={reduce}
            onSwipeBack={() => send({ type: "prev" })}
            onSwipeForward={
              state.view != null ? () => send({ type: "fwd" }) : undefined
            }
            renderCard={(i) => {
              const isCurrent = i === state.idx && state.view == null;
              return (
                <QuestionCard
                  question={state.questions[i]}
                  status={cardStatus(state, i)}
                  current={isCurrent}
                  viewing={state.view === i}
                  paused={state.paused}
                  answer={state.answers[i]}
                  covered={
                    isCurrent
                      ? state.covered
                      : (state.answers[i]?.covered ?? [])
                  }
                  nudgeHint={isCurrent ? state.nudgeHint : null}
                  pulseKey={state.nudges}
                  reduce={reduce}
                  typing={state.mode === "text"}
                  onReplay={isCurrent && speakQuestions ? replay : undefined}
                  onKeepTalking={() => send({ type: "keepTalking" })}
                  onAddMore={() => send({ type: "addMore" })}
                />
              );
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: 2,
            paddingHorizontal: 12,
            minHeight: 44,
          }}
        >
          {canPrev ? (
            <NavLink
              label="← Previous"
              a11y="Previous question"
              onPress={() => send({ type: "prev" })}
            />
          ) : null}
          {canFwd ? (
            <NavLink
              label="Next →"
              a11y="Next question"
              onPress={() => send({ type: "fwd" })}
              right
            />
          ) : null}
        </View>

        {onCurrent && voice && !state.speechError ? (
          <CaptionBox
            state={
              state.paused
                ? "paused"
                : state.phase === "speaking"
                  ? "speaking"
                  : state.phase === "checking"
                    ? "checking"
                    : "listening"
            }
            live={live}
            text={deckText(state)}
            prompt={
              current?.isElse
                ? "Start talking whenever you're ready, or tap No, that's all."
                : "Start talking whenever you're ready"
            }
            reduce={reduce}
          />
        ) : null}
        {onCurrent && voice && speech.kind !== "simulated" ? (
          <Text
            variant="small"
            color="muted"
            style={{ marginHorizontal: 20, marginTop: 8 }}
          >
            {speech.source === "voice_openai"
              ? "Live words use OpenAI. You can always type instead."
              : "Live words use your device’s speech service. You can always type instead."}
          </Text>
        ) : null}
        {onCurrent && voice && state.speechError ? (
          <SpeechErrorNotice
            style={{ marginTop: 2, marginHorizontal: 20 }}
            onRetry={() => send({ type: "retry" })}
            onType={() => send({ type: "toText" })}
          />
        ) : null}
        {onCurrent && !voice ? (
          <TypingBox
            value={state.typed}
            onChange={(text) => send({ type: "typed", text })}
            blocked={state.micBlocked ? (micBlock ?? "permission") : null}
          />
        ) : null}
        {state.offline ? (
          <OfflineNotice style={{ marginTop: 12, marginHorizontal: 20 }} />
        ) : null}
      </ScrollView>

      <DeckBar
        mode={state.mode}
        returnLabel={returnLabel}
        paused={state.paused}
        isElse={!!current?.isElse}
        ready={deckReady(state)}
        held={
          state.phase === "got" ||
          state.phase === "saved" ||
          state.phase === "skipped"
        }
        onReturn={() => send({ type: "return" })}
        onPause={() => send({ type: "pause" })}
        onResume={() => send({ type: "resume" })}
        onSkip={() => send({ type: "openSkip" })}
        onFinish={() => send({ type: "finish" })}
        onToText={() => send({ type: "toText" })}
        onToVoice={() => send({ type: "toVoice" })}
        onNext={() => send({ type: "next" })}
      />
      <SkipSheet
        visible={state.sheet}
        reduce={reduce}
        onSkip={(reason) => send({ type: "skip", reason })}
        onClose={() => send({ type: "closeSkip" })}
      />
      {Platform.OS === "web" ? <LiveRegion text={state.announce} /> : null}
    </KeyboardAvoidingView>
  );
}

function NavLink({
  label,
  a11y,
  onPress,
  right,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  right?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 8,
        justifyContent: "center",
        marginLeft: right ? "auto" : 0,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="metaStrong" color="muted" style={{ lineHeight: 18 }}>
        {label}
      </Text>
    </Pressable>
  );
}
