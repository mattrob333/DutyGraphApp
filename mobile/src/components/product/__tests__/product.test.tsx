import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ThemeProvider } from "@/theme";
import { usePreferencesStore } from "@/state/preferences";
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
} from "..";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);
for (const appearance of ["dark", "light"] as const) {
  describe(`${appearance} product primitives`, () => {
    beforeEach(() => {
      usePreferencesStore.setState({ appearance });
    });
    it("has accessible rows, section counts, mode choices and people", async () => {
      const onPress = jest.fn();
      const onChange = jest.fn();
      await wrap(
        <>
          <SectionHeader title="Upcoming" count={2} />
          <Row title="Operations" subtitle="Today" onPress={onPress} />
          <SegmentedControl
            value="capture"
            onChange={onChange}
            options={[
              { value: "capture", label: "Capture" },
              { value: "copilot", label: "Copilot" },
            ]}
          />
          <PersonChip
            name="Dana Whitlock"
            role="Decision maker"
            consent="consented"
            onPress={onPress}
          />
        </>,
      );
      expect(screen.getByRole("header", { name: "Upcoming · 2" })).toBeTruthy();
      const row = screen.getByRole("button", { name: "Operations" });
      expect(
        StyleSheet.flatten(row.props.style).minHeight,
      ).toBeGreaterThanOrEqual(44);
      await fireEvent.press(row);
      await fireEvent.press(screen.getByRole("radio", { name: "Copilot" }));
      expect(onPress).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith("copilot");
      expect(
        screen.getByRole("button", {
          name: "Dana Whitlock, Decision maker, consented",
        }),
      ).toBeTruthy();
    });
    it("shows text for every recording, speech and timer state", async () => {
      await wrap(
        <>
          <TimerRing elapsedSeconds={50} totalSeconds={300} />
          <TimerRing elapsedSeconds={250} totalSeconds={300} />
          <TimerRing elapsedSeconds={301} totalSeconds={300} />
          {(["recording", "paused", "uploading", "offline-saved"] as const).map(
            (state) => (
              <RecordingIndicator
                key={state}
                state={state}
                elapsedSeconds={65}
              />
            ),
          )}
          <SpeakingIndicator />
          <SpeakingIndicator muted />
        </>,
      );
      expect(screen.getByRole("timer", { name: "4:10 left" })).toBeTruthy();
      expect(screen.getByText("Time is up")).toBeTruthy();
      expect(screen.getByText("● Recording")).toBeTruthy();
      expect(screen.getByText("Recording paused")).toBeTruthy();
      expect(screen.getByText("Uploading recording")).toBeTruthy();
      expect(screen.getByText("Recording saved on this phone")).toBeTruthy();
      expect(screen.getByText("◖ Speaking…")).toBeTruthy();
      expect(screen.getByText("Voice muted")).toBeTruthy();
      expect(
        screen.getByText("● Recording").props.accessibilityLiveRegion,
      ).toBe("polite");
      expect(
        screen
          .getAllByLabelText("Elapsed recording time 1:05")
          .every((node) => node.props.accessibilityLiveRegion === undefined),
      ).toBe(true);
    });
    it("keeps consent explicit and offers proposal decisions", async () => {
      const consent = jest.fn();
      const accept = jest.fn();
      await wrap(
        <>
          <ConsentRow name="Priya Shah" state="pending" onChange={consent} />
          <ProposalCard
            title="Call the carrier"
            body="Priya will call."
            speaker="Priya Shah"
            quote="I can call."
            timestamp="1:22"
            onPlay={() => {}}
            onAccept={accept}
            onReject={() => {}}
            onEdit={() => {}}
          />
        </>,
      );
      await fireEvent.press(screen.getByRole("radio", { name: "Declined" }));
      expect(consent).toHaveBeenCalledWith("declined");
      await fireEvent.press(screen.getByRole("button", { name: "Accept" }));
      expect(accept).toHaveBeenCalled();
      expect(screen.getByText("“I can call.”")).toBeTruthy();
    });
    it("shows the real Task Card fields and all four large choices", async () => {
      const choose = jest.fn();
      await wrap(
        <TaskCardView
          data={
            {
              title: "Book pickups",
              duty: "Ship on time",
              mode: "internal-classification",
            } as any
          }
          onDecision={choose}
          onNote={() => {}}
        />,
      );
      expect(screen.getByText("Ship on time")).toBeTruthy();
      expect(screen.queryByText("internal-classification")).toBeNull();
      for (const choice of TASK_CHOICES) {
        const target = screen.getByRole("radio", { name: choice.label });
        expect(
          StyleSheet.flatten(target.props.style).minHeight,
        ).toBeGreaterThanOrEqual(44);
        await fireEvent.press(target);
        expect(choose).toHaveBeenLastCalledWith(choice.value);
      }
      expect(screen.getByLabelText("Add a note (optional)")).toBeTruthy();
    });
    it("keeps raw words, editable answer, origin and edit mark separate", async () => {
      const edit = jest.fn();
      await wrap(
        <AnswerCard
          title="Your tools"
          value="The carrier portal."
          raw="I use the portal."
          source="voice_openai"
          edited
          onChange={edit}
        />,
      );
      expect(screen.queryByText("I use the portal.")).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", { name: "Show what I said" }),
      );
      expect(screen.getByText("I use the portal.")).toBeTruthy();
      expect(screen.getByText("Transcribed with OpenAI · Edited")).toBeTruthy();
      await fireEvent.changeText(
        screen.getByDisplayValue("The carrier portal."),
        "The order system.",
      );
      expect(edit).toHaveBeenCalledWith("The order system.");
    });
    it("offers honest skipped and failed recording recovery states", async () => {
      const retry = jest.fn();
      await wrap(
        <>
          <AnswerCard
            title="Skipped"
            state="skipped"
            reason="I don't know yet"
            onAnswerNow={() => {}}
          />
          <AnswerCard title="Pending" state="recording-pending" />
          <AnswerCard
            title="Failed"
            state="recording-failed"
            onRetry={retry}
            onRemove={() => {}}
            onChange={() => {}}
          />
        </>,
      );
      expect(screen.getByText("I don't know yet")).toBeTruthy();
      expect(screen.getByText("Transcribing your recording…")).toBeTruthy();
      expect(
        screen.getByText(
          "Your recording is saved. The words are not ready yet.",
        ),
      ).toBeTruthy();
      await fireEvent.press(
        screen.getByRole("button", { name: "Try transcription again" }),
      );
      expect(retry).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Answer now" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Remove recording" }),
      ).toBeTruthy();
    });
    it("shows silent coach, parking and one empty-state action", async () => {
      const park = jest.fn();
      await wrap(
        <>
          <CoachPanel
            title="Pickup"
            person="Marcus Lee"
            question="Who owns it?"
            stillNeeded={["Owner"]}
            flags={["Time is up"]}
            onPark={park}
          />
          <ParkedList items={[]} />
          <ParkedList
            items={[
              {
                id: "p1",
                title: "Freight threshold",
                speaker: "Dana",
                time: "2:30",
              },
            ]}
          />
          <EmptyState
            title="No meetings."
            action="Plan a meeting"
            onAction={() => {}}
          />
        </>,
      );
      expect(screen.getByText("Silent coach")).toBeTruthy();
      expect(screen.getByText("Still needed: Owner")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Park it" }));
      expect(park).toHaveBeenCalled();
      expect(screen.getByText("No parked items.")).toBeTruthy();
      expect(screen.getByText("Freight threshold")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Plan a meeting" }),
      ).toBeTruthy();
    });
  });
}
