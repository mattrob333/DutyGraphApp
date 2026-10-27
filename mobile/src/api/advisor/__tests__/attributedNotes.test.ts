import { expect, it, jest } from "@jest/globals";
import { MockAdvisorRepository } from "../MockAdvisorRepository";
import type { TranscriptInput } from "../types";
jest.mock("@/utils/id", () => {
  let n = 0;
  return {
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  };
});
async function fixture() {
  const repo = new MockAdvisorRepository();
  const meeting = await repo.create(
    {
      title: "Shipping decision",
      startsAt: null,
      minutes: 15,
      purpose: "Choose a delivery date",
      outcomes: ["An agreed date"],
      execution: "Review the date",
      attendees: [
        { personId: "dana", name: "Dana Whitlock", roles: ["decision_maker"] },
        { personId: "priya", name: "Priya Shah", roles: ["resource"] },
      ],
    },
    "create",
  );
  await repo.plan(meeting.id, "plan");
  const session = await repo.start(meeting.id, "copilot", "start");
  await repo.consent(
    session.id,
    session.consents.map((c) => ({
      ...c,
      state: c.personKey === "dana" ? "consented" : "declined",
      at: new Date().toISOString(),
    })),
    "consent",
  );
  const note: TranscriptInput = {
    id: "00000000-0000-4000-8000-000000000099",
    sessionId: session.id,
    revision: 1,
    startMs: 0,
    endMs: 1,
    text: "Confirm Thursday delivery.",
    speakerCluster: "unused",
    personKey: "dana",
    committed: true,
    source: "live",
  };
  return { repo, session, note };
}
it("keeps explicitly selected consenting attribution through finish without mapping a declined attendee", async () => {
  const { repo, session, note } = await fixture();
  await repo.transcript(session.id, [note], "note");
  await repo.finish(session.id, "finish");
  const result = await repo.session(session.id);
  expect(result.speakerMap.entries).toEqual([
    {
      cluster: `N_${note.id}`,
      personKey: "dana",
      suggested: false,
      confirmedBy: "leader",
    },
  ]);
  await expect(
    repo.decide(result.proposals[0], "accept", "accept"),
  ).resolves.toBeDefined();
});
it("rejects a batch containing a declined speaker before saving any of its notes", async () => {
  const { repo, session, note } = await fixture();
  await expect(
    repo.transcript(
      session.id,
      [
        note,
        {
          ...note,
          id: "00000000-0000-4000-8000-000000000098",
          personKey: "priya",
        },
      ],
      "notes",
    ),
  ).rejects.toThrow("consenting");
  const result = await repo.session(session.id);
  expect(result.transcript).toEqual([]);
  expect(result.speakerMap.entries).toEqual([]);
});

it("allows editing a current quote before mapping, while acceptance still requires attribution", async () => {
  const { repo, session, note } = await fixture();
  const current = await repo.session(session.id);
  await repo.consent(
    session.id,
    current.consents.map((person) => ({ ...person, state: "consented" })),
    "all-consent",
  );
  await repo.transcript(
    session.id,
    [{ ...note, personKey: undefined }],
    "note",
  );
  await repo.finish(session.id, "finish");
  const proposal = (await repo.session(session.id)).proposals[0];
  const edited = await repo.decide(proposal, "edit", "edit", {
    kind: "claim",
    fieldPath: "meeting.notes",
    value: "Confirm the delivery date.",
  });
  expect(edited.state).toBe("proposed");
  await expect(repo.decide(edited, "accept", "accept")).rejects.toThrow(
    /speaker/,
  );
});
