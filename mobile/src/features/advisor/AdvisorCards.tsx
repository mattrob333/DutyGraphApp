import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Text } from "@/components/common";
import { Field, Notice } from "@/components/advisor/Parts";
import { CardDeck } from "@/components/handsfree/CardDeck";
import { QuestionCard } from "@/components/handsfree/QuestionCard";
import { useReducedMotion } from "@/components/voice/useReducedMotion";
import { useHandsFreeDeck } from "@/features/handsfree/useHandsFreeDeck";
import { createLiveSpeech } from "@/features/voice/live";
import { createAdvisorVoiceOut } from "./voice";
import { cardStatus } from "@shared/hands-free/deck";
import type {
  CardAnswer,
  HandsFreeQuestion,
  QuestionSet,
} from "@/types/handsfree";
/** The participant deck reducer also owns advisor POWER and setup cards. */
export function AdvisorCards({
  id,
  questions,
  answers,
  onAnswers,
  onDone,
  lastLabel = "Review answers",
}: {
  id: string;
  questions: HandsFreeQuestion[];
  answers?: (CardAnswer | null)[];
  onAnswers(answers: (CardAnswer | null)[]): void;
  onDone(answers: (CardAnswer | null)[]): void;
  lastLabel?: string;
}) {
  const speech = useRef(createLiveSpeech({ dataSource: "http" })).current,
    [output] = useState(createAdvisorVoiceOut);
  const reduced = useReducedMotion();
  useEffect(
    () => () => {
      void output.dispose();
    },
    [output],
  );
  const set = useMemo<QuestionSet>(
    () => ({
      requestId: id,
      version: 1,
      contentHash: "",
      title: "Advisor questions",
      advisorName: "",
      companyName: "",
      dueDate: "",
      estimatedMinutes: Math.ceil(questions.length / 2),
      questions,
      whyAsked: [],
    }),
    [id, questions],
  );
  const deck = useHandsFreeDeck({
    set,
    answers,
    mode: "text",
    speech,
    voiceOut: output,
    speak: true,
    repo: {
      checkCoverage: async () => ({
        available: false,
        reason: "LOCAL_ADVISOR_DECK",
      }),
    },
    onAnswers: (v) => onAnswers(v),
    onDone,
  });
  const s = deck.state,
    shown = s.view ?? s.idx,
    q = s.questions[Math.min(shown, s.questions.length - 1)];
  if (s.phase === "done")
    return <Notice tone="sage">Answers ready for review.</Notice>;
  const text =
    s.mode === "text" ? s.typed : [s.heard, s.live].filter(Boolean).join(" ");
  return (
    <View>
      <CardDeck
        count={s.questions.length}
        shown={shown}
        height={340}
        reduce={reduced}
        onSwipeBack={() => deck.send({ type: "prev" })}
        renderCard={(i) => (
          <QuestionCard
            question={s.questions[i]}
            status={cardStatus(s, i)}
            current={i === s.idx}
            viewing={s.view === i}
            paused={s.paused}
            answer={s.answers[i]}
            covered={i === s.idx ? s.covered : (s.answers[i]?.covered ?? [])}
            nudgeHint={s.nudgeHint}
            typing={s.mode === "text"}
            reduce={reduced}
            onKeepTalking={() => deck.send({ type: "keepTalking" })}
            onAddMore={() => deck.send({ type: "addMore" })}
            onReplay={deck.replay}
          />
        )}
      />
      <View style={{ paddingHorizontal: 20 }}>
        <Text variant="small" color="faint" accessibilityLiveRegion="polite">
          {s.announce}
        </Text>
        {s.mode === "text" ? (
          <Field
            label="Your answer"
            value={s.typed}
            onChange={(value) => deck.send({ type: "typed", text: value })}
          />
        ) : (
          <>
            <Text variant="label" color="muted">
              {s.phase === "speaking"
                ? "Speaking"
                : s.paused
                  ? "Paused · microphone off"
                  : "Listening"}
            </Text>
            <Text style={{ minHeight: 70, marginVertical: 12 }}>
              {text || "Your words appear here."}
            </Text>
          </>
        )}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label={s.paused ? "Resume" : "Pause"}
            onPress={() => deck.send({ type: s.paused ? "resume" : "pause" })}
          />
          <Button
            label={s.mode === "text" ? "Answer by voice" : "Type instead"}
            disabled={s.mode === "text" && speech.kind === "unavailable"}
            onPress={() =>
              deck.send({ type: s.mode === "text" ? "toVoice" : "toText" })
            }
          />
          <Button label="Read question aloud" onPress={deck.replay} />
        </View>
        {speech.kind === "unavailable" ? (
          <Notice>
            Voice input needs a supported native build. Type instead.
          </Notice>
        ) : null}
        {s.phase === "speaking" ? (
          <Button
            label="Speak now"
            onPress={() => deck.send({ type: "bargeIn" })}
          />
        ) : null}
        {s.view !== null ? (
          <Button
            label="Return to current question"
            onPress={() => deck.send({ type: "return" })}
          />
        ) : (
          <Button
            label={s.idx === s.questions.length - 1 ? lastLabel : "Next"}
            kind="primary"
            disabled={
              s.paused ||
              s.phase === "speaking" ||
              ["got", "saved", "skipped"].includes(s.phase)
            }
            onPress={() => deck.send({ type: "next" })}
          />
        )}
        <Button
          label="Previous"
          disabled={s.idx === 0 && s.view === null}
          onPress={() => deck.send({ type: "prev" })}
        />
        <Button
          label="I don’t know yet"
          onPress={() => deck.send({ type: "skip", reason: "dontknow" })}
        />
      </View>
    </View>
  );
}

export function advisorQuestions(
  cards: readonly (readonly [string, string])[],
): HandsFreeQuestion[] {
  return cards.map(([short, text], index) => ({
    key: `question.${index}`,
    index,
    text,
    short,
    hints: [],
  }));
}
