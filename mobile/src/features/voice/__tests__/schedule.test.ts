import { expect, test } from "@jest/globals";
import {
  automaticFacilitatorTurn,
  type AutomaticTurnSnapshot,
} from "../meeting/schedule";
const snapshot = (
  patch: Partial<AutomaticTurnSnapshot> = {},
): AutomaticTurnSnapshot => ({
  now: 20000,
  lastHumanAt: 0,
  lastPlaybackEnd: 15000,
  playbackActive: false,
  hasLine: true,
  topicId: "topic-a",
  timeboxEnded: false,
  ...patch,
});
test("silence starts after question audio ends and never schedules during playback", () => {
  expect(automaticFacilitatorTurn(snapshot(), new Set())).toBeNull();
  expect(automaticFacilitatorTurn(snapshot({ now: 23000 }), new Set())).toEqual(
    { key: "silence-topic-a", trigger: "silence" },
  );
  expect(
    automaticFacilitatorTurn(
      snapshot({ now: 40000, playbackActive: true }),
      new Set(),
    ),
  ).toBeNull();
  expect(
    automaticFacilitatorTurn(
      snapshot({ now: 40000, lastPlaybackEnd: null }),
      new Set(),
    ),
  ).toBeNull();
  expect(
    automaticFacilitatorTurn(
      snapshot({ now: 23000, lastHumanAt: 22000 }),
      new Set(),
    ),
  ).toBeNull();
});
test("a generated follow-up cannot rearm silence in the same topic", () => {
  const requested = new Set(["opening", "silence-topic-a"]);
  expect(
    automaticFacilitatorTurn(
      snapshot({ now: 60000, lastPlaybackEnd: 50000 }),
      requested,
    ),
  ).toBeNull();
  expect(
    automaticFacilitatorTurn(
      snapshot({ now: 60000, lastPlaybackEnd: 50000, topicId: "topic-b" }),
      requested,
    ),
  ).toEqual({ key: "silence-topic-b", trigger: "silence" });
  expect(
    automaticFacilitatorTurn(snapshot({ timeboxEnded: true }), requested),
  ).toEqual({ key: "timebox-topic-a", trigger: "timebox_end" });
  requested.add("timebox-topic-a");
  expect(
    automaticFacilitatorTurn(snapshot({ timeboxEnded: true }), requested),
  ).toBeNull();
});
