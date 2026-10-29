import React, { useCallback, useState } from "react";
import { Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  Button,
  Card,
  Heading,
  LoadingState,
  Screen,
  SectionLabel,
  Text,
} from "@/components/common";
import { useEarnRepository, type EarnRepository } from "@/api/earn";
import type {
  Claim,
  EarnSummary,
  Fix,
  Gap,
  TaskCardDraft,
  TeamBoard,
  SlotKey,
  TaskCardDraftInput,
} from "@/api/earn/types";
import { useMe } from "@/hooks/queries";
import { useEarnCommand, useEarnResource } from "./hooks";
import { EarnError, EarnOff, Field, PayAmount, Row } from "./Parts";
import {
  claimLabel,
  claimReason,
  dateLabel,
  draftReason,
  fixLabel,
  GAP_LABELS,
  paidCardCount,
  parseHours,
  slotMissing,
  SLOT_LABELS,
  teamRows,
} from "./logic";
import { EarnTaskCardView } from "./TaskCardView";
import { VoiceField } from "./VoiceField";
import { EARN_PROMPTS, FIND_MORE_QUESTIONS } from "./prompts";

function useRepo(injected?: EarnRepository) {
  const regular = useEarnRepository();
  return injected ?? regular;
}
function Frame({
  repo,
  title,
  children,
}: {
  repo: EarnRepository;
  title: string;
  children: React.ReactNode;
}) {
  const capability = useEarnResource(
    useCallback(() => repo.supportsDraftCreation(), [repo]),
  );
  return (
    <Screen>
      <Button
        label="Back"
        kind="link"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/me")
        }
      />
      <Heading>{title}</Heading>
      {capability.data === null && !capability.error ? (
        <LoadingState label="Opening this connection…" />
      ) : (
        <>
          {capability.data === true && (
            <Card tone="amber">
              <Text>Local development data. No real money moves.</Text>
            </Card>
          )}
          {children}
        </>
      )}
    </Screen>
  );
}
function nav(path: string) {
  router.push(path as "/earn");
}
export function EarnEntry() {
  const repo = useRepo();
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  return (
    <View>
      <SectionLabel>Your work</SectionLabel>
      <Row
        label="From your AI"
        detail="Check the Task Card drafts sent for you"
        onPress={() => nav("/earn/drafts")}
      />
      <Row
        label="Connect your AI"
        detail="Copy one link so ChatGPT or Claude sends your Task Cards"
        onPress={() => nav("/earn/connect")}
      />
      <Row
        label="Company files"
        detail="Browse the files your company shares with the team"
        onPress={() => nav("/files")}
      />
      <Row
        label="Find the gaps"
        detail="Suggest a fix where work waits or breaks"
        onPress={() => nav("/earn/gaps")}
      />
      {summary.data?.settings.enabled && (
        <>
          <Row
            label="Scoreboard"
            detail="Your cards, checked time saved and team counts"
            onPress={() => nav("/earn/scoreboard")}
          />
          <Row
            label="Earn"
            detail="Your company rules and prompts"
            onPress={() => nav("/earn/rules")}
          />
        </>
      )}
    </View>
  );
}
export function EarnHomeScreen({
  repository,
}: {
  repository?: EarnRepository;
}) {
  const repo = useRepo(repository);
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  return (
    <Frame repo={repo} title="Your work">
      <Row label="From your AI" onPress={() => nav("/earn/drafts")} />
      <Row label="Connect your AI" onPress={() => nav("/earn/connect")} />
      <Row label="Find the gaps" onPress={() => nav("/earn/gaps")} />
      {summary.data?.settings.enabled && (
        <>
          <Row label="Scoreboard" onPress={() => nav("/earn/scoreboard")} />
          <Row label="Earn" onPress={() => nav("/earn/rules")} />
          <Row label="Say a task out loud" onPress={() => nav("/earn/say")} />
        </>
      )}
      {summary.error ? (
        <EarnError error={summary.error} retry={summary.reload} />
      ) : !summary.data ? (
        <LoadingState label="Loading your work…" />
      ) : !summary.data.settings.enabled ? (
        <EarnOff />
      ) : null}
    </Frame>
  );
}
function FixRows({
  fixes,
  note,
  enabled,
}: {
  fixes: Fix[];
  note: string;
  enabled: boolean;
}) {
  return (
    <>
      {fixes.length === 0 ? (
        <Text color="muted">No fixes sent yet.</Text>
      ) : (
        fixes.map((fix) => (
          <Card level="surface" key={fix.id}>
            <Text variant="bodyStrong">{fix.text}</Text>
            <Text>{fixLabel(fix.state)}</Text>
            <Text>
              {fix.hoursBefore} → {fix.hoursAfterChecked ?? fix.hoursAfter}{" "}
              hours a week
              {fix.hoursAfterChecked === undefined
                ? " (proposed)"
                : " (checked)"}
            </Text>
            <Text variant="meta" color="muted">
              Check date: {dateLabel(fix.checkDueAt)}
            </Text>
            {fix.bonusCents !== undefined && enabled && (
              <PayAmount cents={fix.bonusCents} note={note} />
            )}
            {!!fix.reason && <Text>{fix.reason}</Text>}
          </Card>
        ))
      )}
    </>
  );
}
function ClaimRows({ claims, note, maxPaidCards }: { claims: Claim[]; note: string; maxPaidCards: number | null }) {
  return (
    <>
      {claims.length === 0 ? (
        <Text color="muted">No card claims yet.</Text>
      ) : (
        claims.map((claim) => (
          <Card level="surface" key={claim.id}>
            <Text variant="bodyStrong">{claim.title}</Text>
            <Text>{claimLabel(claim.state)}</Text>
            <PayAmount cents={claim.amountCents} note={note} />
            {claim.state === "not_paid" && <Text>{claimReason(claim, maxPaidCards)}</Text>}
            {!!claim.askAgainNote && (
              <Text>Your Ask again note: {claim.askAgainNote}</Text>
            )}
          </Card>
        ))
      )}
    </>
  );
}
export function EarnScoreboardScreen({
  repository,
}: {
  repository?: EarnRepository;
}) {
  const repo = useRepo(repository);
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  const board = useEarnResource(useCallback(() => repo.getTeamBoard(), [repo]));
  return (
    <Frame repo={repo} title="Scoreboard">
      {summary.error ? (
        <EarnError error={summary.error} retry={summary.reload} />
      ) : !summary.data ? (
        <LoadingState label="Loading your scoreboard…" />
      ) : !summary.data.settings.enabled ? (
        <EarnOff />
      ) : (
        <>
          <Card>
            <Text variant="metaStrong">Earned · paid</Text>
            <PayAmount
              cents={summary.data.me.earnedPaidCents}
              note={summary.data.settings.payRulesNote}
            />
            <Text variant="metaStrong">Waiting for the check</Text>
            <PayAmount
              cents={summary.data.me.earnedWaitingCents}
              note={summary.data.settings.payRulesNote}
            />
          </Card>
          <Card>
            <Text variant="metaStrong">Time saved</Text>
            <Text variant="title">
              {summary.data.me.hoursSavedPerWeek} hours a week
            </Text>
            <Text variant="small" color="muted">
              From fixes with a finished check.
            </Text>
          </Card>
          <Text>
            {paidCardCount(
              summary.data.me.paidCards,
              summary.data.me.maxPaidCards,
            )}
          </Text>
          <SectionLabel>My cards</SectionLabel>
          <ClaimRows
            maxPaidCards={summary.data.me.maxPaidCards}
            claims={summary.data.claims}
            note={summary.data.settings.payRulesNote}
          />
          <SectionLabel>My fixes</SectionLabel>
          <FixRows
            fixes={summary.data.fixes}
            note={summary.data.settings.payRulesNote}
            enabled
          />
        </>
      )}
      <SectionLabel>Team</SectionLabel>
      {board.error ? (
        <EarnError error={board.error} retry={board.reload} />
      ) : !board.data ? (
        <LoadingState label="Loading team counts…" />
      ) : (
        <TeamRows board={board.data} />
      )}
    </Frame>
  );
}
export function TeamRows({ board }: { board: TeamBoard }) {
  return (
    <>
      <Text>Team total: {board.teamTotalCards} Task Cards written</Text>
      {board.rows.length === 0 ? (
        <Text color="muted">No team counts yet.</Text>
      ) : (
        teamRows(board).map((person) => (
          <Row
            key={person.personId}
            label={person.name}
            detail={`${person.confirmedCards} cards · ${person.fixes} fixes`}
          />
        ))
      )}
    </>
  );
}
export function EarnDraftsScreen({
  repository,
}: {
  repository?: EarnRepository;
}) {
  const repo = useRepo(repository);
  const waiting = useEarnResource(
    useCallback(() => repo.listDrafts("waiting"), [repo]),
  );
  const confirmed = useEarnResource(
    useCallback(() => repo.listDrafts("confirmed"), [repo]),
  );
  return (
    <Frame repo={repo} title="From your AI">
      <Text>Your AI's words stay drafts until you confirm them.</Text>
      <SectionLabel>Waiting drafts</SectionLabel>
      {waiting.error ? (
        <EarnError error={waiting.error} retry={waiting.reload} />
      ) : !waiting.data ? (
        <LoadingState label="Loading your drafts…" />
      ) : waiting.data.drafts.length === 0 ? (
        <Text>
          No drafts waiting. You can send more from your AI or the web app.
        </Text>
      ) : (
        waiting.data.drafts.map((draft) => (
          <Row
            key={draft.id}
            label={draft.card.title}
            detail={`${draft.via === "mcp" ? "Your AI" : draft.via === "upload" ? "Your file" : "Typed here"} · ${slotMissing(draft.card, "howOften") ? "Not stated" : draft.card.slots.howOften.value} · ${slotMissing(draft.card, "howLong") ? "Not stated" : draft.card.slots.howLong.value} · ${draft.checks.readyToHandOff ? "Ready to hand off" : `${draft.checks.emptySlots.length} slots to fill`}`}
            onPress={() => nav(`/earn/drafts/${encodeURIComponent(draft.id)}`)}
          />
        ))
      )}
      <SectionLabel>Confirmed cards</SectionLabel>
      {confirmed.error ? (
        <EarnError error={confirmed.error} retry={confirmed.reload} />
      ) : !confirmed.data ? (
        <LoadingState label="Loading confirmed cards…" />
      ) : confirmed.data.drafts.length === 0 ? (
        <Text>No cards confirmed here yet.</Text>
      ) : (
        confirmed.data.drafts.map((draft) => (
          <Row
            key={draft.id}
            label={draft.card.title}
            detail="Confirmed"
            onPress={() => nav(`/earn/drafts/${encodeURIComponent(draft.id)}`)}
          />
        ))
      )}
    </Frame>
  );
}
function DraftRun({
  id,
  repository,
  onReload,
}: {
  id: string;
  repository?: EarnRepository;
  onReload: () => void;
}) {
  const repo = useRepo(repository);
  const detail = useEarnResource(
    useCallback(() => repo.getDraft(id), [repo, id]),
  );
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  const me = useMe();
  const command = useEarnCommand();
  const [receipt, setReceipt] = useState<TaskCardDraft | null>(null);
  const [reviewCard, setReviewCard] = useState<TaskCardDraftInput | null>(null);
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);
  useFocusEffect(
    useCallback(() => {
      setReceipt(null);
      setReviewCard(null);
      setActiveSlot(null);
    }, []),
  );
  const draft = receipt ?? detail.data;
  const reload = onReload;
  const waiting =
    draft?.state === "waiting" && Date.parse(draft.expiresAt) > Date.now();
  return (
    <Frame repo={repo} title="Task Card draft">
      {detail.error ? (
        <EarnError error={detail.error} retry={reload} />
      ) : !draft ? (
        <LoadingState label="Opening your draft…" />
      ) : (
        <>
          <Text>Draft state: {draft.state.replaceAll("_", " ")}</Text>
          <EarnTaskCardView
            key={`${draft.id}:${draft.version}`}
            card={reviewCard ?? draft.card}
            checks={
              summary.data?.settings.enabled !== true
                ? { ...draft.checks, earnHint: "off", earnHintReasons: [] }
                : draft.checks
            }
            name={me.data?.displayName ?? "You"}
            payRulesNote={summary.data?.settings.payRulesNote}
            onAddSlot={
              waiting
                ? (slot) => {
                    setReviewCard(
                      (card) => card ?? structuredClone(draft.card),
                    );
                    setActiveSlot(slot);
                  }
                : undefined
            }
            editDisabled={command.busy || command.conflict}
          />
          {reviewCard && (
            <Text color="amber">
              These details are not saved yet. Saved checks may change when you
              confirm.
            </Text>
          )}
          {waiting && activeSlot && reviewCard && (
            <Card>
              <Field
                label={`${SLOT_LABELS[activeSlot]} detail`}
                value={
                  reviewCard.slots[activeSlot].basis === "not_stated"
                    ? ""
                    : (reviewCard.slots[activeSlot].value ?? "")
                }
                multiline
                maxLength={3000}
                editable={!command.busy && !command.conflict}
                onChangeText={(value) =>
                  setReviewCard((card) =>
                    card
                      ? {
                          ...card,
                          slots: {
                            ...card.slots,
                            [activeSlot]: {
                              value: value.trim() ? value : null,
                              basis: value.trim() ? "told_me" : "not_stated",
                            },
                          },
                        }
                      : card,
                  )
                }
              />
              <Text variant="small" color="muted">
                You told it. This detail is sent only when you confirm the card.
              </Text>
              <Button
                label="Done adding detail"
                disabled={command.busy || command.conflict}
                onPress={() => setActiveSlot(null)}
              />
            </Card>
          )}
          {waiting && (
            <>
              <Text>
                Confirming sends this card for manager review. It does not
                approve a payment.
              </Text>
              <Button
                label="Confirm"
                kind="primary"
                loading={command.busy}
                disabled={command.conflict}
                onPress={() =>
                  void command.run(
                    {
                      operation: `draft:${id}:confirm`,
                      body: { expectedVersion: draft.version, ...(reviewCard ? { card: reviewCard } : {}) },
                    },
                    (key) =>
                      repo.confirmDraft(
                        id,
                        draft.version,
                        key,
                        reviewCard ?? undefined,
                      ),
                    (value) => {
                      setReviewCard(null);
                      setActiveSlot(null);
                      setReceipt(value.draft);
                      detail.reload();
                    },
                  )
                }
              />
              <Button
                label="Not mine"
                loading={command.busy}
                disabled={command.conflict}
                onPress={() =>
                  void command.run(
                    { operation: `draft:${id}:not_mine`, body: { expectedVersion: draft.version } },
                    (key) => repo.notMine(id, draft.version, key),
                    (value) => {
                      setReviewCard(null);
                      setActiveSlot(null);
                      setReceipt(value);
                      detail.reload();
                    },
                  )
                }
              />
            </>
          )}
          {!!command.error && (
            <Text accessibilityRole="alert" color="red">
              {command.error}
            </Text>
          )}
          {command.conflict && (
            <Button label="Reload changed card" onPress={reload} />
          )}
          <Button
            label="Reload card"
            kind="link"
            disabled={command.busy}
            onPress={reload}
          />
        </>
      )}
    </Frame>
  );
}
export function EarnDraftScreen({
  id,
  repository,
}: {
  id: string;
  repository?: EarnRepository;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <DraftRun
      key={`${id}:${revision}`}
      id={id}
      repository={repository}
      onReload={() => setRevision((n) => n + 1)}
    />
  );
}
export function EarnRulesScreen({
  repository,
}: {
  repository?: EarnRepository;
}) {
  const repo = useRepo(repository);
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  const [copyMessage, setCopyMessage] = useState("");
  const copy = async (text: string) => {
    try {
      if (await Clipboard.setStringAsync(text)) setCopyMessage("Copied.");
      else setCopyMessage("Copy did not work. Use Share instead.");
    } catch {
      setCopyMessage("Copy did not work. Use Share instead.");
    }
  };
  return (
    <Frame repo={repo} title="Earn">
      {summary.error ? (
        <EarnError error={summary.error} retry={summary.reload} />
      ) : !summary.data ? (
        <LoadingState label="Loading company rules…" />
      ) : !summary.data.settings.enabled ? (
        <EarnOff />
      ) : (
        <>
          <Text>Earn for each Task Card your manager approves.</Text>
          <PayAmount
            cents={summary.data.settings.perCardCents}
            note={summary.data.settings.payRulesNote}
          />
          <Text>
            {paidCardCount(
              summary.data.me.paidCards,
              summary.data.me.maxPaidCards,
            )}
          </Text>
          <Card>
            <Text>Pool left</Text>
            <PayAmount
              cents={summary.data.settings.poolLeftCents}
              note={summary.data.settings.payRulesNote}
            />
            {summary.data.settings.poolFunding.state !== "funded" && (
              <Text>Pool not funded yet</Text>
            )}
            <Text variant="small" color="muted">
              Your company pays through its payroll. DutyGraph does not pay you.
            </Text>
          </Card>
          <Button
            label="Say a task out loud"
            onPress={() => nav("/earn/say")}
          />
          <SectionLabel>What earns and what does not</SectionLabel>
          {[
            "Link the card to your role, duty and department goal.",
            "Describe work that serves your team. General email, meetings and admin do not earn.",
            "Show what the task changes for the team.",
            "Do not copy a card that is already mapped. Extra details can be merged without a second payment.",
            "Fill the missing details. Confirm the draft. Your manager decides, within the company pool.",
          ].map((line) => (
            <Text key={line}>{line}</Text>
          ))}
          <Text>
            “Email the daily rate sheet to our 12 key carriers” can earn.
            “Answer my emails” does not.
          </Text>
          <SectionLabel>Prompts to find more work</SectionLabel>
          {EARN_PROMPTS.map((prompt) => (
            <Card key={prompt.title}>
              <Text variant="bodyStrong">{prompt.title}</Text>
              <Text selectable>{prompt.text}</Text>
              <Button
                label={`Copy ${prompt.title}`}
                onPress={() => void copy(prompt.text)}
              />
              <Button
                label={`Share ${prompt.title}`}
                onPress={() =>
                  void Share.share({ message: prompt.text }).catch(() =>
                    setCopyMessage("Share did not open. Try Copy."),
                  )
                }
              />
            </Card>
          ))}
          {!!copyMessage && (
            <Text accessibilityLiveRegion="polite">{copyMessage}</Text>
          )}
          {FIND_MORE_QUESTIONS.map((question, i) => (
            <Card key={question}>
              <Text>
                {i + 1}. {question}
              </Text>
              <Button
                label={`Copy question ${i + 1}`}
                onPress={() => void copy(question)}
              />
              <Button
                label={`Share question ${i + 1}`}
                onPress={() =>
                  void Share.share({ message: question }).catch(() =>
                    setCopyMessage("Share did not open. Try Copy."),
                  )
                }
              />
            </Card>
          ))}
          <SectionLabel>My cards</SectionLabel>
          <ClaimRows
            maxPaidCards={summary.data.me.maxPaidCards}
            claims={summary.data.claims}
            note={summary.data.settings.payRulesNote}
          />
        </>
      )}
    </Frame>
  );
}
export function EarnGapsScreen({
  repository,
}: {
  repository?: EarnRepository;
}) {
  const repo = useRepo(repository);
  const gaps = useEarnResource(useCallback(() => repo.getGaps(), [repo]));
  const summary = useEarnResource(useCallback(() => repo.getSummary(), [repo]));
  const [filter, setFilter] = useState<string>("all"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [form, setForm] = useState(false),
    [lesson, setLesson] = useState(true),
    [sent, setSent] = useState("");
  const [text, setText] = useState(""),
    [kind, setKind] = useState<"new_steps" | "agent" | "tool" | "more_people">(
      "new_steps",
    ),
    [measure, setMeasure] = useState(""),
    [before, setBefore] = useState(""),
    [hoursBefore, setHoursBefore] = useState(""),
    [hoursAfter, setHoursAfter] = useState("");
  const [inputError, setInputError] = useState("");
  const command = useEarnCommand();
  const selected = gaps.data?.gaps.find((gap) => gap.id === selectedId) ?? null;
  const choose = (gap: Gap) => {
    setSelectedId(gap.id);
    setForm(false);
    setSent("");
    setInputError("");
    setText("");
    setMeasure(gap.measure?.name || "");
    setBefore(gap.measure?.today || "");
    setHoursBefore("");
    setHoursAfter("");
  };
  const submit = () => {
    try {
      if (!selected || !text.trim() || !measure.trim())
        throw new Error("Describe the change and the measured number.");
      const body = {
        gapId: selected.id,
        text: text.trim(),
        kind,
        measureName: measure.trim(),
        ...(before.trim() ? { measureBefore: before.trim() } : {}),
        hoursBefore: parseHours(hoursBefore),
        hoursAfter: parseHours(hoursAfter),
      };
      setInputError("");
      void command.run(
        { operation: "fix:create", body },
        (key) => repo.createFix(body, key),
        () => {
          setSent("Fix sent. Your manager can review it.");
          setForm(false);
          summary.reload();
          gaps.reload();
        },
      );
    } catch (e) {
      setInputError((e as Error).message);
    }
  };
  return (
    <Frame repo={repo} title="Find the gaps">
      {lesson && (
        <Card>
          <Text variant="bodyStrong">How to spot a bottleneck</Text>
          {[
            "Find where work piles up.",
            "Do not speed up the other steps first.",
            "Keep the slow step busy.",
            "Then add help.",
          ].map((line, i) => (
            <Text key={line}>
              {i + 1}. {line}
            </Text>
          ))}
          <Button
            label="Close lesson"
            kind="link"
            onPress={() => setLesson(false)}
          />
        </Card>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Button
          label="All gaps"
          disabled={filter === "all"}
          onPress={() => setFilter("all")}
        />
        {Object.entries(GAP_LABELS).map(([value, label]) => (
          <Button
            key={value}
            label={label}
            disabled={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>
      {gaps.error ? (
        <EarnError error={gaps.error} retry={gaps.reload} />
      ) : !gaps.data ? (
        <LoadingState label="Loading gaps…" />
      ) : gaps.data.gaps.filter(
          (gap) => filter === "all" || gap.kind === filter,
        ).length === 0 ? (
        <Text>No gaps match this view.</Text>
      ) : (
        gaps.data.gaps
          .filter((gap) => filter === "all" || gap.kind === filter)
          .map((gap) => (
            <Row
              key={gap.id}
              label={gap.title}
              detail={`${GAP_LABELS[gap.kind]} · ${gap.department || "No department stated"}`}
              onPress={() => choose(gap)}
            />
          ))
      )}
      {selected && (
        <Card>
          <Text variant="title" accessibilityRole="header">
            {selected.title}
          </Text>
          <Text>{selected.whatHappens}</Text>
          {selected.measure && (
            <Text>
              Measured number: {selected.measure.name}; today:{" "}
              {selected.measure.today || "Not stated"}
            </Text>
          )}
          {selected.waiting && (
            <Text>
              Waiting: {selected.waiting.count ?? "Not stated"} items ·{" "}
              {selected.waiting.days ?? "Not stated"} days
            </Text>
          )}
          <Text>{selected.peopleWorkingOnIt} people are working on this.</Text>
          {summary.data?.settings.enabled && selected.rewardRangeCents && (
            <>
              <Text>Possible reward range</Text>
              <PayAmount
                cents={selected.rewardRangeCents.min}
                note={summary.data.settings.payRulesNote}
              />
              <Text>to</Text>
              <PayAmount
                cents={selected.rewardRangeCents.max}
                note={summary.data.settings.payRulesNote}
              />
            </>
          )}
          <Button
            label="I have a fix"
            disabled={command.busy}
            onPress={() => setForm(true)}
          />
        </Card>
      )}
      {!!sent && <Text accessibilityLiveRegion="polite">{sent}</Text>}
      {form && selected && (
        <Card>
          <Text variant="title" accessibilityRole="header">
            I have a fix
          </Text>
          <VoiceField
            label="What would you change?"
            value={text}
            onChange={setText}
            disabled={command.busy}
          />
          <Text variant="metaStrong">Kind of fix</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(
              [
                ["new_steps", "New steps"],
                ["agent", "An agent"],
                ["tool", "A tool"],
                ["more_people", "More people"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                label={label}
                disabled={command.busy || kind === value}
                onPress={() => setKind(value)}
              />
            ))}
          </View>
          <Field
            label="Measured number"
            value={measure}
            onChangeText={setMeasure}
            maxLength={3000}
            editable={!command.busy}
          />
          <Field
            label="Measured number before"
            value={before}
            onChangeText={setBefore}
            maxLength={3000}
            editable={!command.busy}
          />
          <Field
            label="Hours a week before"
            value={hoursBefore}
            onChangeText={setHoursBefore}
            keyboardType="decimal-pad"
            editable={!command.busy}
          />
          <Field
            label="Hours a week after (proposed)"
            value={hoursAfter}
            onChangeText={setHoursAfter}
            keyboardType="decimal-pad"
            editable={!command.busy}
          />
          {!!inputError && (
            <Text accessibilityRole="alert" color="red">
              {inputError}
            </Text>
          )}
          {!!command.error && (
            <Text accessibilityRole="alert" color="red">
              {command.error}
            </Text>
          )}
          <Button
            label="Send fix"
            kind="primary"
            loading={command.busy}
            disabled={command.conflict}
            onPress={submit}
          />
          <Button
            label="Cancel fix"
            disabled={command.busy}
            onPress={() => setForm(false)}
          />
        </Card>
      )}
      <SectionLabel>My fixes</SectionLabel>
      {summary.error ? (
        <EarnError error={summary.error} retry={summary.reload} />
      ) : !summary.data ? (
        <LoadingState label="Loading your fixes…" />
      ) : (
        <FixRows
          fixes={summary.data.fixes}
          enabled={summary.data.settings.enabled}
          note={summary.data.settings.payRulesNote}
        />
      )}
    </Frame>
  );
}
