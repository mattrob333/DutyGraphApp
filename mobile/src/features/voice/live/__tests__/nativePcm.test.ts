import { expect, jest, test } from "@jest/globals";
import {
  NativePcmCapture,
  type NativePcmModule,
  type PcmSamplesEvent,
  type PcmErrorEvent,
} from "../nativePcm";
import { createLiveSpeech } from "../index";

function nativeModule() {
  const samples = new Set<(event: PcmSamplesEvent) => void>();
  const errors = new Set<(event: PcmErrorEvent) => void>();
  const starts: number[] = [];
  const stop = jest.fn<() => Promise<void>>(async () => {});
  const module = {
    isSupported: true,
    startAsync: async (id: number) => {
      starts.push(id);
    },
    stopAsync: stop,
    addListener(
      event: "samples" | "error",
      callback:
        ((event: PcmSamplesEvent) => void) | ((event: PcmErrorEvent) => void),
    ) {
      const listeners = event === "samples" ? samples : errors;
      (listeners as Set<typeof callback>).add(callback);
      return {
        remove: () => {
          (listeners as Set<typeof callback>).delete(callback);
        },
      };
    },
  } as NativePcmModule;
  return {
    module,
    starts,
    stop,
    samples,
    errors,
    emit: (values: number[], runId = starts[starts.length - 1]) =>
      samples.forEach((callback) =>
        callback({ runId, sampleRate: 24000, samples: values }),
      ),
  };
}
const foreground = () => () => {};

test("native PCM frames are normalized and tagged; stop discards queued events and releases listeners", async () => {
  const fake = nativeModule();
  const received = jest.fn<(samples: Float32Array, rate: number) => void>();
  const capture = new NativePcmCapture(fake.module, {
    permission: async () => true,
    onBackground: foreground,
  });
  await capture.start(received);
  const stale = [...fake.samples][0];
  const runId = fake.starts[0];
  fake.emit([-2, 0, 2]);
  expect([...received.mock.calls[0][0]]).toEqual([-1, 0, 1]);
  expect(received.mock.calls[0][1]).toBe(24000);
  fake.emit([1], runId + 1);
  expect(received).toHaveBeenCalledTimes(1);
  await capture.stop();
  stale({ runId, sampleRate: 24000, samples: [1] });
  expect(received).toHaveBeenCalledTimes(1);
  expect(fake.stop).toHaveBeenCalledTimes(1);
  expect(fake.samples.size + fake.errors.size).toBe(0);
});

test("permission cancellation never opens the microphone, including stop while prompt is pending", async () => {
  const fake = nativeModule();
  const denied = jest.fn();
  const capture = new NativePcmCapture(fake.module, {
    permission: async () => false,
    onBackground: foreground,
  });
  await capture.start(() => {}, denied);
  expect(denied).toHaveBeenCalledWith({ code: "permission_denied" });
  expect(fake.starts).toHaveLength(0);
  let allow!: (value: boolean) => void;
  const pending = new NativePcmCapture(fake.module, {
    permission: () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
    onBackground: foreground,
  });
  const start = pending.start(() => {});
  for (let i = 0; i < 3; i++) await Promise.resolve();
  await pending.stop();
  allow(true);
  await start;
  expect(fake.starts).toHaveLength(0);
});

test("runtime native failure releases capture before reporting fallback and background never restarts", async () => {
  const fake = nativeModule();
  let stopped!: () => void;
  fake.stop.mockImplementation(
    () =>
      new Promise((resolve) => {
        stopped = resolve;
      }),
  );
  const error = jest.fn();
  let background = () => {};
  const capture = new NativePcmCapture(fake.module, {
    permission: async () => true,
    onBackground: (callback) => {
      background = callback;
      return () => {};
    },
  });
  await capture.start(() => {}, error);
  fake.errors.forEach((callback) =>
    callback({ runId: fake.starts[0], code: "capture_failed" }),
  );
  for (let i = 0; i < 3; i++) await Promise.resolve();
  expect(error).not.toHaveBeenCalled();
  stopped();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(error).toHaveBeenCalledWith({ code: "not_available" });
  fake.stop.mockResolvedValue();
  await capture.start(() => {}, error);
  background();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(fake.starts).toHaveLength(2);
  expect(fake.samples.size).toBe(0);
});

test("one native owner prevents an old screen cleanup from stopping the new microphone", async () => {
  const fake = nativeModule();
  const options = { permission: async () => true, onBackground: foreground };
  const first = new NativePcmCapture(fake.module, options);
  const second = new NativePcmCapture(fake.module, options);
  await first.start(() => {});
  await second.start(() => {});
  expect(fake.starts[1]).not.toBe(fake.starts[0]);
  expect(fake.stop).toHaveBeenCalledTimes(1);
  await first.stop();
  expect(fake.stop).toHaveBeenCalledTimes(1);
  await second.stop();
  expect(fake.stop).toHaveBeenCalledTimes(2);
});

test("malformed frames fail safely and a native-enabled build selects the OpenAI source", async () => {
  const fake = nativeModule();
  const capture = new NativePcmCapture(fake.module, {
    permission: async () => true,
    onBackground: foreground,
  });
  const error = jest.fn();
  await capture.start(() => {}, error);
  fake.emit([Number.NaN]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(error).toHaveBeenCalledWith({ code: "not_available" });
  const source = createLiveSpeech({
    dataSource: "http",
    capture,
    grant: async () => ({ available: false }),
    loadNative: () => null,
  });
  expect(source.kind).toBe("openai");
  await source.stop();
  expect(new NativePcmCapture(null).available).toBe(false);
});

test("single-capture WAV tee is opt-in and finalizes before failed-source fallback", async () => {
  const fake = nativeModule();
  const order: string[] = [];
  fake.module.beginBackupAsync = async () => {
    order.push("begin-backup");
  };
  fake.module.finishBackupAsync = async (id) => {
    order.push("finish-backup");
    return [
      {
        id: "file",
        groupId: id,
        uri: "file:///backup.wav",
        durationMs: 1000,
        bytes: 48044,
      },
    ];
  };
  fake.stop.mockImplementation(async () => {
    order.push("stop-mic");
  });
  const capture = new NativePcmCapture(fake.module, {
    permission: async () => true,
    onBackground: foreground,
  });
  await capture.start(() => {});
  expect(order).toEqual([]);
  const finished = jest.fn<
    (batch: import("../types").SpeechBackupBatch) => Promise<void>
  >(async () => {
    order.push("persist-backup");
  });
  await capture.beginBackup("group", finished);
  capture.markBackupFailed();
  await capture.stop();
  expect(order).toEqual([
    "begin-backup",
    "stop-mic",
    "finish-backup",
    "persist-backup",
  ]);
  expect(finished).toHaveBeenCalledWith(
    expect.objectContaining({
      failed: true,
      files: [expect.objectContaining({ uri: "file:///backup.wav" })],
    }),
  );
});
