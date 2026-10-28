import { saveLiveNote } from "./saveLiveNote";
import { ClosingResponse } from "@/components/advisor/ClosingResponse";
import { CompanionApiError } from "@/api/http/errors";
import { SIMULATED_VOICE_NOTICE } from "@/features/voice/out";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Share,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  ConsentRow,
  RecordingIndicator,
  SegmentedControl,
  TimerRing,
  CoachPanel,
  ParkedList,
} from "@/components/product";
import {
  CommandError,
  Field,
  ListRow,
  Notice,
  ProposalEvidenceCard,
  proposalText,
  speakerLabel,
} from "@/components/advisor/Parts";
import {
  getAdvisorRepository,
  type CreateMeeting,
  type MeetingAttendee,
  type MeetingSession,
  type MeetingProposal,
  type KickoffNote,
  type SetupProposal,
} from "@/api/advisor";
import {
  useAdvisorMeeting,
  useAdvisorMeetings,
  useAdvisorPeople,
  useAdvisorPulse,
  useAdvisorSession,
} from "@/hooks/advisor";
import { useAdvisorStore } from "@/state/advisor";
import {
  loadAdvisorDraft,
  loadKickoffNotes,
  saveAdvisorDraft,
  saveKickoffNotes,
} from "@/storage/advisor";
import { newId } from "@/utils/id";
import { useCommand } from "./useCommand";
import { AdvisorCards, advisorQuestions } from "./AdvisorCards";
import type { CardAnswer } from "@/types/handsfree";
import { useDeviceReadiness } from "./useDeviceReadiness";
import { useSourcePlayback } from "./useSourcePlayback";
import { createAdvisorVoiceOut } from "./voice";
import { useRealtimeMeetingVoice } from "./useRealtimeMeetingVoice";
import { realtimeCapability } from "@/features/voice/meeting/realtime/native";
import { config } from "@/api/config";
import { automaticFacilitatorTurn } from "@/features/voice/meeting/schedule";
import type { FacilitatorLine } from "@/features/voice/meeting/facilitator";
import { createLiveSpeech } from "@/features/voice/live";
import {
  createNativeMeetingRecorder,
  MeetingTurnController,
} from "@/features/voice/meeting";
import { CardDeck } from "@/components/handsfree/CardDeck";
import { useReducedMotion } from "@/components/voice/useReducedMotion";
import type {
  ParticipantRole,
  SpeakerMap,
} from "../../../../shared/meetings/types";

export const go = (route: string) => router.push(route as Href);
/** Accepts "2026-11-03 14:00" as well as ISO text; returns NaN when unreadable. */
const parseLocalDate = (value: string) =>
  Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2"));
const meetingTypeLabel = (type: string | null | undefined) => {
  const words = (type ?? "meeting").toLowerCase().replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${/meeting$/.test(words) ? "" : " meeting"}`;
};
const base = (id: string) => `/advisor/meetings/${encodeURIComponent(id)}`;
const useMeetingId = () =>
  useLocalSearchParams<{ meetingId: string }>().meetingId;
const roles: { value: ParticipantRole; label: string }[] = [
  { value: "decision_maker", label: "Decision maker" },
  { value: "influencer", label: "Influencer" },
  { value: "resource", label: "Resource person" },
  { value: "executor", label: "Executor" },
  { value: "needs_to_know", label: "Needs to know" },
];
function useSessionId(meetingId: string) {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const stored = useAdvisorStore((s) => s.activeSessions[meetingId]);
  return params.sessionId ?? stored ?? "";
}
const sessionRoute = (meetingId: string, step: string, sessionId: string) =>
  `${base(meetingId)}/${step}?sessionId=${encodeURIComponent(sessionId)}`;
const message = (text: string) =>
  AccessibilityInfo.announceForAccessibility(text);

export function PairScreen() {
  const signout = useLocalSearchParams<{ signedOut?: string }>().signedOut;
  const mock = getAdvisorRepository().kind === "mock";
  const [code, setCode] = useState(mock ? "DEMO" : ""),
    [scan, setScan] = useState(false);
  const [permission, askPermission] = useCameraPermissions();
  const cmd = useCommand(),
    setSession = useAdvisorStore((s) => s.setSession);
  const pair = async () => {
    const result = await cmd.run(["pair", code], (r, key) =>
      r.pair(code.trim(), key),
    );
    if (result) {
      await setSession(result);
      router.replace("/advisor/meetings" as Href);
    }
  };
  return (
    <Screen>
      <Heading>Run meetings</Heading>
      {signout === "local" ? (
        <Notice tone="amber">
          Signed out on this phone. The server could not confirm device
          revocation.
        </Notice>
      ) : null}
      <Text color="muted">
        Pair this phone from your signed-in DutyGraph workspace.
      </Text>
      <Notice>
        {mock
          ? "Demo uses fictional Larkspur Supply data. Enter DEMO."
          : "Open the pairing code on your computer. The session covers one company."}
      </Notice>
      {scan && permission?.granted ? (
        <View style={{ height: 280, marginVertical: 16 }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              let value = data.trim();
              try {
                value =
                  (JSON.parse(value) as { pairingCode?: string }).pairingCode ??
                  "";
              } catch {
                /* A plain pairing code is also valid. */
              }
              if (/^[A-Za-z0-9_-]{4,160}$/.test(value)) {
                setCode(value);
                setScan(false);
              } else
                cmd.setError(
                  new Error(
                    "This is not a pairing code. Use the code shown by DutyGraph.",
                  ),
                );
            }}
          />
          <Button label="Close camera" onPress={() => setScan(false)} />
        </View>
      ) : null}
      <Field
        label="Pairing code"
        value={code}
        onChange={setCode}
        multiline={false}
        maxLength={160}
      />
      <Button
        label="Pair this phone"
        kind="primary"
        disabled={!code.trim()}
        loading={cmd.busy}
        onPress={pair}
      />
      <Button
        label="Scan pairing QR"
        style={{ marginTop: 12 }}
        onPress={async () => {
          if (Platform.OS === "web") {
            cmd.setError(
              new Error(
                "Camera pairing needs the native app. Paste your code here.",
              ),
            );
            return;
          }
          const p = permission?.granted ? permission : await askPermission();
          if (p.granted) setScan(true);
          else
            cmd.setError(
              new Error(
                "Camera access is off. Paste the pairing code instead.",
              ),
            );
        }}
      />
      <CommandError error={cmd.error} />
      <Notice>Participant invitations use the separate invitation flow.</Notice>
    </Screen>
  );
}

export function CenterScreen() {
  const q = useAdvisorMeetings(),
    cmd = useCommand();
  if (q.isPending) return <LoadingState label="Loading meetings…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const groups = [
    ["Needs planning", q.data.filter((m) => m.state === "REQUESTED")],
    [
      "Upcoming",
      q.data.filter((m) => ["ROUTED", "PREPARING", "READY"].includes(m.state)),
    ],
    ["Live now", q.data.filter((m) => m.state === "IN_SESSION")],
    [
      "Needs review",
      q.data.filter((m) =>
        ["EXTRACTING", "REVIEW_PENDING", "PARTIALLY_APPROVED"].includes(
          m.state,
        ),
      ),
    ],
    [
      "Recent",
      q.data.filter((m) => ["COMPLETE", "APPROVED"].includes(m.state)),
    ],
  ] as const;
  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      <Heading>Meetings</Heading>
      <Text color="muted">
        Plan the outcome. Keep only the meeting you need.
      </Text>
      <Button
        label="New meeting"
        kind="primary"
        style={{ marginTop: 20 }}
        onPress={() => go("/advisor/meetings/new")}
      />
      {groups.map(([label, items]) =>
        items.length ? (
          <View key={label}>
            <SectionLabel>{label}</SectionLabel>
            {items.map((m) => (
              <ListRow
                key={m.id}
                title={m.title}
                detail={`${m.minutes} minutes · ${m.state === "REQUESTED" ? "Needs planning" : m.state.toLowerCase().replace(/_/g, " ")}`}
                onPress={() => go(`${base(m.id)}/plan`)}
              />
            ))}
          </View>
        ) : null,
      )}
      {!q.data.length ? (
        <Notice>No meetings yet. Start with a purpose and an outcome.</Notice>
      ) : null}
      <SectionLabel>Information gathering</SectionLabel>
      <ListRow
        title="Executive kickoff"
        detail="Eight topics with attributed notes"
        onPress={() => go("/advisor/kickoff/new")}
      />
      <ListRow
        title="Setup by voice"
        detail="Review proposals before sending"
        onPress={async () => {
          const result = await cmd.run("setup-create", (r, k) => r.setup(k));
          if (result) go(`/advisor/setup/${result.id}`);
        }}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

const powerCards = [
  ["Purpose", "Why does this meeting exist?"],
  ["Outcomes", "What must be true when it ends?"],
  ["Who", "Who must decide, contribute or carry out the work?"],
  ["Execution", "What happens next, and by when?"],
  ["Responsibility", "Who owns the result?"],
] as const;
const powerQuestions = advisorQuestions(powerCards);
type BuilderDraft = {
  title: string;
  minutes: string;
  startsAt: string;
  answers: string[];
  shown: number;
  cardAnswers?: (CardAnswer | null)[];
};
export function BuilderScreen() {
  const [draft, setDraft] = useState<BuilderDraft>({
    title: "",
    minutes: "25",
    startsAt: "",
    answers: ["", "", "", "", ""],
    shown: -1,
  });
  const [loaded, setLoaded] = useState(false),
    cmd = useCommand();
  useEffect(() => {
    loadAdvisorDraft<BuilderDraft>("builder").then((v) => {
      if (v) setDraft(v);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) void saveAdvisorDraft("builder", draft);
  }, [draft, loaded]);
  const update = (patch: Partial<BuilderDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const create = async (answers: (CardAnswer | null)[]) => {
    const texts = answers.map((a) => a?.raw ?? "");
    const input: CreateMeeting = {
      title: draft.title.trim(),
      startsAt: draft.startsAt
        ? new Date(parseLocalDate(draft.startsAt)).toISOString()
        : null,
      minutes: Number(draft.minutes),
      purpose: texts[0],
      outcomes: texts[1].split("\n").filter((v) => v.trim()),
      execution: `${texts[3]}\nResult owner: ${texts[4]}`,
      attendees: [],
    };
    const result = await cmd.run(["create", input], (r, k) =>
      r.create(input, k),
    );
    if (result) {
      await saveAdvisorDraft("builder", {
        title: "",
        minutes: "25",
        startsAt: "",
        answers: ["", "", "", "", ""],
        shown: -1,
      });
      go(`${base(result.id)}/attendees`);
    }
  };
  if (!loaded) return <LoadingState />;
  return (
    <Screen
      contentContainerStyle={{ paddingHorizontal: draft.shown < 0 ? 20 : 0 }}
    >
      <View style={{ paddingHorizontal: draft.shown < 0 ? 0 : 20 }}>
        <Heading>
          {draft.shown < 0 ? "New meeting" : "Build with POWER"}
        </Heading>
        <Text variant="small" color="faint">
          Carson Tate’s POWER framework · Work Simply
        </Text>
        {draft.shown < 0 ? (
          <>
            <Field
              label="Meeting title"
              value={draft.title}
              onChange={(title) => update({ title })}
              multiline={false}
            />
            <Field
              label="Length in minutes"
              value={draft.minutes}
              onChange={(minutes) => update({ minutes })}
              multiline={false}
            />
            <Field
              label="Start time (optional)"
              placeholder="YYYY-MM-DD HH:MM"
              value={draft.startsAt}
              onChange={(startsAt) => update({ startsAt })}
              multiline={false}
            />
            <Button
              label="Plan the outcome"
              kind="primary"
              disabled={
                !draft.title.trim() ||
                !Number.isFinite(Number(draft.minutes)) ||
                Number(draft.minutes) < 1 ||
                Number(draft.minutes) > 240 ||
                (!!draft.startsAt &&
                  !Number.isFinite(parseLocalDate(draft.startsAt)))
              }
              onPress={() => update({ shown: 0 })}
            />
          </>
        ) : null}
      </View>
      {draft.shown >= 0 ? (
        <AdvisorCards
          id="power-builder"
          questions={powerQuestions}
          answers={draft.cardAnswers}
          onAnswers={(cardAnswers) => update({ cardAnswers })}
          onDone={create}
          lastLabel="Choose attendees"
        />
      ) : null}
      <CommandError error={cmd.error} />
      {cmd.error && draft.cardAnswers?.every(Boolean) ? (
        <Button
          label="Retry creating meeting"
          onPress={() => create(draft.cardAnswers!)}
        />
      ) : null}
    </Screen>
  );
}

export function AttendeesScreen() {
  const id = useMeetingId(),
    q = useAdvisorMeeting(id),
    people = useAdvisorPeople(),
    [selected, setSelected] = useState<MeetingAttendee[] | null>(null),
    [guest, setGuest] = useState(""),
    cmd = useCommand();
  if (q.isPending || people.isPending) return <LoadingState />;
  if (q.isError || people.isError)
    return (
      <ErrorState
        error={q.error ?? people.error}
        onRetry={() => {
          void q.refetch();
          void people.refetch();
        }}
      />
    );
  const attendees = selected ?? q.data.attendees;
  return (
    <Screen>
      <Heading>Who needs to be here?</Heading>
      <Text color="muted">
        Choose the people and the part each person plays.
      </Text>
      {people.data.map((p) => {
        const a = attendees.find((a) => a.personId === p.id);
        return (
          <View key={p.id}>
            <ListRow
              title={p.name}
              detail={`${p.role} · ${p.department}`}
              selected={!!a}
              onPress={() =>
                setSelected(
                  a
                    ? attendees.filter((v) => v !== a)
                    : [
                        ...attendees,
                        { personId: p.id, name: p.name, roles: ["resource"] },
                      ],
                )
              }
            />
            {a ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginVertical: 10,
                }}
              >
                {roles.map((role) => (
                  <Button
                    key={role.value}
                    label={`${a.roles.includes(role.value) ? "✓ " : ""}${role.label}`}
                    accessibilityState={{
                      selected: a.roles.includes(role.value),
                    }}
                    onPress={() =>
                      setSelected(
                        attendees.map((v) =>
                          v === a
                            ? {
                                ...v,
                                roles: a.roles.includes(role.value)
                                  ? a.roles.filter((r) => r !== role.value)
                                  : [...a.roles, role.value],
                              }
                            : v,
                        ),
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      <SectionLabel>Guests</SectionLabel>
      {attendees
        .filter((a) => !a.personId)
        .map((a, i) => (
          <View key={i}>
            <ListRow
              title={a.name}
              detail="Guest · tap to remove"
              onPress={() => setSelected(attendees.filter((v) => v !== a))}
            />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginVertical: 10,
              }}
            >
              {roles.map((role) => (
                <Button
                  key={role.value}
                  label={`${a.roles.includes(role.value) ? "✓ " : ""}${role.label}`}
                  accessibilityState={{
                    selected: a.roles.includes(role.value),
                  }}
                  onPress={() =>
                    setSelected(
                      attendees.map((v) =>
                        v === a
                          ? {
                              ...v,
                              roles: a.roles.includes(role.value)
                                ? a.roles.filter((r) => r !== role.value)
                                : [...a.roles, role.value],
                            }
                          : v,
                      ),
                    )
                  }
                />
              ))}
            </View>
          </View>
        ))}
      <Field
        label="Guest name"
        value={guest}
        onChange={setGuest}
        multiline={false}
        maxLength={100}
      />
      <Button
        label="Add guest"
        disabled={!guest.trim()}
        onPress={() => {
          setSelected([
            ...attendees,
            {
              personId: null,
              name: guest.trim(),
              guest: { name: guest.trim(), role: "Guest" },
              roles: ["resource"],
            },
          ]);
          setGuest("");
        }}
      />
      <Notice>
        People who only need the result can be released from the live meeting.
      </Notice>
      <Button
        label="Build the plan"
        kind="primary"
        disabled={!attendees.length || attendees.some((a) => !a.roles.length)}
        loading={cmd.busy}
        onPress={async () => {
          const saved = await cmd.run(
            ["attendees", id, attendees, q.data.version, q.data.hash],
            (r, k) =>
              r.patch(
                id,
                {
                  attendees,
                  expectedVersion: q.data.version,
                  contentHash: q.data.hash,
                },
                k,
              ),
          );
          if (saved) {
            const planned = await cmd.run(["plan", id, saved.version], (r, k) =>
              r.plan(id, k),
            );
            if (planned) go(`${base(id)}/plan`);
          }
        }}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function PlanScreen() {
  const id = useMeetingId(),
    q = useAdvisorMeeting(id),
    cmd = useCommand();
  const active = useAdvisorStore((s) => s.activeSessions[id]);
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [agenda, setAgenda] = useState<
    import("@/api/advisor").MeetingDefinition["agenda"] | null
  >(null);
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const m = q.data;
  const blocked =
    m.gate?.mode === "INSUFFICIENT_INFO" ||
    m.gate?.route === "HUMAN_ESCALATION";
  return (
    <Screen>
      <Heading>{m.title}</Heading>
      <Text color="muted">{m.power.purpose}</Text>
      <SectionLabel>Outcomes</SectionLabel>
      {m.power.outcomes.map((o, i) => (
        <ListRow key={i} title={o} />
      ))}
      <ListRow
        title="Attendees and roles"
        detail={`${m.attendees.length} ${m.attendees.length === 1 ? "person" : "people"}`}
        onPress={() => go(`${base(id)}/attendees`)}
      />
      {!m.gate ? (
        <Button
          label="Propose a plan"
          kind="primary"
          loading={cmd.busy}
          style={{ marginTop: 16 }}
          onPress={() => cmd.run(["plan", id], (r, k) => r.plan(id, k))}
        />
      ) : (
        <>
          <SectionLabel>Proposed plan</SectionLabel>
          <Text variant="bodyStrong">
            {meetingTypeLabel(m.meetingType)} · {m.minutes} minutes
          </Text>
          <Button
            label={editingAgenda ? "Cancel agenda edits" : "Edit agenda"}
            style={{ marginTop: 8, marginBottom: 4 }}
            onPress={() => {
              setEditingAgenda(!editingAgenda);
              setAgenda(m.agenda);
            }}
          />
          {(agenda ?? m.agenda).map((a, index) =>
            editingAgenda ? (
              <View key={a.id}>
                <Field
                  label={`Topic ${index + 1}`}
                  value={a.title}
                  multiline={false}
                  onChange={(title) =>
                    setAgenda(
                      (agenda ?? m.agenda).map((v) =>
                        v.id === a.id ? { ...v, title } : v,
                      ),
                    )
                  }
                />
                <Field
                  label={`Minutes for topic ${index + 1}`}
                  value={String(a.minutes)}
                  multiline={false}
                  onChange={(value) =>
                    setAgenda(
                      (agenda ?? m.agenda).map((v) =>
                        v.id === a.id
                          ? { ...v, minutes: Number(value) || 0 }
                          : v,
                      ),
                    )
                  }
                />
              </View>
            ) : (
              <ListRow
                key={a.id}
                title={a.title}
                detail={`${a.minutes} minutes${a.async ? " · Can be answered first" : ""}`}
              />
            ),
          )}
          {editingAgenda ? (
            <Button
              label="Save agenda and check gate"
              kind="primary"
              loading={cmd.busy}
              disabled={(agenda ?? m.agenda).some(
                (a) =>
                  !a.title.trim() ||
                  !Number.isInteger(a.minutes) ||
                  a.minutes < 1 ||
                  a.minutes > 240,
              )}
              onPress={async () => {
                const result = await cmd.run(
                  ["agenda", id, m.version, m.hash, agenda],
                  (r, k) =>
                    r.patch(
                      id,
                      {
                        agenda: agenda ?? m.agenda,
                        expectedVersion: m.version,
                        contentHash: m.hash,
                      },
                      k,
                    ),
                );
                if (result) {
                  const plan = await cmd.run(
                    ["plan-agenda", id, result.version],
                    (r, k) => r.plan(id, k),
                  );
                  if (plan) {
                    setEditingAgenda(false);
                    setAgenda(null);
                  }
                }
              }}
            />
          ) : null}
          <SectionLabel>Meeting gate</SectionLabel>
          <Card tone="violet">
            <Text variant="bodyStrong">
              {m.gate.route === "HUMAN_ESCALATION"
                ? "Ask an authorized person"
                : m.gate.mode === "INSUFFICIENT_INFO"
                  ? "More planning is needed"
                  : m.gate.mode === "ASYNC"
                    ? "Send a Pulse first"
                    : m.gate.mode === "HYBRID"
                      ? "Pulse first, then a shorter meeting"
                      : m.gate.mode === "NO_MEETING"
                        ? "No meeting needed"
                        : "Keep a live meeting"}
            </Text>
            <Notice>{m.gate.reason}</Notice>
            {m.gate.releasedPersonIds.length ? (
              <Text variant="small" color="sage">
                {m.gate.releasedPersonIds.length} people can receive the result
                instead.
              </Text>
            ) : null}
          </Card>
          <Text variant="meta" color="muted">
            You choose the route. This proposal changes nothing until you
            approve it.
          </Text>
          {(["pulse", "shorter", "as_planned"] as const).map((choice) => (
            <Button
              key={choice}
              disabled={blocked || editingAgenda}
              label={
                choice === "pulse"
                  ? "Send a Pulse instead"
                  : choice === "shorter"
                    ? "Shorten the meeting"
                    : "Keep as planned"
              }
              loading={cmd.busy}
              style={{ marginTop: 10 }}
              onPress={async () => {
                const result = await cmd.run(
                  ["route", id, choice, m.version, m.hash],
                  (r, k) => r.route(id, choice, k, m),
                );
                if (result)
                  go(`${base(id)}/${choice === "pulse" ? "pulse" : "start"}`);
              }}
            />
          ))}
        </>
      )}
      {active ? (
        <>
          <SectionLabel>Current session</SectionLabel>
          <Button
            label={
              m.state === "REVIEW_PENDING"
                ? "Review results"
                : "Return to session"
            }
            onPress={() =>
              go(
                sessionRoute(
                  id,
                  m.state === "REVIEW_PENDING" ? "results" : "live",
                  active,
                ),
              )
            }
          />
        </>
      ) : null}
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function PulseScreen() {
  const id = useMeetingId(),
    q = useAdvisorPulse(id),
    cmd = useCommand();
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      <Heading>Pulse before the meeting</Heading>
      <Text color="muted">
        Each person gets only the questions they need to answer.
      </Text>
      {!q.data.total ? (
        <Button
          label="Create the Pulse"
          kind="primary"
          loading={cmd.busy}
          style={{ marginTop: 20 }}
          onPress={() =>
            cmd.run(["pulse-create", id], (r, k) => r.pulse(id, true, k))
          }
        />
      ) : (
        <>
          <Notice tone="sage">
            {q.data.done} of {q.data.total} complete
          </Notice>
          {q.data.people.map((p, i) => (
            <ListRow
              key={i}
              title={p.name}
              detail={
                p.state === "complete"
                  ? "Complete"
                  : p.state === "in_progress"
                    ? "In progress"
                    : "Not started"
              }
            />
          ))}
          <Notice>Team status shows completion only.</Notice>
          {q.data.done === q.data.total ? (
            <Card>
              <Text variant="bodyStrong">
                Check whether a live meeting is still needed.
              </Text>
              <Notice>
                {q.data.gate?.reason ?? "The leader can review the gate again."}
              </Notice>
              <Button
                label="Check the gate again"
                onPress={async () => {
                  const result = await cmd.run(
                    ["regate", id, q.data.done],
                    (r, k) => r.plan(id, k),
                  );
                  if (result) go(`${base(id)}/plan`);
                }}
              />
            </Card>
          ) : (
            <Button
              label="Continue with a live meeting"
              onPress={() => go(`${base(id)}/start`)}
            />
          )}
        </>
      )}
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function StartScreen({ capture = false }: { capture?: boolean }) {
  const requestedMode = useLocalSearchParams<{ mode?: string }>().mode;
  const readiness = useDeviceReadiness();
  const [voiceKind, setVoiceKind] = useState<"tts_lines" | "realtime">(
    "tts_lines",
  );
  const [realtimeReady] = useState(() =>
    realtimeCapability(config.facilitatorRealtime),
  );
  const id = useMeetingId(),
    q = useAdvisorMeeting(id),
    [mode, setMode] = useState<MeetingSession["mode"]>(
      capture || requestedMode === "capture"
        ? "capture"
        : requestedMode === "facilitator"
          ? "facilitator"
          : "copilot",
    ),
    cmd = useCommand(),
    activate = useAdvisorStore((s) => s.activate);
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return (
    <Screen>
      <Heading>Start {q.data.title}</Heading>
      <SegmentedControl
        options={[
          { value: "capture", label: "Capture" },
          { value: "copilot", label: "Copilot" },
          { value: "facilitator", label: "Facilitator" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as MeetingSession["mode"])}
      />
      <Notice>
        {mode === "capture"
          ? "Keep a transcript and notes. DutyGraph does not interrupt."
          : mode === "copilot"
            ? "Get quiet prompts while you lead the meeting."
            : "DutyGraph speaks at set moments. You stay in control."}
      </Notice>
      {mode === "facilitator" ? (
        <>
          <Text variant="metaStrong">Facilitator voice</Text>
          <SegmentedControl
            options={[
              { value: "tts_lines", label: "Spoken lines" },
              {
                value: "realtime",
                label: "Realtime",
                disabled:
                  !realtimeReady.available ||
                  getAdvisorRepository().kind === "mock",
              },
            ]}
            value={voiceKind}
            onChange={(value) =>
              setVoiceKind(value as "tts_lines" | "realtime")
            }
          />
          <Notice>
            {voiceKind === "realtime"
              ? "Everyone must consent. The connection pauses after 15 minutes or its duration limit."
              : "Spoken lines are the default. The controller chooses when to speak."}
          </Notice>
          {!realtimeReady.available ? (
            <Notice>{realtimeReady.reason}</Notice>
          ) : null}
        </>
      ) : null}
      <Card>
        <Text variant="bodyStrong">Before you start</Text>
        <Notice>
          Ask every attendee for consent. Keep enough battery and free space.
          Connect power for a long meeting.
        </Notice>
        <Notice
          tone={
            readiness.battery !== null && readiness.battery < 0.3
              ? "amber"
              : "muted"
          }
        >
          Battery:{" "}
          {readiness.battery === null
            ? "Not available in this preview"
            : `${Math.round(readiness.battery * 100)}%${readiness.battery < 0.3 ? " · Connect power before recording" : ""}`}
        </Notice>
        <Notice
          tone={
            readiness.spaceMB !== null && readiness.spaceMB < 500
              ? "amber"
              : "muted"
          }
        >
          Free space:{" "}
          {readiness.spaceMB === null
            ? "Not available in this preview"
            : `${readiness.spaceMB} MB${readiness.spaceMB < 500 ? " · Free space before recording" : ""}`}
        </Notice>
        <Text variant="meta">
          Default estimated dispatch budget:{" "}
          {mode === "facilitator" ? "$15" : "$2"} per meeting. The server applies
          the company limit after start. Failed requests can use this estimate;
          actual provider cost may differ. Recording continues at the limit.
        </Text>
      </Card>
      <Notice tone="amber">
        {getAdvisorRepository().kind === "mock"
          ? "Demo mode. Audio is not recorded. You can add a sample or typed notes."
          : Platform.OS !== "web"
            ? "Audio recording is available after microphone consent."
            : "Native recording is unavailable. You can keep typed notes."}
      </Notice>
      <Button
        label="Check everyone’s consent"
        kind="primary"
        loading={cmd.busy}
        onPress={async () => {
          const s = await cmd.run(["start", id, mode, voiceKind], (r, k) =>
            r.start(id, mode, k, voiceKind),
          );
          if (s) {
            activate(id, s.id);
            go(sessionRoute(id, "consent", s.id));
          }
        }}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function ConsentScreen() {
  const id = useMeetingId(),
    sid = useSessionId(id),
    q = useAdvisorSession(sid),
    [items, setItems] = useState<MeetingSession["consents"] | null>(null),
    cmd = useCommand();
  if (!sid) return <MissingSession id={id} />;
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const consents = items ?? q.data.consents;
  return (
    <Screen>
      <Heading>Ask everyone first</Heading>
      <Card>
        <Text variant="body">
          This meeting can be recorded and transcribed. The team can review the
          recording and transcript. Nothing is final until people review it. You
          can decline or ask us to stop.
        </Text>
      </Card>
      <Notice>Read this aloud. Then record each person’s choice below.</Notice>
      {consents.map((a) => (
        <ConsentRow
          key={a.personKey}
          name={a.name}
          state={a.state}
          onChange={(state) =>
            setItems(
              consents.map((v) =>
                v.personKey === a.personKey
                  ? { ...v, state, at: new Date().toISOString() }
                  : v,
              ),
            )
          }
        />
      ))}
      <Notice tone="amber">
        A person who declines is excluded. Keep their speech out of recorded or
        typed evidence.
      </Notice>
      <Button
        label="Confirm consent and continue"
        kind="primary"
        disabled={
          !consents.length ||
          consents.some((a) => a.state === "pending") ||
          !consents.some((a) => a.state === "consented")
        }
        loading={cmd.busy}
        onPress={async () => {
          const s = await cmd.run(["consent", sid, consents], (r, k) =>
            r.consent(sid, consents, k),
          );
          if (s) go(sessionRoute(id, "live", sid));
        }}
      />
      <CommandError error={cmd.error} />
      <Notice>
        Draft recording notice. Legal review is needed before real use.
      </Notice>
    </Screen>
  );
}
function MissingSession({ id }: { id: string }) {
  return (
    <Screen>
      <Heading>No active session</Heading>
      <Notice>Start the meeting to check consent and open a session.</Notice>
      <Button
        label="Start meeting"
        kind="primary"
        onPress={() => go(`${base(id)}/start`)}
      />
    </Screen>
  );
}

export function LiveScreen() {
  const id = useMeetingId(),
    sid = useSessionId(id),
    q = useAdvisorSession(sid),
    meeting = useAdvisorMeeting(id),
    cmd = useCommand();
  const [note, setNote] = useState(""),
    [speaker, setSpeaker] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [recording, setRecording] = useState(false),
    [paused, setPaused] = useState(false),
    [listening, setListening] = useState(false),
    [muted, setMuted] = useState(false),
    [stopped, setStopped] = useState(false),
    [line, setLine] = useState(""),
    [coach, setCoach] = useState<{
      nextQuestion: string;
      stillNeeded: string[];
      flags: string[];
    } | null>(null);
  const speech = useRef(
    createLiveSpeech({
      dataSource: "http",
      kind: Platform.OS === "web" ? "unavailable" : "native",
    }),
  ).current;
  const [simulatedVoice, setSimulatedVoice] = useState(false);
  const [voice] = useState(() =>
    createAdvisorVoiceOut(() => setSimulatedVoice(true)),
  );
  const realtimeSelected = q.data?.voice === "realtime";
  const realtime = useRealtimeMeetingVoice({
    session: q.data,
    meeting: meeting.data,
    lines: voice,
    onSpeech: (speaking) => {
      lastWordsAt.current = Date.now();
      if (speaking) turns.speechDetected();
    },
    onTranscript: (text) => {
      setNote(text);
      lastWordsAt.current = Date.now();
    },
    onInputStopped: () => setListening(false),
  });
  const [deferredLine, setDeferredLine] = useState<FacilitatorLine | null>(
    null,
  );
  const [turns] = useState(
    () =>
      new MeetingTurnController(realtime.voice, (v) => {
        playbackActive.current = false;
        lastPlaybackEnd.current = null;
        setLine(v.text);
        setDeferredLine(v);
      }),
  );
  const native = useRef<ReturnType<typeof createNativeMeetingRecorder> | null>(
    null,
  );
  const mediaStarting = useRef(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const allConsented =
    !!q.data?.consents.length &&
    q.data.consents.every((person) => person.state === "consented");
  const recordingAllowed = useRef(allConsented);
  recordingAllowed.current = allConsented;
  useEffect(() => {
    if (allConsented) return;
    void speech.stop();
    setListening(false);
    realtime.realtime.suspend();
    const recorder = native.current;
    if (recorder)
      void recorder
        .stop()
        .then(() => {
          setRecording(false);
          setPaused(false);
        })
        .catch((error) => cmd.setError(error));
  }, [allConsented]);
  const mock = getAdvisorRepository().kind === "mock";
  const lastWordsAt = useRef(Date.now());
  const lastCoachAt = useRef(0);
  const lastCoachTopic = useRef<string | null>(null);
  const autoTurnKeys = useRef(new Set<string>());
  const roomVoiceAllowed = useRef(false);
  roomVoiceAllowed.current =
    listening &&
    !stopped &&
    (!realtimeSelected || realtime.realtime.inputActive);
  const lastPlaybackEnd = useRef<number | null>(null);
  const playbackActive = useRef(false);
  const activeLineId = useRef<string | null>(null);
  const playbackTopic = useRef<string | null>(null);
  const [coachPaused, setCoachPaused] = useState(false);
  useEffect(
    () =>
      realtime.subscribe((event) => {
        if (event.type === "start") {
          activeLineId.current = event.lineId;
          playbackActive.current = true;
          lastPlaybackEnd.current = null;
          setDeferredLine(null);
        } else if (activeLineId.current === event.lineId) {
          playbackActive.current = false;
          activeLineId.current = null;
          lastPlaybackEnd.current = event.type === "end" ? Date.now() : null;
        }
      }),
    [realtime.subscribe],
  );
  useEffect(() => {
    if (!listening) {
      turns.skip();
      if (realtime.realtime.inputActive) realtime.realtime.suspend();
      playbackActive.current = false;
      lastPlaybackEnd.current = null;
    }
  }, [listening]);
  useEffect(() => {
    if (!sid) return;
    void loadAdvisorDraft<boolean>(`ai-stopped.${sid}`).then((value) => {
      if (value) {
        turns.stop();
        realtime.realtime.suspend();
        setStopped(true);
      }
    });
  }, [sid, turns]);
  useEffect(() => {
    const log = q.data?.log ?? [];
    if (log.some((item) => item.kind === "ai_stopped")) {
      turns.stop();
      realtime.realtime.suspend();
      setStopped(true);
    }
    const mute = log
      .filter((item) => item.kind === "ai_muted" || item.kind === "ai_unmuted")
      .at(-1);
    if (mute) {
      const isMuted = mute.kind === "ai_muted";
      turns.mute(isMuted);
      setMuted(isMuted);
    }
  }, [q.data?.log, turns]);
  useEffect(() => {
    const session = q.data,
      definition = meeting.data;
    if (!session?.startedAt || session.endedAt || !definition) return;
    if (playbackTopic.current !== session.currentTopicId) {
      playbackTopic.current = session.currentTopicId;
      lastPlaybackEnd.current = null;
    }
    const silentFor = clock - lastWordsAt.current;
    if (
      session.mode === "copilot" &&
      session.transcript.length &&
      silentFor >= 4000 &&
      clock - lastCoachAt.current >= 60000 &&
      (clock - Date.parse(session.startedAt) >= 20000 ||
        lastCoachTopic.current !== session.currentTopicId)
    ) {
      lastCoachAt.current = clock;
      lastCoachTopic.current = session.currentTopicId;
      void cmd
        .run(["auto-coach", sid, Math.floor(clock / 60000)], (r, k) =>
          r.coach(sid, k),
        )
        .then((result) => {
          if (result) {
            setCoach(result);
            setCoachPaused(false);
          } else setCoachPaused(true);
        });
    }
    if (
      session.mode === "facilitator" &&
      listening &&
      !stopped &&
      !muted &&
      !deferredLine
    ) {
      const topic = definition.agenda.find(
        (a) => a.id === session.currentTopicId,
      );
      const turn = automaticFacilitatorTurn(
        {
          now: clock,
          lastHumanAt: lastWordsAt.current,
          lastPlaybackEnd: lastPlaybackEnd.current,
          playbackActive: playbackActive.current,
          hasLine: !!line,
          topicId: session.currentTopicId,
          timeboxEnded: !!(
            topic &&
            session.topicStartedAt &&
            clock - Date.parse(session.topicStartedAt) >= topic.minutes * 60000
          ),
        },
        autoTurnKeys.current,
      );
      if (turn) {
        autoTurnKeys.current.add(turn.key);
        void cmd
          .run(["auto-turn", sid, turn.key], (r, k) =>
            r.turn(sid, turn.trigger, k),
          )
          .then((result) => {
            if (result) {
              setLine(result.text);
              const nextLine = { id: newId(), text: result.text };
              if (roomVoiceAllowed.current) turns.queue(turn.trigger, nextLine);
              else setDeferredLine(nextLine);
            }
          });
      }
    }
  }, [
    clock,
    q.data,
    meeting.data,
    listening,
    stopped,
    muted,
    line,
    deferredLine,
  ]);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
      void turns.tick();
    }, 250);
    return () => {
      clearInterval(timer);
      turns.stop();
      void realtime.voice.dispose();
      void speech.stop();
      if (native.current) void native.current.stop();
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void speech.stop();
        setListening(false);
        turns.skip();
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (sid)
      loadAdvisorDraft<{ note: string; speaker: string }>(`live.${sid}`).then(
        (draft) => {
          if (draft) {
            setNote(draft.note);
            setSpeaker(draft.speaker);
          }
        },
      );
  }, [sid]);
  useEffect(() => {
    if (sid) void saveAdvisorDraft(`live.${sid}`, { note, speaker });
  }, [note, speaker, sid]);
  if (!sid) return <MissingSession id={id} />;
  if (q.isPending || meeting.isPending) return <LoadingState />;
  if (q.isError || meeting.isError)
    return (
      <ErrorState
        error={q.error ?? meeting.error}
        onRetry={() => {
          void q.refetch();
          void meeting.refetch();
        }}
      />
    );
  const s = q.data,
    m = meeting.data;
  if (!s.startedAt || s.consents.some((a) => a.state === "pending"))
    return (
      <Screen>
        <Heading>Consent is needed</Heading>
        <Notice>Check every attendee before you capture words.</Notice>
        <Button
          label="Check consent"
          kind="primary"
          onPress={() => go(sessionRoute(id, "consent", sid))}
        />
      </Screen>
    );
  const elapsed = Math.max(
      0,
      Math.floor((clock - Date.parse(s.startedAt)) / 1000),
    ),
    topic = m.agenda.find((a) => a.id === s.currentTopicId),
    topicElapsed = s.topicStartedAt
      ? Math.max(0, Math.floor((clock - Date.parse(s.topicStartedAt)) / 1000))
      : 0;
  const finish = async () => {
    turns.stop();
    realtime.realtime.suspend();
    setStopped(true);
    await speech.stop();
    setListening(false);
    if (native.current) {
      await native.current.stop();
      setRecording(false);
      try {
        await native.current.uploadPending();
      } catch {
        cmd.setError(
          new Error(
            "The recording is saved on this phone. Upload it before finishing.",
          ),
        );
        return;
      }
    }
    const result = await cmd.run(["finish", sid], async (r, k) => {
      await r.finish(sid, k);
      return true;
    });
    if (result) go(sessionRoute(id, "closing", sid));
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await speech.stop();
    setListening(false);
    const index = s.consents
      .filter((a) => a.state === "consented")
      .findIndex((a) => a.personKey === speaker);
    if (index < 0) {
      cmd.setError(new Error("Choose a consenting speaker first."));
      return;
    }
    const submitted = note.trim();
    const saved = await cmd.run(
      ["note", sid, submitted, speaker],
      async (r, k) => {
        await saveLiveNote(r, sid, submitted, speaker, elapsed * 1000, k);
        return true;
      },
    );
    if (saved) {
      setNote((current) => (current.trim() === submitted ? "" : current));
      speech.reset?.();
      message("Note saved for review.");
    }
  };
  const ask = async (trigger: "opening" | "leader_next" | "closing") => {
    const result = await cmd.run(["turn", sid, trigger, elapsed], (r, k) =>
      r.turn(sid, trigger, k),
    );
    if (result) {
      setLine(result.text);
      if (roomVoiceAllowed.current)
        turns.queue(trigger, { id: newId(), text: result.text });
      else setDeferredLine({ id: newId(), text: result.text });
    }
  };
  return (
    <Screen>
      <Heading>{m.title}</Heading>
      {simulatedVoice ? <Notice>{SIMULATED_VOICE_NOTICE}</Notice> : null}
      {realtimeSelected ? (
        <>
          <Notice tone={realtime.status === "ready" ? "sage" : "amber"}>
            Realtime room audio: {realtime.status}. {realtime.message}
          </Notice>
          <Notice>
            Room audio is sent to the voice provider while this input is on.
            Native recording and realtime input run separately.
          </Notice>
          <Text variant="small" color="muted">
            Estimated dispatch budget: ${(s.budgetCents / 100).toFixed(2)} ·
            Estimated reserved use: ${(s.spentCents / 100).toFixed(2)}. Actual
            provider cost may differ; failed requests can use the estimate.
          </Text>
        </>
      ) : null}
      {recording ? (
        <RecordingIndicator
          state={
            paused || native.current?.status === "paused"
              ? "paused"
              : "recording"
          }
          elapsedSeconds={elapsed}
        />
      ) : (
        <Notice tone="amber">
          {mock
            ? "Demo session · audio is not recorded"
            : "Recording is off · typed notes are available"}
        </Notice>
      )}
      <Text variant="meta" color="muted">
        {s.mode === "capture"
          ? "Capture"
          : s.mode === "copilot"
            ? "Copilot"
            : "Facilitator"}{" "}
        · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}{" "}
        elapsed
      </Text>
      {!allConsented ? (
        <Notice tone="amber">
          Everyone must consent before room audio is captured. You can keep
          typed notes from consenting people.
        </Notice>
      ) : null}
      {!mock && !recording && Platform.OS !== "web" ? (
        <Button
          label="Start audio recording"
          disabled={
            !allConsented ||
            realtime.realtime.inputActive ||
            realtime.status === "connecting" ||
            mediaBusy
          }
          onPress={async () => {
            if (
              !recordingAllowed.current ||
              mediaStarting.current ||
              realtime.realtime.inputActive ||
              realtime.status === "connecting"
            )
              return;
            mediaStarting.current = true;
            setMediaBusy(true);
            try {
              native.current ??= createNativeMeetingRecorder(sid, (input) =>
                getAdvisorRepository().uploadSegment(input),
              );
              await native.current.start();
              if (!recordingAllowed.current) {
                await native.current.stop();
                return;
              }
              setRecording(true);
              message("Recording started.");
            } catch (e) {
              setPaused(native.current?.status !== "recording");
              cmd.setError(e);
            } finally {
              mediaStarting.current = false;
              setMediaBusy(false);
            }
          }}
        />
      ) : null}
      {native.current?.error ? (
        <Notice tone="amber">
          {native.current.error} Resume recording when you are ready.
        </Notice>
      ) : null}
      {recording ? (
        <Button
          label={
            paused || native.current?.status === "paused"
              ? "Resume recording"
              : "Pause recording"
          }
          disabled={
            !allConsented ||
            realtime.realtime.inputActive ||
            realtime.status === "connecting" ||
            mediaBusy
          }
          onPress={async () => {
            if (
              !recordingAllowed.current ||
              mediaStarting.current ||
              realtime.realtime.inputActive ||
              realtime.status === "connecting"
            )
              return;
            mediaStarting.current = true;
            setMediaBusy(true);
            try {
              if (paused || native.current?.status === "paused")
                await native.current?.resume();
              else await native.current?.pause();
              if (!recordingAllowed.current) {
                await native.current?.stop();
                setRecording(false);
                return;
              }
              setPaused(native.current?.status === "paused");
            } catch (e) {
              cmd.setError(e);
            } finally {
              mediaStarting.current = false;
              setMediaBusy(false);
            }
          }}
        />
      ) : null}
      {topic ? (
        <>
          <SectionLabel>Current topic</SectionLabel>
          <Text variant="bodyStrong">{topic.title}</Text>
          <TimerRing
            elapsedSeconds={topicElapsed}
            totalSeconds={topic.minutes * 60}
          />
        </>
      ) : null}
      {s.mode === "copilot" ? (
        <CoachPanel
          title={topic?.title ?? "Meeting coach"}
          question={
            coach?.nextQuestion ??
            "Tap Suggest a question when you need a prompt."
          }
          stillNeeded={coach?.stillNeeded ?? m.power.outcomes}
          flags={coach?.flags ?? []}
          paused={coachPaused}
          onPark={() => setNote(topic?.title ?? "")}
        >
          <Button
            label="Suggest a question"
            style={{ flex: 1.4 }}
            full
            loading={cmd.busy}
            onPress={async () => {
              const result = await cmd.run(["coach", sid, elapsed], (r, k) =>
                r.coach(sid, k),
              );
              if (result) setCoach(result);
            }}
          />
        </CoachPanel>
      ) : null}
      {s.mode === "facilitator" ? (
        <Card tone="violet">
          <Text variant="bodyStrong">Facilitator</Text>
          <Notice>
            {deferredLine
              ? `The assistant wanted to ask: ${deferredLine.text}`
              : line || "The assistant waits for you to start the opening."}
          </Notice>
          <Notice>
            {stopped
              ? "AI stopped. Recording and notes continue."
              : muted
                ? "AI muted."
                : listening
                  ? "Room transcription is on. The assistant waits for a pause."
                  : "Voice is off. Turn on room transcription to detect speech safely."}
          </Notice>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              label={muted ? "Unmute AI" : "Mute AI"}
              onPress={() => {
                turns.mute(!muted);
                setMuted(!muted);
                void cmd.run(["ai-mute", sid, !muted], (repository, key) =>
                  repository.control(sid, muted ? "unmute" : "mute", key),
                );
              }}
            />
            {deferredLine ? (
              <>
                <Button
                  label="Say it now"
                  disabled={!listening || muted || stopped}
                  onPress={() => {
                    const next = deferredLine;
                    setDeferredLine(null);
                    void turns.sayNow(next);
                  }}
                />
                <Button
                  label="Dismiss"
                  onPress={() => {
                    turns.skip();
                    autoTurnKeys.current.add("opening");
                    playbackActive.current = false;
                    lastPlaybackEnd.current = null;
                    setDeferredLine(null);
                    setLine("");
                  }}
                />
              </>
            ) : null}
            <Button
              label="Skip"
              onPress={() => {
                turns.skip();
                playbackActive.current = false;
                lastPlaybackEnd.current = null;
                setDeferredLine(null);
                void cmd.run(["ai-skip", sid, clock], (repository, key) =>
                  repository.control(sid, "skip", key),
                );
              }}
            />
            <Button
              label="Stop AI"
              onPress={() => {
                turns.stop();
                realtime.realtime.suspend();
                setStopped(true);
                void saveAdvisorDraft(`ai-stopped.${sid}`, true).catch(
                  cmd.setError,
                );
                void cmd.run(["ai-stop", sid], (repository, key) =>
                  repository.control(sid, "stop", key),
                );
              }}
            />
            <Button
              label="Read opening"
              disabled={stopped}
              onPress={() => {
                autoTurnKeys.current.add("opening");
                void ask("opening");
              }}
            />
          </View>
        </Card>
      ) : null}
      <SectionLabel>Live transcript and notes</SectionLabel>
      <Button
        label="Update recording consent"
        onPress={async () => {
          turns.skip();
          realtime.realtime.suspend();
          await speech.stop();
          await native.current?.pause();
          go(sessionRoute(id, "consent", sid));
        }}
      />
      {s.transcript
        .filter((t) => !t.excluded)
        .map((t) => (
          <ListRow
            key={t.id}
            title={t.text}
            detail={`${speakerLabel(
              t.speakerCluster,
              s.transcript.map((v) => v.speakerCluster),
            )}${t.revision > 1 ? " · corrected" : ""}`}
          />
        ))}
      {!s.transcript.length ? (
        <Notice>No words saved yet. Choose a speaker and add a note.</Notice>
      ) : null}
      <Text variant="metaStrong">Who is speaking?</Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginVertical: 12,
        }}
      >
        {s.consents
          .filter((a) => a.state === "consented")
          .map((a) => (
            <Button
              key={a.personKey}
              label={`${speaker === a.personKey ? "✓ " : ""}${a.name}`}
              accessibilityState={{ selected: speaker === a.personKey }}
              onPress={() => setSpeaker(a.personKey)}
            />
          ))}
      </View>
      <Field
        label="Words to keep for review"
        value={note}
        onChange={(v) => {
          setNote(v);
          if (v) {
            turns.speechDetected();
            lastWordsAt.current = Date.now();
          }
        }}
      />
      <Button
        label={
          realtimeSelected
            ? listening
              ? "Stop realtime room audio"
              : "Start realtime room audio"
            : listening
              ? "Stop listening"
              : "Use voice for this note"
        }
        disabled={
          !allConsented ||
          mediaBusy ||
          !speaker ||
          (realtimeSelected
            ? !realtime.realtime.isAvailable ||
              (recording && native.current?.status === "recording") ||
              s.consents.some((c) => c.state !== "consented") ||
              stopped ||
              muted
            : speech.kind === "unavailable")
        }
        onPress={async () => {
          if (!recordingAllowed.current) return;
          if (listening) {
            realtime.realtime.suspend();
            await speech.stop();
            setListening(false);
            return;
          }
          if (mediaStarting.current) return;
          mediaStarting.current = true;
          setMediaBusy(true);
          turns.skip();
          speech.reset?.();
          try {
            if (realtimeSelected) {
              await realtime.voice.prepare(sid);
              if (!recordingAllowed.current) {
                realtime.realtime.suspend();
                return;
              }
              setListening(true);
              return;
            }
            await speech.start(
              { lang: "en-US" },
              {
                onText: (text) => {
                  if (!recordingAllowed.current) return;
                  setNote(text);
                  turns.speechDetected();
                  lastWordsAt.current = Date.now();
                },
                onError: () => {
                  setListening(false);
                  cmd.setError(
                    new Error("Voice stopped. Keep your words by typing."),
                  );
                },
              },
            );
            if (!recordingAllowed.current) {
              await speech.stop();
              return;
            }
            setListening(true);
          } catch (error) {
            cmd.setError(
              error instanceof Error
                ? error
                : new Error("Voice is unavailable. Type your note instead."),
            );
          } finally {
            mediaStarting.current = false;
            setMediaBusy(false);
          }
        }}
      />
      {realtimeSelected &&
      recording &&
      native.current?.status === "recording" ? (
        <Notice tone="amber">
          Pause native recording before starting realtime room audio. Resume
          recording after you stop realtime input.
        </Notice>
      ) : null}
      {realtimeSelected && s.consents.some((c) => c.state !== "consented") ? (
        <Notice tone="amber">
          Realtime room audio requires every attendee’s consent. Keep typed
          notes for consenting speakers instead.
        </Notice>
      ) : null}
      {speech.kind === "unavailable" && !realtimeSelected ? (
        <Notice>
          Device live transcription is unavailable here. Type instead.
        </Notice>
      ) : null}
      <Button
        label="Save note"
        disabled={!note.trim() || !speaker}
        loading={cmd.busy}
        onPress={addNote}
      />
      <Button
        label="Park this item"
        disabled={!note.trim()}
        onPress={async () => {
          const saved = await cmd.run(["park", sid, note], async (r, k) => {
            await r.park(sid, note, elapsed * 1000, k);
            return true;
          });
          if (saved) setNote("");
        }}
      />
      {mock ? (
        <Button
          label="Add fictional sample"
          onPress={() => {
            setSpeaker(
              s.consents.find((a) => a.state === "consented")?.personKey ?? "",
            );
            setNote(
              "We will delay the launch until Tuesday. Priya will get the carrier credentials by Monday.",
            );
          }}
        />
      ) : null}
      <SectionLabel>Parking lot</SectionLabel>
      <ParkedList
        items={s.parked.map((p) => ({
          id: p.id,
          title: p.text,
          time: `${Math.floor(p.atMs / 60000)} min`,
        }))}
      />
      <Button
        label="Next topic"
        onPress={async () => {
          if (s.mode === "facilitator") await ask("leader_next");
          const next =
            m.agenda[m.agenda.findIndex((a) => a.id === s.currentTopicId) + 1];
          await cmd.run(["topic", sid, next?.id], (r, k) =>
            r.topic(sid, next?.id ?? null, k),
          );
        }}
      />
      <Button
        label="Review closing"
        kind="primary"
        loading={cmd.busy}
        disabled={!s.transcript.length}
        onPress={finish}
      />
      {cmd.busy ? (
        <Notice>
          Preparing the review. Keep the app open while the server processes the
          recording.
        </Notice>
      ) : null}
      {cmd.error instanceof CompanionApiError &&
      ["COMMAND_PENDING", "REQUEST_TIMEOUT", "NETWORK_OFFLINE"].includes(
        cmd.error.code,
      ) ? (
        <Notice>
          The server may still be processing. Your recording is retained. Tap
          Review closing to check the same attempt.
        </Notice>
      ) : null}
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function ClosingScreen() {
  const id = useMeetingId(),
    sid = useSessionId(id),
    q = useAdvisorSession(sid),
    people = useAdvisorPeople(),
    cmd = useCommand();
  if (!sid) return <MissingSession id={id} />;
  if (q.isPending || people.isPending) return <LoadingState />;
  if (q.isError || people.isError)
    return <ErrorState error={q.error ?? people.error} onRetry={q.refetch} />;
  const names = Object.fromEntries(people.data.map((p) => [p.id, p.name]));
  return (
    <Screen>
      <Heading>Close the loop</Heading>
      <Text color="muted">
        Read these back. Each owner confirms their own item.
      </Text>
      {(
        [
          "decision",
          "action",
          "open_question",
          "contradiction",
          "task_card_delta",
          "responsibility_delta",
          "claim",
        ] as const
      ).map((kind) => {
        const items = q.data.proposals.filter((p) => p.kind === kind);
        return items.length ? (
          <View key={kind}>
            <SectionLabel>{kind.replace(/_/g, " ")}</SectionLabel>
            {items.map((p) => {
              const owner =
                p.body.kind === "action"
                  ? p.body.ownerPersonKey
                  : p.body.kind === "decision"
                    ? p.body.decidedByPersonKey
                    : p.body.kind === "open_question"
                      ? p.body.askPersonKey
                      : null;
              const confirmation = q.data.closing?.find(
                (c) => c.proposalId === p.id,
              );
              return (
                <Card key={p.id}>
                  <Text variant="bodyStrong">{proposalText(p)}</Text>
                  <Notice>
                    {owner
                      ? `For ${names[owner] ?? "the named owner"}`
                      : "Owner not stated. Keep this as a proposal."}
                  </Notice>
                  {p.body.kind === "action" ? (
                    <Text variant="meta">
                      Due: {p.body.due ?? "Not stated"}
                    </Text>
                  ) : null}
                  {owner ? (
                    <ClosingResponse
                      key={`${p.id}:${p.version}:${p.hash}`}
                      busy={cmd.busy}
                      onRespond={(state, note) =>
                        cmd.run(
                          [
                            "confirm",
                            sid,
                            p.id,
                            state,
                            owner,
                            p.version,
                            p.hash,
                            note,
                          ],
                          (r, k) =>
                            r.confirm(
                              sid,
                              {
                                proposalId: p.id,
                                ownerPersonKey: owner,
                                confirmation: state,
                                expectedVersion: p.version,
                                contentHash: p.hash,
                                ...(note ? { note } : {}),
                              },
                              k,
                            ),
                        )
                      }
                    />
                  ) : null}
                  {confirmation ? (
                    <Notice tone="sage">
                      {confirmation.confirmation === "confirmed"
                        ? "Confirmed by the owner"
                        : confirmation.confirmation === "changed"
                          ? "Change requested. Keep this proposed."
                          : "Not this person’s action. Keep this proposed."}
                    </Notice>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ) : null;
      })}
      <ParkedList
        items={q.data.parked.map((p) => ({ id: p.id, title: p.text }))}
      />
      <Notice>
        Missing owners, dates and unresolved questions remain proposals. Follow
        up with the named people.
      </Notice>
      <Button
        label="Finish and review sources"
        kind="primary"
        onPress={() => go(sessionRoute(id, "speakers", sid))}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function SpeakersScreen() {
  const id = useMeetingId(),
    sid = useSessionId(id),
    q = useAdvisorSession(sid),
    [map, setMap] = useState<SpeakerMap | null>(null),
    cmd = useCommand();
  if (!sid) return <MissingSession id={id} />;
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const current = map ?? q.data.speakerMap,
    candidates = q.data.consents.filter((a) => a.state === "consented");
  return (
    <Screen>
      <Heading>Who said what?</Heading>
      <Text color="muted">
        Match each speaker to a person. Leave them unknown if you are unsure.
      </Text>
      {current.entries.map((entry) => (
        <Card key={entry.cluster}>
          <Text variant="bodyStrong">
            {speakerLabel(
              entry.cluster,
              current.entries.map((v) => v.cluster),
            )}
          </Text>
          <Notice>
            {q.data.transcript.find((t) => t.speakerCluster === entry.cluster)
              ?.text ?? "No excerpt available."}
          </Notice>
          {[{ personKey: null, name: "Unknown speaker" }, ...candidates].map(
            (a) => (
              <ListRow
                key={a.personKey ?? "unknown"}
                title={a.name}
                selected={entry.personKey === a.personKey}
                onPress={() =>
                  setMap({
                    sessionId: sid,
                    entries: current.entries.map((v) =>
                      v.cluster === entry.cluster
                        ? {
                            ...v,
                            personKey: a.personKey,
                            suggested: false,
                            confirmedBy: "leader",
                          }
                        : v,
                    ),
                  })
                }
              />
            ),
          )}
        </Card>
      ))}
      <Notice>
        Unknown speakers can support notes. Their words cannot establish who
        owns a claim.
      </Notice>
      <Button
        label="Confirm speaker map"
        kind="primary"
        loading={cmd.busy}
        onPress={async () => {
          const result = await cmd.run(["speakers", sid, current], (r, k) =>
            r.speakers(
              sid,
              {
                ...current,
                entries: current.entries.map((e) => ({
                  ...e,
                  confirmedBy: "leader",
                })),
              },
              k,
            ),
          );
          if (result) go(sessionRoute(id, "results", sid));
        }}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}

export function ResultsScreen() {
  const id = useMeetingId(),
    sid = useSessionId(id),
    q = useAdvisorSession(sid),
    people = useAdvisorPeople(),
    cmd = useCommand();
  const playback = useSourcePlayback();
  const [editing, setEditing] = useState<MeetingProposal | null>(null),
    [edit, setEdit] = useState(""),
    [editOwner, setEditOwner] = useState(""),
    [editDue, setEditDue] = useState(""),
    [sourcesChecked, setSourcesChecked] = useState(false),
    [exported, setExported] = useState(""),
    [followup, setFollowup] = useState<string | null>(null);
  if (!sid) return <MissingSession id={id} />;
  if (q.isPending || people.isPending) return <LoadingState />;
  if (q.isError || people.isError)
    return <ErrorState error={q.error ?? people.error} onRetry={q.refetch} />;
  const names = Object.fromEntries([
    ...people.data.map((p) => [p.id, p.name]),
    ...q.data.consents.map((p) => [p.personKey, p.name]),
  ]);
  const saveEdit = async () => {
    if (!editing) return;
    const b = editing.body;
    let body: MeetingProposal["body"] =
      b.kind === "decision"
        ? { ...b, decision: edit }
        : b.kind === "action"
          ? {
              ...b,
              what: edit,
              ownerPersonKey: editOwner || null,
              due: editDue
                ? new Date(parseLocalDate(editDue)).toISOString()
                : null,
            }
          : b.kind === "open_question"
            ? { ...b, question: edit }
            : b.kind === "claim"
              ? { ...b, value: edit }
              : b.kind === "task_card_delta"
                ? { ...b, to: edit }
                : b.kind === "responsibility_delta"
                  ? { ...b, duty: edit }
                  : { ...b, claimA: { ...b.claimA, text: edit } };
    const revised = sourcesChecked
      ? {
          ...editing,
          sources: editing.sources.map((ref) => {
            const segment = q.data.transcript.find(
              (t) => t.id === ref.segmentId,
            );
            return segment
              ? {
                  ...ref,
                  revision: segment.revision,
                  quote: segment.text,
                  speakerCluster: segment.speakerCluster,
                  personKey:
                    q.data.speakerMap.entries.find(
                      (e) =>
                        e.cluster === segment.speakerCluster && e.confirmedBy,
                    )?.personKey ?? null,
                }
              : ref;
          }),
        }
      : editing;
    const result = await cmd.run(
      [
        "edit",
        editing.id,
        editing.version,
        editing.hash,
        body,
        revised.sources,
      ],
      (r, k) => r.decide(revised, "edit", k, body),
    );
    if (result) setEditing(null);
  };
  return (
    <Screen>
      <Heading>Meeting results</Heading>
      <Notice>
        Review the source before accepting a proposal. Nothing is applied by
        itself.
      </Notice>
      <Button
        label="Check speaker map"
        onPress={() => go(sessionRoute(id, "speakers", sid))}
      />
      {!q.data.proposals.length ? (
        <Notice>
          No proposals yet. Keep your evidence and return after extraction.
        </Notice>
      ) : null}
      {q.data.proposals.map((p) => (
        <View key={p.id}>
          <ProposalEvidenceCard
            proposal={{
              ...p,
              sources: p.sources.map((ref) => ({
                ...ref,
                personKey:
                  q.data.speakerMap.entries.find(
                    (e) => e.cluster === ref.speakerCluster && e.confirmedBy,
                  )?.personKey ?? null,
              })),
            }}
            people={names}
            busy={cmd.busy}
            sourceTimes={Object.fromEntries(
              q.data.transcript.map((t) => [t.id, t.startMs]),
            )}
            onSource={(segmentId) => {
              const segment = q.data.transcript.find((t) => t.id === segmentId);
              if (segment)
                void playback.play(
                  sid,
                  segment.startMs,
                  segment.source === "batch",
                );
            }}
            onDecide={(decision) =>
              cmd.run(["decision", p.id, p.version, p.hash, decision], (r, k) =>
                r.decide(p, decision, k),
              )
            }
            onEdit={() => {
              setEditing(p);
              setEdit(proposalText(p));
              setEditOwner(
                p.body.kind === "action" ? (p.body.ownerPersonKey ?? "") : "",
              );
              setEditDue(p.body.kind === "action" ? (p.body.due ?? "") : "");
              setSourcesChecked(false);
            }}
          />
          {p.kind === "open_question" ? (
            <Button
              label="Send as follow-up question"
              onPress={() => setFollowup(p.id)}
            />
          ) : null}
        </View>
      ))}
      {editing ? (
        <Card>
          <Text variant="bodyStrong">Edit proposal wording</Text>
          <Field label="Proposal wording" value={edit} onChange={setEdit} />
          {editing.body.kind === "action" ? (
            <>
              <SectionLabel>Action owner</SectionLabel>
              {q.data.consents
                .filter((p) => p.state === "consented")
                .map((p) => (
                  <ListRow
                    key={p.personKey}
                    title={p.name}
                    selected={editOwner === p.personKey}
                    onPress={() =>
                      setEditOwner(editOwner === p.personKey ? "" : p.personKey)
                    }
                  />
                ))}
              <Field
                label="Due date (optional)"
                placeholder="YYYY-MM-DD"
                value={editDue}
                onChange={setEditDue}
                multiline={false}
              />
            </>
          ) : null}
          <SectionLabel>Current source</SectionLabel>
          {editing.sources.map((ref) => (
            <Notice key={ref.segmentId}>
              {q.data.transcript.find((t) => t.id === ref.segmentId)?.text ??
                "Source is unavailable."}
            </Notice>
          ))}
          <Button
            label={
              sourcesChecked
                ? "✓ Current sources checked"
                : "Use the current sources"
            }
            onPress={() => setSourcesChecked(!sourcesChecked)}
          />
          <Button
            label="Save proposed wording"
            kind="primary"
            disabled={
              !edit.trim() ||
              (editing.state === "stale" && !sourcesChecked) ||
              (!!editDue && !Number.isFinite(parseLocalDate(editDue)))
            }
            loading={cmd.busy}
            onPress={saveEdit}
          />
          <Button label="Cancel edit" onPress={() => setEditing(null)} />
        </Card>
      ) : null}
      {playback.playing ? (
        <Button label="Stop source audio" onPress={playback.stop} />
      ) : null}
      {playback.error ? <Notice tone="amber">{playback.error}</Notice> : null}
      {followup ? (
        <Card>
          <Text variant="bodyStrong">Who should answer?</Text>
          {people.data.map((p) => (
            <Button
              key={p.id}
              label={p.name}
              onPress={async () => {
                const result = await cmd.run(
                  ["followup", followup, p.id],
                  async (r, k) => {
                    await r.followUp(followup, p.id, k);
                    return true;
                  },
                );
                if (result) {
                  setFollowup(null);
                  message("Follow-up proposed.");
                }
              }}
            />
          ))}
        </Card>
      ) : null}
      <Button
        label="Return to owner confirmations"
        onPress={() => go(sessionRoute(id, "closing", sid))}
      />
      {q.data.parked.length ? (
        <SectionLabel>Parked follow-up questions</SectionLabel>
      ) : null}
      {q.data.parked.map((p) => (
        <View key={p.id}>
          <ListRow
            title={p.text}
            detail={`${Math.floor(p.atMs / 60000)} minutes into the meeting`}
          />
          <Button
            label="Send as follow-up question"
            onPress={() => setFollowup(p.id)}
          />
        </View>
      ))}
      <SectionLabel>Export for review</SectionLabel>
      <Button
        label="Export results"
        loading={cmd.busy}
        onPress={async () => {
          const result = await cmd.run(["export", sid], (r) => r.export(sid));
          if (result)
            setExported(
              `${result.markdown}\n\nJSON\n${JSON.stringify(result.json, null, 2)}`,
            );
        }}
      />
      {exported ? (
        <>
          <Field
            label="Meeting export"
            value={exported}
            onChange={setExported}
            maxLength={200000}
          />
          {Platform.OS !== "web" ? (
            <Button
              label="Share export"
              onPress={() => void Share.share({ message: exported })}
            />
          ) : null}
          <Notice>
            Copy or share the export for the DutyGraph team. This does not
            change company records.
          </Notice>
        </>
      ) : null}
      <CommandError error={cmd.error} />
    </Screen>
  );
}
