import React, { useState } from "react";
import { View } from "react-native";
import { useRepository } from "@/api";
import { Heading, Screen, Text } from "@/components/common";
import {
  AnswerCard,
  CoachPanel,
  ConsentRow,
  EmptyState,
  ParkedList,
  PersonChip,
  ProposalCard,
  RecordingIndicator,
  Row,
  SectionHeader,
  SegmentedControl,
  SpeakingIndicator,
  TaskCardView,
  TimerRing,
  TASK_CHOICES,
} from "@/components/product";
import { DEMO_TASK_CARDS } from "@/api/extras/mock";
import { usePreferencesStore } from "@/state/preferences";
export default function ComponentGallery() {
  const repo = useRepository();
  const [selected, setSelected] = useState("copilot");
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);
  if (repo.kind !== "mock")
    return (
      <Screen>
        <Heading>Not available</Heading>
        <Text>This gallery is available with mock data only.</Text>
      </Screen>
    );
  return (
    <Screen>
      <Heading>Component gallery</Heading>
      <Text color="muted">
        Fictional examples. Use Appearance to review both themes.
      </Text>
      <SectionHeader title="Appearance" />
      <SegmentedControl
        value={appearance}
        onChange={setAppearance}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ]}
      />
      <SectionHeader title="Rows" />
      <Row
        title="Operations review"
        subtitle="Today · 10:30"
        right="15 min"
        onPress={() => {}}
      />
      <Row
        title="Not available"
        subtitle="Disabled row"
        disabled
        onPress={() => {}}
      />
      <SectionHeader title="Mode" count={3} />
      <SegmentedControl
        value={selected}
        onChange={setSelected}
        options={[
          { value: "capture", label: "Capture" },
          { value: "copilot", label: "Copilot" },
          { value: "facilitator", label: "Facilitator" },
        ]}
      />
      <SegmentedControl
        disabled
        value="capture"
        onChange={() => {}}
        options={[
          { value: "capture", label: "Capture" },
          { value: "copilot", label: "Copilot" },
        ]}
      />
      <SectionHeader title="People" />
      {(["pending", "consented", "declined"] as const).map((consent) => (
        <PersonChip
          key={consent}
          name="Dana Whitlock"
          role="Decision maker"
          consent={consent}
          selected={consent === "pending"}
          onPress={() => {}}
        />
      ))}
      <SectionHeader title="Time boxes" />
      {[60, 250, 301].map((elapsedSeconds) => (
        <TimerRing
          key={elapsedSeconds}
          elapsedSeconds={elapsedSeconds}
          totalSeconds={300}
        />
      ))}
      <SectionHeader title="Voice status" />
      {(["recording", "paused", "uploading", "offline-saved"] as const).map(
        (state) => (
          <RecordingIndicator key={state} state={state} elapsedSeconds={82} />
        ),
      )}
      <SpeakingIndicator />
      <SpeakingIndicator muted />
      <SectionHeader title="Recording consent" />
      {(["pending", "consented", "declined"] as const).map((state) => (
        <ConsentRow
          key={state}
          name={`Priya Shah · ${state}`}
          state={state}
          onChange={() => {}}
        />
      ))}
      <SectionHeader title="Proposals" />
      {(["proposed", "accepted", "rejected", "stale"] as const).map(
        (status) => (
          <ProposalCard
            key={status}
            title="Confirm the carrier pickup window"
            body="Priya will call the carrier before 2 PM."
            status={status}
            speaker="Priya Shah"
            quote="I can call before two."
            timestamp="1:22"
            onPlay={() => {}}
            onAccept={() => {}}
            onEdit={() => {}}
            onReject={() => {}}
          />
        ),
      )}
      <SectionHeader title="Task Card review" />
      <TaskCardView
        data={{ ...DEMO_TASK_CARDS[0].data, title: DEMO_TASK_CARDS[0].title }}
        onDecision={() => {}}
        onNote={() => {}}
        onRead={() => {}}
      />
      {TASK_CHOICES.map((choice) => (
        <TaskCardView
          key={choice.value}
          data={{ title: choice.label, duty: "Keep shipments moving" }}
          decision={choice.value}
        />
      ))}
      <SectionHeader title="Answer cards" />
      <AnswerCard
        title="What you need to start"
        value="I receive the weekly carrier file from Priya."
        raw="I get it from Priya each Monday."
        source="voice_device"
        onChange={() => {}}
      />
      <AnswerCard
        title="Your next step"
        value="Call the carrier on Tuesday."
        raw="Call next week."
        source="voice_openai"
        edited
        onChange={() => {}}
      />
      <AnswerCard
        title="Typed answer"
        value="The portal is working."
        raw="The portal is working."
        source="typed"
        onChange={() => {}}
      />
      <AnswerCard
        title="Skipped"
        state="skipped"
        reason="I don't know yet"
        onAnswerNow={() => {}}
      />
      <AnswerCard title="Recording pending" state="recording-pending" />
      <AnswerCard
        title="Recording failed"
        state="recording-failed"
        onRetry={() => {}}
        onRemove={() => {}}
        onChange={() => {}}
      />
      <SectionHeader title="Silent coach" />
      <CoachPanel
        title="Carrier pickup"
        person="Marcus Lee"
        question="Who can confirm the pickup window?"
        stillNeeded={["An owner", "A due date"]}
        flags={["Time is up"]}
        onPark={() => {}}
      >
        <TimerRing elapsedSeconds={300} totalSeconds={300} />
      </CoachPanel>
      <CoachPanel title="Carrier pickup" paused />
      <ParkedList items={[]} />
      <ParkedList
        items={[
          {
            id: "park-1",
            title: "Review the freight threshold",
            speaker: "Dana Whitlock",
            time: "2:30",
          },
        ]}
        onPress={() => {}}
      />
      <EmptyState
        title="No meetings to review."
        body="New meetings will appear here."
        action="Plan a meeting"
        onAction={() => {}}
      />
    </Screen>
  );
}
