import React, { useState } from "react";
import { router, type Href } from "expo-router";
import { useRepository } from "@/api";
import {
  BottomActionBar,
  Button,
  Card,
  Heading,
  Screen,
  Text,
} from "@/components/common";
import { Row, SectionHeader } from "@/components/product";
import { useAdvisorStore } from "@/state/advisor";
import { useUiStore } from "@/state/ui";
import { useSimulationStore } from "@/state/simulation";
export const DEMO_TOUR_STEPS = [
  {
    id: "A",
    title: "Spoken interview",
    route: "/questions/req-hf-cobalt",
    action: "Open spoken interview",
    body: "Choose Start with voice, allow the microphone, then answer each card. The demo uses scripted words. Review and send when you are ready.",
  },
  {
    id: "B",
    title: "Typed interview",
    route: "/questions/req-hf-cobalt-records",
    action: "Open typed interview",
    body: "Choose Type instead. Enter your answer, use Next, then check and send your own wording.",
  },
  {
    id: "C",
    title: "Offline send",
    route: "/questions/req-hf-cobalt/review",
    action: "Open interview review",
    body: "Open an unsent interview review. Turn on Offline below before you tap Send. Return here and turn it off, then retry. If you already sent the interview, use Reset demo in Me to start again.",
  },
  {
    id: "D",
    title: "Task Card check",
    route: "/confirmations/req-confirm-friday",
    action: "Open Task Card check",
    body: "Read the three sample Task Cards. Try This is right, Needs a change with a note, and Not my work. Review your choices before sending.",
  },
  {
    id: "E",
    title: "Plan a meeting",
    route: "/advisor/meetings/new",
    action: "Open meeting builder",
    body: "Pair with the fictional code DEMO if asked. Build the purpose and outcomes with POWER, choose people and roles, then review the meeting plan and Pulse option.",
  },
  {
    id: "F",
    title: "Pulse",
    route: "/pulse/pulse-monday-ops",
    action: "Open participant Pulse",
    body: "Answer your own update with voice or text. Review and send it. Team status shows completion only.",
  },
  {
    id: "G",
    title: "Copilot meeting",
    route: "/advisor/meetings/demo-operations/start?mode=copilot",
    action: "Open Copilot start",
    body: "Choose Copilot, then check consent for every attendee. Decline one, add sample transcript, park a topic and use the closing review. No audio is recorded in this demo.",
  },
  {
    id: "H",
    title: "Facilitator meeting",
    route: "/advisor/meetings/demo-operations/start?mode=facilitator",
    action: "Open Facilitator start",
    body: "Choose Facilitator and check consent. Try the spoken opening, Next, Mute and Stop AI. You decide when to finish and review the meeting.",
  },
] as const;
/** Navigation only: this guide never starts recording, consents, pairs or sends for the viewer. */
export function DemoTourScreen() {
  const repo = useRepository();
  const identity = useAdvisorStore((s) => s.identity);
  const offline = useSimulationStore((s) => s.offline);
  const setSimulation = useSimulationStore((s) => s.set);
  const [index, setIndex] = useState(0);
  if (repo.kind !== "mock")
    return (
      <Screen>
        <Heading>Demo tour is unavailable</Heading>
        <Text color="muted">
          Open the app with mock data to use this guide.
        </Text>
      </Screen>
    );
  const step = DEMO_TOUR_STEPS[index];
  const open = (selected: (typeof DEMO_TOUR_STEPS)[number] = step) => {
    const advisor = selected.route.startsWith("/advisor/");
    router.push(
      (advisor && !identity ? "/advisor/pair" : selected.route) as Href,
    );
  };
  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button label={step.action} kind="primary" onPress={() => open()} />
          {index < DEMO_TOUR_STEPS.length - 1 ? (
            <Button
              label="Next tour step"
              full
              onPress={() => {
                setIndex(index + 1);
                open(DEMO_TOUR_STEPS[index + 1]);
              }}
            />
          ) : (
            <Button label="Start tour again" full onPress={() => setIndex(0)} />
          )}
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        Fictional data · Step {index + 1} of {DEMO_TOUR_STEPS.length}
      </Text>
      <Heading>Demo tour</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        Open each flow, try it, then use Back to return here. You choose every
        consent, recording and Send action.
      </Text>
      <Card>
        <Text variant="cardTitle">
          {step.id}. {step.title}
        </Text>
        <Text color="muted" style={{ marginTop: 8 }}>
          {step.body}
        </Text>
        {step.id === "C" ? (
          <Button
            label={
              offline
                ? "Turn offline simulation off"
                : "Turn offline simulation on"
            }
            full
            onPress={() => {
              setSimulation({ offline: !offline });
              useUiStore.getState().setOffline(!offline);
            }}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </Card>
      <SectionHeader title="Tour steps" count={DEMO_TOUR_STEPS.length} />
      {DEMO_TOUR_STEPS.map((item, i) => (
        <Row
          key={item.id}
          title={`${item.id}. ${item.title}`}
          subtitle={i === index ? "Current tour step" : undefined}
          onPress={() => {
            setIndex(i);
            open(item);
          }}
        />
      ))}
      <Text variant="small" color="faint" style={{ marginTop: 18 }}>
        These steps help you explore. Device recording, interruption recovery
        and real voice providers still need a device check.
      </Text>
    </Screen>
  );
}
