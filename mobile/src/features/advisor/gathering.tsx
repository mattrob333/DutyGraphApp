import React, { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  Button,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  SectionLabel,
  Text,
} from "@/components/common";
import {
  CommandError,
  Field,
  ListRow,
  Notice,
} from "@/components/advisor/Parts";
import { CardDeck } from "@/components/handsfree/CardDeck";
import { useReducedMotion } from "@/components/voice/useReducedMotion";
import { useAdvisorPeople } from "@/hooks/advisor";
import {
  loadAdvisorDraft,
  loadKickoffNotes,
  saveAdvisorDraft,
  saveKickoffNotes,
} from "@/storage/advisor";
import { createAdvisorVoiceOut } from "./voice";
import type { KickoffNote, SetupProposal } from "@/api/advisor";
import { newId } from "@/utils/id";
import { useCommand } from "./useCommand";
import { AdvisorCards, advisorQuestions } from "./AdvisorCards";
import type { CardAnswer } from "@/types/handsfree";
import { useDictation } from "./useDictation";
import { go } from "./screens";
export const kickoffTopics = [
  {
    id: "business",
    title: "Business model and value flows",
    question: "What do you provide, to whom, and what result do they value?",
    full: "Walk me through one recent order from request to delivery.",
  },
  {
    id: "goals",
    title: "Goals and evidence of success",
    question: "What should change in one month, six months and one year?",
    full: "Who owns each goal? How do you measure it, and what is the baseline and target?",
  },
  {
    id: "people",
    title: "Departments, people and reporting",
    question: "Name each department, its purpose and its leader.",
    full: "Who is in scope? Who reports to whom? Unknown is a valid answer.",
  },
  {
    id: "duties",
    title: "Responsibilities under each role",
    question: "For each role, what ongoing duties does it keep?",
    full: "Who is accountable? Who does the work?",
  },
  {
    id: "tasks",
    title: "One concrete task walkthrough",
    question: "Choose a typical task. What starts it, and who gets the result?",
    full: "What comes in? What are the steps? What is one unit of work? How many in a usual week? About how long do you think one takes?",
  },
  {
    id: "handoffs",
    title: "Dependencies and delays",
    question: "Where does work wait for another team?",
    full: "Give me a recent example. What was needed, who had it, and how long did it wait?",
  },
  {
    id: "systems",
    title: "Software and decision boundaries",
    question: "Which systems hold the source of truth?",
    full: "Which steps need a named person to approve?",
  },
  {
    id: "followup",
    title: "Agree the discovery follow-up",
    question: "Who should we interview next?",
    full: "Who sends the missing names and documents, and by when?",
  },
] as const;
type KickoffDraft = {
  notes: KickoffNote[];
  topic: number;
  speaker: string;
  text: string;
};
export function KickoffScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>(),
    id = rawId === "new" ? "kickoff-draft" : rawId;
  const people = useAdvisorPeople(),
    cmd = useCommand();
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<KickoffDraft>({
      notes: [],
      topic: 0,
      speaker: "",
      text: "",
    }),
    [loaded, setLoaded] = useState(false),
    [full, setFull] = useState(false),
    [saved, setSaved] = useState(false),
    [sent, setSent] = useState(false);
  const latest = useRef(draft);
  latest.current = draft;
  const [voice] = useState(createAdvisorVoiceOut);
  const dictation = useDictation(
    (text) => setDraft((d) => ({ ...d, text })),
    () => voice.stop(),
  );
  useEffect(() => {
    loadAdvisorDraft<KickoffDraft>(`kickoff-editor.${id}`).then(async (v) => {
      if (v) setDraft(v);
      else {
        const notes = await loadKickoffNotes(id);
        if (notes) setDraft((d) => ({ ...d, notes }));
      }
      setLoaded(true);
    });
    return () => {
      void voice.dispose();
    };
  }, [id]);
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const save = async () => {
      try {
        await saveAdvisorDraft(`kickoff-editor.${id}`, latest.current);
        await saveKickoffNotes(id, latest.current.notes);
        if (active) setSaved(true);
      } catch (e) {
        if (active) cmd.setError(e);
      }
    };
    const timer = setInterval(() => {
      void save();
    }, 2000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void save();
    });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
      void save();
    };
  }, [id, loaded]);
  useEffect(() => {
    setSaved(false);
    setSent(false);
  }, [draft]);
  if (!loaded || people.isPending) return <LoadingState />;
  if (people.isError)
    return <ErrorState error={people.error} onRetry={people.refetch} />;
  if (rawId === "new")
    return (
      <Screen>
        <Heading>Executive kickoff</Heading>
        <Text color="muted">Choose the people in this leadership meeting.</Text>
        {people.data.map((p) => (
          <ListRow
            key={p.id}
            title={p.name}
            detail={p.role}
            selected={attendeeIds.includes(p.id)}
            onPress={() =>
              setAttendeeIds((ids) =>
                ids.includes(p.id)
                  ? ids.filter((v) => v !== p.id)
                  : [...ids, p.id],
              )
            }
          />
        ))}
        <Button
          label="Start kickoff guide"
          kind="primary"
          disabled={!attendeeIds.length}
          loading={cmd.busy}
          onPress={async () => {
            const input = {
              title: "Executive kickoff",
              startsAt: null,
              minutes: 45,
              purpose:
                "Understand how the company delivers value and agree the discovery follow-up.",
              outcomes: kickoffTopics.map((t) => t.title),
              execution:
                "Capture attributed notes and name the next people to interview.",
              attendees: people.data
                .filter((p) => attendeeIds.includes(p.id))
                .map((p) => ({
                  personId: p.id,
                  name: p.name,
                  roles: ["resource" as const],
                })),
              agenda: kickoffTopics.map((t) => ({
                id: t.id,
                title: t.title,
                minutes: t.id === "followup" ? 3 : 6,
                forPersonIds: attendeeIds,
                questions: [t.question],
                outcomeIds: [t.id],
                async: false,
              })),
            };
            const result = await cmd.run(["kickoff-create", input], (r, k) =>
              r.create(input, k),
            );
            if (result) router.replace(`/advisor/kickoff/${result.id}` as Href);
          }}
        />
        <CommandError error={cmd.error} />
      </Screen>
    );
  const topic = kickoffTopics[draft.topic];
  const update = (value: Partial<KickoffDraft>) =>
    setDraft((d) => ({ ...d, ...value }));
  return (
    <Screen>
      <Heading>Executive kickoff</Heading>
      <Text color="muted">One topic at a time. Keep who said what.</Text>
      <SectionLabel>Topic {draft.topic + 1} of 8</SectionLabel>
      <Card>
        <Text variant="bodyStrong">{topic.title}</Text>
        <Text variant="question" style={{ marginTop: 12 }}>
          {topic.question}
        </Text>
        <Button
          label={full ? "Hide full question" : "Show the full question"}
          onPress={() => setFull(!full)}
        />
        {full ? <Notice>{topic.full}</Notice> : null}
        <Button
          label="Read question aloud"
          onPress={() =>
            voice.speak(`${topic.question} ${full ? topic.full : ""}`)
          }
        />
      </Card>
      <SectionLabel>Who said this?</SectionLabel>
      {people.data.map((p) => (
        <ListRow
          key={p.id}
          title={p.name}
          selected={draft.speaker === p.id}
          onPress={() => update({ speaker: p.id })}
        />
      ))}
      <Field
        label="Attributed note"
        value={draft.text}
        onChange={(text) => update({ text })}
        maxLength={6000}
      />
      <Button
        label={dictation.listening ? "Stop listening" : "Speak this note"}
        disabled={!dictation.available}
        onPress={() =>
          dictation.listening ? dictation.stop() : dictation.start()
        }
      />
      {!dictation.available ? (
        <Notice>
          Voice input needs a supported native build. Type instead.
        </Notice>
      ) : null}
      {dictation.error ? <Notice tone="amber">{dictation.error}</Notice> : null}
      <Button
        label="Keep this note"
        disabled={
          !draft.text.trim() || !draft.speaker || draft.notes.length >= 80
        }
        onPress={async () => {
          await dictation.stop();
          const note: KickoffNote = {
            id: newId(),
            meetingId: id,
            topicId: topic.id,
            speakerPersonId: draft.speaker,
            text: draft.text.trim(),
            at: new Date().toISOString(),
          };
          const next = { ...draft, notes: [...draft.notes, note], text: "" };
          setDraft(next);
          await saveAdvisorDraft(`kickoff-editor.${id}`, next);
          await saveKickoffNotes(id, next.notes);
          setSaved(true);
        }}
      />
      <Notice tone={saved ? "sage" : "muted"}>
        {saved ? "Notes saved on this phone." : "Saving notes on this phone…"}
      </Notice>
      <SectionLabel>Notes for this topic</SectionLabel>
      {draft.notes
        .filter((n) => n.topicId === topic.id)
        .map((n) => (
          <Card key={n.id}>
            <Text variant="metaStrong">
              {people.data.find((p) => p.id === n.speakerPersonId)?.name ??
                "Unknown speaker"}
            </Text>
            <Text>{n.text}</Text>
          </Card>
        ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Previous topic"
          disabled={draft.topic === 0}
          onPress={async () => {
            await dictation.stop();
            voice.stop();
            update({ topic: draft.topic - 1 });
          }}
        />
        <Button
          label="Next topic"
          disabled={draft.topic === 7}
          onPress={async () => {
            await dictation.stop();
            voice.stop();
            update({ topic: draft.topic + 1 });
          }}
        />
      </View>
      <SectionLabel>Review and send</SectionLabel>
      <Notice>
        {draft.notes.length} attributed notes. These remain proposals for
        review.
      </Notice>
      <Button
        label="Send notes for review"
        kind="primary"
        disabled={!draft.notes.length}
        loading={cmd.busy}
        onPress={async () => {
          const result = await cmd.run(
            ["notes", id, draft.notes],
            async (r, k) => {
              await r.notes(id, draft.notes, k);
              return true;
            },
          );
          if (result) setSent(true);
        }}
      />
      {sent ? (
        <Notice tone="sage">
          Notes sent for review. They have not changed company records.
        </Notice>
      ) : null}
      <Button
        label="Plan an optional recording"
        onPress={() => go(`/advisor/meetings/${id}/start?mode=capture`)}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

const setupTopics = [
  ["businessType", "What does the company provide, and to whom?"],
  ["valueChain", "What stages take one request through to delivery?"],
  ["departments", "Which departments do that work?"],
  ["roles", "What ongoing duties belong to each role?"],
  ["reporting", "Who is on the team, and who do they report to?"],
  ["goals", "Which goals matter now, and how do you measure them?"],
  ["systems", "Which systems hold the information your team uses?"],
  [
    "workExample",
    "Describe one recent task. What is one unit, how many a week, and about how long do you think one takes?",
  ],
] as const;
const setupQuestions = advisorQuestions(setupTopics);
type SetupDraft = {
  shown: number;
  answers: Record<string, string>;
  proposals: SetupProposal[];
  confirmed: number[];
  cardAnswers?: (CardAnswer | null)[];
};
export function SetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    cmd = useCommand(),
    reduced = useReducedMotion();
  const [draft, setDraft] = useState<SetupDraft>({
      shown: 0,
      answers: {},
      proposals: [],
      confirmed: [],
    }),
    [loaded, setLoaded] = useState(false),
    [sent, setSent] = useState(false);
  const [voice] = useState(createAdvisorVoiceOut);
  const dictation = useDictation(
    (text) =>
      setDraft((d) => ({
        ...d,
        answers: { ...d.answers, [setupTopics[d.shown][0]]: text },
      })),
    () => voice.stop(),
  );
  useEffect(() => {
    loadAdvisorDraft<SetupDraft>(`setup.${id}`).then((v) => {
      if (v) setDraft(v);
      setLoaded(true);
    });
    return () => {
      void voice.dispose();
    };
  }, [id]);
  useEffect(() => {
    if (loaded) void saveAdvisorDraft(`setup.${id}`, draft);
  }, [draft, loaded]);
  if (!loaded) return <LoadingState />;
  const topic = setupTopics[draft.shown];
  const review = async () => {
    await dictation.stop();
    voice.stop();
    const proposals = await cmd.run(
      ["setup-understand", id, draft.answers],
      (r, k) => r.understandSetup(id, draft.answers, k),
    );
    if (proposals) setDraft((d) => ({ ...d, proposals }));
  };
  return (
    <Screen
      contentContainerStyle={{
        paddingHorizontal: draft.proposals.length ? 20 : 0,
      }}
    >
      <View style={{ paddingHorizontal: draft.proposals.length ? 0 : 20 }}>
        <Heading>Setup by voice</Heading>
        <Text color="muted">
          Your answers become proposals. Check each one before it counts.
        </Text>
      </View>
      {!draft.proposals.length ? (
        <>
          <AdvisorCards
            id={`setup-${id}`}
            questions={setupQuestions}
            answers={draft.cardAnswers}
            onAnswers={(cardAnswers) =>
              setDraft((d) => ({ ...d, cardAnswers }))
            }
            lastLabel="Review setup proposals"
            onDone={async (cardAnswers) => {
              const answers = Object.fromEntries(
                setupTopics.map(([key], i) => [key, cardAnswers[i]?.raw ?? ""]),
              );
              setDraft((d) => ({ ...d, answers }));
              const proposals = await cmd.run(
                ["setup-understand", id, answers],
                (r, k) => r.understandSetup(id, answers, k),
              );
              if (proposals) setDraft((d) => ({ ...d, proposals }));
            }}
          />
          <CommandError error={cmd.error} />
        </>
      ) : (
        <>
          <SectionLabel>Here is what we heard</SectionLabel>
          {draft.proposals.map((p, i) => (
            <Card key={`${p.fieldPath}-${i}`}>
              <Text variant="label" color="muted">
                {p.fieldPath}
              </Text>
              <Field
                label={`Proposed ${p.fieldPath}`}
                value={p.value}
                onChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    proposals: d.proposals.map((v, n) =>
                      n === i ? { ...v, value } : v,
                    ),
                    confirmed: d.confirmed.filter((n) => n !== i),
                  }))
                }
              />
              <Text variant="meta" color="muted">
                “{p.quote}”
              </Text>
              <Notice>
                {p.source === "owner_supplied"
                  ? "Owner supplied"
                  : "Advisor supplied"}{" "}
                · Proposed
              </Notice>
              {p.missingFields.length ? (
                <Notice tone="amber">
                  Still needed: {p.missingFields.join(", ")}
                </Notice>
              ) : null}
              <Button
                label={
                  draft.confirmed.includes(i)
                    ? "✓ Confirmed wording"
                    : "Confirm wording"
                }
                onPress={() =>
                  setDraft((d) => ({
                    ...d,
                    confirmed: d.confirmed.includes(i)
                      ? d.confirmed.filter((n) => n !== i)
                      : [...d.confirmed, i],
                  }))
                }
              />
            </Card>
          ))}
          <Button
            label="Confirm these proposals"
            kind="primary"
            disabled={draft.confirmed.length !== draft.proposals.length || sent}
            loading={cmd.busy}
            onPress={async () => {
              const result = await cmd.run(
                ["setup-confirm", id, draft.proposals],
                async (r, k) => {
                  await r.confirmSetup(id, draft.proposals, k);
                  return true;
                },
              );
              if (result) setSent(true);
            }}
          />
          {sent ? (
            <Notice tone="sage">
              Confirmed proposals saved for review. They remain owner supplied.
            </Notice>
          ) : null}
          <Button
            label="Return to answers"
            onPress={() =>
              setDraft((d) => ({ ...d, proposals: [], confirmed: [] }))
            }
          />
          <CommandError error={cmd.error} />
        </>
      )}
    </Screen>
  );
}
