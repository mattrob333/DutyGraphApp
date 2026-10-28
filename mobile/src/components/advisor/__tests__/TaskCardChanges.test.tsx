import React, { useState } from "react";
import { expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { ProposalEvidenceCard } from "../Parts";
import {
  TaskCardChangeFields,
  type TaskCardChange,
} from "../TaskCardChangeFields";
import type { MeetingProposal, MeetingTaskCardWire } from "@/api/advisor";
const record: MeetingTaskCardWire = {
  id: "task-one",
  title: "Confirm the shipping date",
  version: 3,
  hash: "task-hash",
  state: "active",
  data: {
    title: "Confirm the shipping date",
    duty: "Shipping",
    ownerId: "priya",
    performerId: "priya",
    purpose: "Confirm pickup",
    trigger: "Order ready",
    inputs: "Order details",
    instructions: "Check the carrier schedule",
    output: "Pickup date",
    systems: ["Dispatch board", "Carrier portal"],
    humanGate: "Dana approves",
    destination: "Warehouse",
    mode: "human",
  },
};
const people = [
  { id: "dana", name: "Dana Whitlock", role: "COO", department: "Operations" },
  {
    id: "priya",
    name: "Priya Shah",
    role: "IT lead",
    department: "Technology",
  },
];
const proposal: MeetingProposal = {
  id: "proposal-one",
  sessionId: "session-one",
  kind: "task_card_delta",
  state: "proposed",
  version: 2,
  hash: "proposal-hash",
  sources: [
    {
      segmentId: "source-one",
      revision: 1,
      quote: "Dana will check the carrier schedule.",
      speakerCluster: "S1",
      personKey: "dana",
    },
  ],
  evidence: "observed",
  body: {
    kind: "task_card_delta",
    taskCardId: record.id,
    personKey: "dana",
    field: "instructions",
    from: record.data.instructions,
    to: "Check the schedule by Tuesday",
  },
  decidedBy: null,
  decidedAt: null,
};
it("shows linked identity/title and expands the read-only scoped Task Card", async () => {
  const load = jest.fn(async () => record);
  await render(
    <ThemeProvider>
      <ProposalEvidenceCard
        proposal={proposal}
        people={{ dana: "Dana Whitlock", priya: "Priya Shah" }}
        taskCards={[record]}
        loadTaskCard={load}
        onDecide={() => {}}
        onEdit={() => {}}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByText("Linked Task Card: Confirm the shipping date"),
  ).toBeTruthy();
  expect(screen.getByText("task-one")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "View linked Task Card" }),
  );
  expect(load).toHaveBeenCalledWith("task-one");
  expect(screen.getByText("Check the carrier schedule")).toBeTruthy();
  expect(screen.getByText("Read only · active · Version 3")).toBeTruthy();
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
});
it("locks accepted linked drafts and exposes draft inspection instead of mutation buttons", async () => {
  const onDecide = jest.fn(),
    onEdit = jest.fn();
  await render(
    <ThemeProvider>
      <ProposalEvidenceCard
        proposal={{
          ...proposal,
          state: "accepted",
          draftRecordId: "draft-one",
        }}
        people={{ dana: "Dana Whitlock", priya: "Priya Shah" }}
        taskCards={[record]}
        loadTaskCard={async (id) => ({ ...record, id, state: "proposed" })}
        onDecide={onDecide}
        onEdit={onEdit}
      />
    </ThemeProvider>,
  );
  for (const label of ["Accept", "Edit", "Reject"])
    expect(screen.queryByRole("button", { name: label })).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "View saved draft" }),
  );
  expect(screen.getByText("Read only · proposed · Version 3")).toBeTruthy();
  expect(onEdit).not.toHaveBeenCalled();
  expect(onDecide).not.toHaveBeenCalled();
});
it("changes target/person and refreshes the reviewed from value, including systems and new cards", async () => {
  const onChange = jest.fn();
  function Editor() {
    const [value, setValue] = useState<TaskCardChange>({
      ...(proposal.body as TaskCardChange),
      taskCardId: null,
      field: "systems",
      from: null,
    });
    return (
      <TaskCardChangeFields
        value={value}
        cards={[record]}
        people={people}
        busy={false}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }
  await render(
    <ThemeProvider>
      <Editor />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirm the shipping date, task-one" }),
  );
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      taskCardId: "task-one",
      from: "Dispatch board\nCarrier portal",
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Priya Shah, IT lead" }),
  );
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ personKey: "priya" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "New Task Card" }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ taskCardId: null, from: null }),
  );
});
it("uses attendee owner choices instead of an arbitrary UUID text field", async () => {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <TaskCardChangeFields
        value={{
          ...(proposal.body as TaskCardChange),
          field: "ownerId",
          to: "priya",
        }}
        cards={[record]}
        people={people}
        busy={false}
        onChange={onChange}
      />
    </ThemeProvider>,
  );
  expect(screen.queryByLabelText("Proposed Task Card value")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Owner: Dana Whitlock" }),
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ field: "ownerId", to: "dana" }),
  );
});

it("allows rejecting a stale draft-linked proposal without implying the draft is deleted", async () => {
  const onDecide = jest.fn();
  await render(
    <ThemeProvider>
      <ProposalEvidenceCard
        proposal={{ ...proposal, state: "stale", draftRecordId: "draft-one" }}
        people={{ dana: "Dana Whitlock" }}
        taskCards={[record]}
        loadTaskCard={async (id) => ({ ...record, id, state: "proposed" })}
        onDecide={onDecide}
        onEdit={() => {}}
      />
    </ThemeProvider>,
  );
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Reject" }));
  expect(onDecide).toHaveBeenCalledWith("reject");
  expect(
    screen.getByText(
      /previously created draft remains unchanged and needs a separate review/,
    ),
  ).toBeTruthy();
});
