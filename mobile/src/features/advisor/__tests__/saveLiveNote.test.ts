import { beforeEach, expect, it, jest } from "@jest/globals";
jest.mock("@/storage/advisor", () => {
  const drafts = new Map<string, unknown>();
  return {
    drafts,
    loadAdvisorDraft: async (key: string) => drafts.get(key) ?? null,
    saveAdvisorDraft: async (key: string, value: unknown) => {
      drafts.set(key, value);
    },
  };
});
jest.mock("@/utils/id", () => {
  let next = 0;
  return {
    newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  };
});
import { saveLiveNote } from "../saveLiveNote";
import type { AdvisorRepository } from "@/api/advisor/types";
const { drafts } = jest.requireMock("@/storage/advisor") as {
  drafts: Map<string, unknown>;
};
beforeEach(() => drafts.clear());

it("retries a lost acknowledgment with the same segment, time and explicit attribution", async () => {
  const transcript = jest
    .fn<AdvisorRepository["transcript"]>()
    .mockRejectedValueOnce(
      new Error("Connection lost after server accepted the note"),
    )
    .mockResolvedValue(undefined);
  await expect(
    saveLiveNote(
      { transcript },
      "session",
      "Confirm the delivery.",
      "person",
      1000,
      "command",
    ),
  ).rejects.toThrow("Connection lost");
  await saveLiveNote(
    { transcript },
    "session",
    "Confirm the delivery.",
    "person",
    9000,
    "command",
  );
  expect(transcript.mock.calls[1]).toEqual(transcript.mock.calls[0]);
  const segment = transcript.mock.calls[0][1][0];
  expect(segment).toMatchObject({
    personKey: "person",
    text: "Confirm the delivery.",
    startMs: 1000,
    speakerCluster: `N_${segment.id}`,
  });
});

it("retains the body if HTTP succeeded but local command acknowledgment must retry", async () => {
  const transcript = jest
    .fn<AdvisorRepository["transcript"]>()
    .mockResolvedValue(undefined);
  await saveLiveNote(
    { transcript },
    "session",
    "We agreed on Thursday.",
    "person",
    1000,
    "command",
  );
  await saveLiveNote(
    { transcript },
    "session",
    "We agreed on Thursday.",
    "person",
    8000,
    "command",
  );
  expect(transcript.mock.calls[1]).toEqual(transcript.mock.calls[0]);
});

it("a newly acknowledged command allows another identical note without reusing evidence IDs", async () => {
  const transcript = jest
    .fn<AdvisorRepository["transcript"]>()
    .mockResolvedValue(undefined);
  await saveLiveNote(
    { transcript },
    "session",
    "Ready.",
    "person",
    1000,
    "first",
  );
  await saveLiveNote(
    { transcript },
    "session",
    "Ready.",
    "person",
    8000,
    "second",
  );
  expect(transcript.mock.calls[1][1][0].id).not.toBe(
    transcript.mock.calls[0][1][0].id,
  );
  expect(transcript.mock.calls[1][1][0].startMs).toBe(8000);
});
