import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { deckText } from "@shared/hands-free/deck";
import { AccessibilityInfo } from "react-native";
import { useHandsFreeDeck } from "@/features/handsfree/useHandsFreeDeck";
import {
  FakeRepo,
  FakeSpeech,
  ManualClock,
  questionSet,
} from "@/features/handsfree/__fixtures__/handsFree";
import type { VoiceEvent, VoiceOut } from "../out";
jest.mock("expo-router", () => ({ useFocusEffect: () => {} }));
beforeEach(() => {
  jest
    .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
    .mockResolvedValue(false);
});
function output() {
  let listener: ((event: VoiceEvent) => void) | null = null;
  const out: VoiceOut = {
    kind: "device",
    prepare: async () => {},
    play: jest.fn<VoiceOut["play"]>(async () => {}),
    speak: async () => {},
    stop: jest.fn(),
    dispose: async () => {},
    subscribe: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  return { out, emit: (event: VoiceEvent) => listener?.(event) };
}
test("spoken deck waits for actual output completion and keeps one native source warm", async () => {
  const speech = new FakeSpeech();
  const reset = jest.fn<() => void>();
  Object.assign(speech, { reset });
  const voice = output();
  const clock = new ManualClock();
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock,
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.state.phase).toBe("speaking");
  const id = (voice.out.play as jest.Mock<VoiceOut["play"]>).mock.calls[0][0];
  await act(async () => {
    voice.emit({ type: "end", lineId: id });
  });
  expect(hook.result.current.state.phase).toBe("listening");
  expect(speech.starts).toHaveLength(1);
  expect(reset).toHaveBeenCalled();
  await hook.unmount();
});
test("two new words interrupt output without accepting possible speaker echo", async () => {
  const speech = new FakeSpeech();
  const voice = output();
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  await speech.say("Let me");
  expect(hook.result.current.state.phase).toBe("listening");
  expect(deckText(hook.result.current.state)).toBe("");
  expect(voice.out.stop).toHaveBeenCalled();
  await hook.unmount();
});

test("sustained input level interrupts after 300ms, short noise does not", async () => {
  let now = 0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const speech = new FakeSpeech();
  const voice = output();
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
    speech.handlers?.onLevel?.(0.01);
    speech.handlers?.onLevel?.(0.5);
  });
  now = 299;
  await act(async () => {
    speech.handlers?.onLevel?.(0.5);
  });
  expect(hook.result.current.state.phase).toBe("speaking");
  now = 300;
  await act(async () => {
    speech.handlers?.onLevel?.(0.5);
  });
  expect(hook.result.current.state.phase).toBe("listening");
  await hook.unmount();
  jest.restoreAllMocks();
});

test("provider output failures release the listening state and old line events cannot finish a replay", async () => {
  const speech = new FakeSpeech();
  const voice = output();
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  const firstId = (voice.out.play as jest.Mock<VoiceOut["play"]>).mock
    .calls[0][0];
  await act(async () => {
    voice.emit({ type: "start", lineId: firstId });
    voice.emit({ type: "error", lineId: firstId });
  });
  expect(hook.result.current.state.phase).toBe("listening");
  await act(async () => {
    hook.result.current.replay();
  });
  await act(async () => {
    voice.emit({ type: "end", lineId: firstId });
  });
  expect(hook.result.current.state.phase).toBe("speaking");
  await hook.unmount();
});

test("failed voice preparation and microphone startup preserve typing as recovery", async () => {
  const speech = new FakeSpeech();
  speech.start = async () => {
    throw Error("missing device");
  };
  const voice = output();
  voice.out.prepare = async () => {
    throw Error("offline");
  };
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.state.phase).toBe("listening");
  expect(hook.result.current.state.speechError).toBe(true);
  await act(async () => {
    hook.result.current.send({ type: "toText" });
  });
  expect(hook.result.current.state.mode).toBe("text");
  await hook.unmount();
});

test("completed failed-live backups replace the answered card, while pending cards stay queued", async () => {
  const set = questionSet();
  let applied = false;
  const clip = {
    id: "clip",
    requestId: set.requestId,
    questionKey: set.questions[0].key,
    session: 1,
    uri: "file",
    mimeType: "audio/m4a",
    durationMs: 1000,
  };
  const backup = {
    pending: async () => [clip],
    remove: async () => {},
    start: async () => {},
    finish: async () => {},
    flush: async (
      apply: (item: typeof clip, text: string) => void | Promise<void>,
      canApply: (item: typeof clip) => boolean,
    ) => {
      if (!applied && canApply(clip)) {
        applied = true;
        await apply(clip, "I check the carrier portal.");
      }
    },
  };
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set,
      mode: "text",
      answers: [{ status: "got", raw: "I check", covered: [] }],
      speech: new FakeSpeech(),
      repo: new FakeRepo(),
      backup,
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(applied).toBe(true);
  expect(hook.result.current.state.answers[0]?.raw).toContain("carrier portal");
  await hook.unmount();
});

test("screen readers hear acknowledgement status once while questions remain audible", async () => {
  jest
    .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
    .mockResolvedValue(true);
  const speech = new FakeSpeech();
  const voice = output();
  const hook = await renderHook(() =>
    useHandsFreeDeck({
      set: questionSet(),
      mode: "voice",
      speech,
      voiceOut: voice.out,
      speak: true,
      repo: new FakeRepo(),
      clock: new ManualClock(),
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  const firstId = (voice.out.play as jest.Mock<VoiceOut["play"]>).mock
    .calls[0][0];
  await act(async () => {
    voice.emit({ type: "end", lineId: firstId });
  });
  await speech.say(
    "Most orders arrive by email. First I check stock and enter the order. Then Priya in the warehouse picks it up.",
  );
  await act(async () => {
    hook.result.current.send({ type: "next" });
  });
  expect(hook.result.current.state.phase).toBe("got");
  expect(voice.out.play).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
