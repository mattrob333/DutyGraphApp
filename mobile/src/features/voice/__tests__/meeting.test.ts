import { test, expect, jest } from "@jest/globals";
import { MeetingRecorder, UPLOAD_BYTES } from "../meeting/recorder";
import {
  MeetingTurnController,
  type FacilitatorVoice,
} from "../meeting/facilitator";

test("recording uploads 512KiB parts and resumes at the last acknowledged offset", async () => {
  const data = new Uint8Array(UPLOAD_BYTES + 13);
  let stored: any = null;
  let fail = true;
  const upload = jest.fn(
    async ({ offset, bytes }: { offset: number; bytes: Uint8Array }) => {
      if (offset && fail) throw Error("offline");
      return { uploadedBytes: offset + bytes.length };
    },
  );
  const ports = {
    recorder: {
      available: true,
      start: async () => {},
      stop: async () => ({ uri: "temp", durationMs: 300000 }),
    },
    files: {
      persist: async () => "durable",
      bytes: async () => data,
      hash: async () => "hash",
    },
    storage: {
      load: async () => stored,
      save: async (manifest: any) => {
        stored = JSON.parse(JSON.stringify(manifest));
      },
    },
    upload,
  };
  const recorder = new MeetingRecorder("session", ports);
  await recorder.start();
  await recorder.stop();
  await expect(recorder.uploadPending()).rejects.toThrow("offline");
  expect(stored.segments[0].uploadedBytes).toBe(UPLOAD_BYTES);
  fail = false;
  const resumed = new MeetingRecorder("session", ports);
  await resumed.restore();
  await resumed.uploadPending();
  expect(upload).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: UPLOAD_BYTES, final: true }),
  );
  expect(resumed.segments[0].uploadedBytes).toBe(data.length);
});
test("facilitator waits for silence, surfaces blocked lines, and barge-in never stops recording", async () => {
  let now = 0;
  let done!: () => void;
  const voice: FacilitatorVoice = {
    kind: "tts_lines",
    prepare: async () => {},
    speak: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    ),
    stop: jest.fn(),
    setMuted: jest.fn(),
    dispose: async () => {},
  };
  const show = jest.fn();
  const controller = new MeetingTurnController(voice, show, () => now);
  controller.queue("opening", { id: "a", text: "Welcome" });
  now = 1000;
  await controller.tick();
  expect(voice.speak).not.toHaveBeenCalled();
  now = 1200;
  const turn = controller.tick();
  expect(voice.speak).toHaveBeenCalledTimes(1);
  controller.speechDetected();
  expect(voice.stop).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith({ id: "a", text: "Welcome" });
  done();
  await turn;
  controller.queue("silence", { id: "b", text: "A question" });
  now = 9200;
  controller.speechDetected();
  await controller.tick();
  expect(show).toHaveBeenCalledWith({ id: "b", text: "A question" });
  controller.stop();
  controller.queue("closing", { id: "c", text: "Thanks" });
  now = 20000;
  await controller.tick();
  expect(voice.speak).toHaveBeenCalledTimes(1);
});

test("five minute rotation seals before restarting and failed persistence stays paused until recovery", async () => {
  let rotate: (() => void) | undefined;
  let failing = true;
  const starts = jest.fn<() => Promise<void>>(async () => {});
  const save = jest.fn<(manifest: unknown) => Promise<void>>(async () => {
    if (failing) throw Error("disk full");
  });
  const recorder = new MeetingRecorder("r", {
    recorder: {
      available: true,
      start: starts,
      stop: async () => ({ uri: "temp", durationMs: 300000 }),
    },
    files: {
      persist: async () => "durable",
      bytes: async () => new Uint8Array([1]),
      hash: async () => "hash",
    },
    storage: { load: async () => null, save },
    upload: async () => ({ uploadedBytes: 1 }),
    timer: {
      set(fn, ms) {
        expect(ms).toBe(300000);
        rotate = fn;
        return 1;
      },
      clear() {},
    },
  });
  await recorder.start();
  rotate!();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  expect(recorder.status).toBe("paused");
  expect(starts).toHaveBeenCalledTimes(1);
  expect(recorder.segments).toHaveLength(1);
  failing = false;
  await recorder.resume();
  expect(recorder.status).toBe("recording");
  expect(starts).toHaveBeenCalledTimes(2);
  expect(recorder.segments).toHaveLength(1);
  await recorder.stop();
});
test("checksum mismatch prevents upload and keeps recording evidence for review", async () => {
  let modified = false;
  const upload = jest.fn<() => Promise<{ uploadedBytes: number }>>(
    async () => ({ uploadedBytes: 1 }),
  );
  const recorder = new MeetingRecorder("r", {
    recorder: {
      available: true,
      start: async () => {},
      stop: async () => ({ uri: "temp", durationMs: 1000 }),
    },
    files: {
      persist: async () => "durable",
      bytes: async () => new Uint8Array([1]),
      hash: async () => (modified ? "changed" : "original"),
    },
    storage: { load: async () => null, save: async () => {} },
    upload,
  });
  await recorder.start();
  await recorder.stop();
  modified = true;
  await expect(recorder.uploadPending()).rejects.toThrow("checksum");
  expect(upload).not.toHaveBeenCalled();
  expect(recorder.segments).toHaveLength(1);
});

test("Say it now respects actual room silence and muted lines expire onto the screen", async () => {
  let now = 0;
  const voice: FacilitatorVoice = {
    kind: "tts_lines",
    prepare: async () => {},
    speak: jest.fn<FacilitatorVoice["speak"]>(async () => {}),
    stop: jest.fn(),
    setMuted: jest.fn(),
    dispose: async () => {},
  };
  const show = jest.fn();
  const controller = new MeetingTurnController(voice, show, () => now);
  controller.speechDetected();
  await controller.sayNow({ id: "now", text: "A short question" });
  expect(voice.speak).not.toHaveBeenCalled();
  now = 1200;
  await controller.tick();
  expect(voice.speak).toHaveBeenCalledTimes(1);
  controller.mute(true);
  controller.queue("leader_next", { id: "muted", text: "Older question" });
  now += 8000;
  await controller.tick();
  expect(show).toHaveBeenCalledWith({ id: "muted", text: "Older question" });
  controller.mute(false);
  await controller.tick();
  expect(voice.speak).toHaveBeenCalledTimes(1);
});
