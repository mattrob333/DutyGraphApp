import { describe, expect, it, jest } from "@jest/globals";
import type {
  LiveSpeech,
  LiveSpeechHandlers,
  LiveSpeechStartOptions,
} from "@/features/voice/live/types";
import { EarnDictationController, spokenTaskDraft } from "../voice-logic";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fakeSpeech(
  options: {
    kind?: LiveSpeech["kind"];
    opening?: Promise<void>;
    closing?: Promise<void>;
  } = {},
) {
  let handlers: LiveSpeechHandlers | undefined;
  const speech: LiveSpeech = {
    kind: options.kind ?? "native",
    start: jest.fn(
      async (_options: LiveSpeechStartOptions, next: LiveSpeechHandlers) => {
        handlers = next;
        await options.opening;
      },
    ),
    stop: jest.fn(async () => {
      await options.closing;
    }),
  };
  return { speech, handlers: () => handlers! };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
describe("Earn dictation lifecycle", () => {
  it("does not open automatically and appends only user words", async () => {
    const fake = fakeSpeech(),
      words: string[] = [];
    const voice = new EarnDictationController(fake.speech, (text) =>
      words.push(text),
    );
    expect(fake.speech.start).not.toHaveBeenCalled();
    await voice.start("Check the returned parts.");
    expect(voice.snapshot.phase).toBe("listening");
    fake.handlers().onText("Count each tray.");
    fake.handlers().onText("Count each tray. Mark the label.");
    expect(words).toEqual([
      "Check the returned parts. Count each tray.",
      "Check the returned parts. Count each tray. Mark the label.",
    ]);
    expect(fake.speech.start).toHaveBeenCalledWith(
      { lang: "en-US" },
      expect.any(Object),
    );
    await voice.stop();
  });
  it("fences late permission and text results after leaving or typing instead", async () => {
    const opening = deferred(),
      fake = fakeSpeech({ opening: opening.promise }),
      words: string[] = [];
    const voice = new EarnDictationController(fake.speech, (text) =>
      words.push(text),
    );
    const start = voice.start("");
    await tick();
    expect(voice.snapshot.phase).toBe("starting");
    await voice.stop();
    fake.handlers().onText("Old words must not arrive.");
    opening.resolve();
    await start;
    expect(words).toEqual([]);
    expect(voice.snapshot.phase).toBe("idle");
  });
  it("keeps stopping visible until closure and prevents a competing start", async () => {
    const closing = deferred(),
      fake = fakeSpeech({ closing: closing.promise });
    const voice = new EarnDictationController(fake.speech, () => undefined);
    await voice.start("");
    const stop = voice.stop();
    expect(voice.snapshot.phase).toBe("stopping");
    await voice.start("another");
    expect(fake.speech.start).toHaveBeenCalledTimes(1);
    closing.resolve();
    expect(await stop).toBe(true);
    expect(voice.snapshot.phase).toBe("idle");
  });
  it("shows unavailable or denied state without substituting scripted words", async () => {
    const unavailable = fakeSpeech({ kind: "unavailable" });
    const voice = new EarnDictationController(unavailable.speech, () => {
      throw new Error("No invented words.");
    });
    await voice.start("");
    expect(unavailable.speech.start).not.toHaveBeenCalled();
    expect(voice.snapshot.phase).toBe("unavailable");
    const fake = fakeSpeech(),
      denied = new EarnDictationController(fake.speech, () => undefined);
    await denied.start("");
    fake.handlers().onError({ code: "permission_denied" });
    await tick();
    await tick();
    expect(denied.snapshot.phase).toBe("error");
    expect(denied.snapshot.message).toMatch(/permission.*Type instead/);
  });
  it("stops on pause and rejects callbacks after stop or observer removal", async () => {
    const fake = fakeSpeech(),
      words: string[] = [],
      states: string[] = [];
    const voice = new EarnDictationController(fake.speech, (text) =>
      words.push(text),
    );
    const remove = voice.observe((state) => states.push(state.phase));
    await voice.start("");
    fake.handlers().onPause?.();
    await tick();
    await tick();
    fake.handlers().onText("Late words");
    expect(words).toEqual([]);
    const before = states.length;
    remove();
    await voice.stop();
    expect(states).toHaveLength(before);
  });
  it("stops with an explicit error instead of truncating an oversized recognition result", async () => {
    const fake = fakeSpeech(),
      words: string[] = [];
    const voice = new EarnDictationController(fake.speech, (text) =>
      words.push(text),
    );
    await voice.start("");
    fake.handlers().onText("a".repeat(3001));
    await tick();
    await tick();
    expect(words).toEqual([]);
    expect(voice.snapshot.message).toMatch(/3,000/);
    expect(fake.speech.stop).toHaveBeenCalled();
  });
  it("does not claim microphone closure if stop fails", async () => {
    const fake = fakeSpeech();
    fake.speech.stop = jest.fn(async () => {
      throw new Error("close failed");
    });
    const voice = new EarnDictationController(fake.speech, () => undefined);
    await voice.start("");
    expect(await voice.stop()).toBe(false);
    expect(voice.snapshot.phase).toBe("error");
    expect(voice.snapshot.message).toMatch(/did not close/);
    await voice.start("");
    expect(fake.speech.start).toHaveBeenCalledTimes(1);
  });
});
describe("Spoken tasks remain unconfirmed app drafts", () => {
  it("keeps exact user words and leaves unknown steps and all other slots unknown", () => {
    const words = "<script>do not execute</script> Check the blue parts tray.";
    const card = spokenTaskDraft(
      "Check the returned parts",
      "Check returns",
      words,
      "manual",
    );
    expect(card).toMatchObject({
      title: "Check the returned parts",
      duty: "Check returns",
      kind: "today",
      workType: "manual",
      steps: [],
    });
    expect(card.slots.does).toEqual({ value: words, basis: "told_me" });
    for (const key of [
      "startsWhen",
      "getsFrom",
      "handsTo",
      "howOften",
      "howLong",
      "onlyIKnow",
    ] as const)
      expect(card.slots[key]).toEqual({ value: null, basis: "not_stated" });
    for (const key of [
      "personId",
      "companyId",
      "tenantId",
      "doneMeans",
      "money",
    ])
      expect(key in card).toBe(false);
  });
  it("requires the person to provide a name, duty and bounded reviewable words", () => {
    expect(() => spokenTaskDraft("", "duty", "words")).toThrow(/task name/);
    expect(() => spokenTaskDraft("Check parts", "", "words")).toThrow(
      /part of your job/,
    );
    expect(() => spokenTaskDraft("Check parts", "duty", "")).toThrow(/Review/);
    expect(() =>
      spokenTaskDraft("Check parts", "duty", "x".repeat(3001)),
    ).toThrow(/3,000/);
  });
});
