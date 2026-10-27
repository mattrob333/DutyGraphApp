import { test, expect, jest } from "@jest/globals";
import {
  base64,
  cleanKeywords,
  pcm16,
  TranscriptItems,
  OpenAiLiveSpeech,
  type SocketPort,
} from "../live/openai";
import { createVoiceOut, type VoiceLinesRepository } from "../out";
import { ResilientLiveSpeech } from "../live/resilient";
import type { LiveSpeech, LiveSpeechHandlers } from "../live/types";
import { RecordedBackupQueue } from "../backup";

test("PCM resamples/clamps little-endian samples and base64 preserves bytes", () => {
  expect([...pcm16(new Float32Array([-2, 0, 2]), 24000)]).toEqual([
    0, 128, 0, 0, 255, 127,
  ]);
  expect(pcm16(new Float32Array(480), 48000)).toHaveLength(480);
  expect(base64(new Uint8Array([0, 128, 255, 127]))).toBe("AID/fw==");
  expect(
    cleanKeywords(["<Acme>\n", "Acme", "a".repeat(80)]).every(
      (value) => value.length <= 40 && !/[<>\n]/.test(value),
    ),
  ).toBe(true);
});
test("completed provider items replace deltas without reordering later items", () => {
  const items = new TranscriptItems();
  items.apply({
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "a",
    delta: "I che",
  });
  items.apply({
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "b",
    delta: "then email",
  });
  expect(
    items.apply({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "a",
      transcript: "I check stock",
    }),
  ).toBe("I check stock then email");
  items.reset();
  expect(
    items.apply({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "c",
      transcript: "new card",
    }),
  ).toBe("new card");
});
test("server audio failure uses device and stopped output suppresses late end", async () => {
  let finish!: () => void;
  const device = {
    speak: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
    stop: jest.fn(),
  };
  const output = createVoiceOut({
    device,
    repository: {
      getVoiceLines: async () => ({
        lines: [{ id: "q", url: "audio", hash: "a".repeat(64), durationMs: 1 }],
      }),
    },
    cache: { cache: async () => "local" },
    playback: {
      play: async () => {
        throw Error("offline");
      },
      stop: jest.fn(),
    },
  });
  const events: string[] = [];
  output.subscribe((event) => events.push(event.type));
  await output.prepare([{ id: "q", text: "What happens?" }]);
  const play = output.play("q");
  await Promise.resolve();
  await Promise.resolve();
  expect(device.speak).toHaveBeenCalledWith("What happens?", 1);
  output.stop();
  finish();
  await play;
  expect(events).toEqual(["start"]);
});
test("fallback preserves earlier words and changes source label exactly once", async () => {
  let primaryHandlers!: LiveSpeechHandlers;
  let fallbackHandlers!: LiveSpeechHandlers;
  const primary: LiveSpeech = {
    kind: "openai",
    source: "voice_openai",
    start: async (_o, handlers) => {
      primaryHandlers = handlers;
    },
    stop: async () => {},
  };
  const fallback: LiveSpeech = {
    kind: "native",
    source: "voice_device",
    start: async (_o, handlers) => {
      fallbackHandlers = handlers;
    },
    stop: async () => {},
  };
  const speech = new ResilientLiveSpeech(primary, fallback);
  const onText = jest.fn();
  const onError = jest.fn();
  await speech.start({ lang: "en-US" }, { onText, onError });
  primaryHandlers.onText("I check stock");
  primaryHandlers.onError({ code: "network" });
  await Promise.resolve();
  await Promise.resolve();
  fallbackHandlers.onText("then call");
  expect(onText).toHaveBeenLastCalledWith("I check stock then call");
  expect(speech.source).toBe("voice_device");
  fallbackHandlers.onError({ code: "network" });
  expect(onError).toHaveBeenCalledTimes(1);
});
test("backup retains an offline clip across restart and removes it only after apply", async () => {
  let stored: any[] = [];
  let online = false;
  const ports = {
    load: async () => stored,
    save: async (clips: any[]) => {
      stored = [...clips];
    },
    transcribe: async () => {
      if (!online) throw Error("offline");
      return { text: "restored answer" };
    },
  };
  const queue = new RecordedBackupQueue(ports);
  await queue.add({
    id: "a",
    requestId: "r",
    questionKey: "q",
    session: 1,
    uri: "local",
    mimeType: "audio/m4a",
    durationMs: 1500,
  });
  await expect(queue.flush(() => {})).rejects.toThrow("offline");
  expect(stored).toHaveLength(1);
  online = true;
  const apply = jest.fn<(clip: unknown, text: string) => void>();
  await new RecordedBackupQueue(ports).flush(apply);
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ id: "a" }),
    "restored answer",
  );
  expect(stored).toEqual([]);
});

test("OpenAI handshake sends transcription settings and PCM, then merges final words", async () => {
  const sent: string[] = [];
  const socket: SocketPort = {
    readyState: 1,
    send: (value) => sent.push(value),
    close: () => {},
    onopen: null,
    onerror: null,
    onclose: null,
    onmessage: null,
  };
  let frame: ((samples: Float32Array, rate: number) => void) | undefined;
  const capture = {
    available: true,
    start: async (callback: (samples: Float32Array, rate: number) => void) => {
      frame = callback;
    },
    stop: async () => {},
  };
  const grant = jest.fn<() => Promise<{ available: true; secret: string }>>(
    async () => ({ available: true, secret: "fictional-ephemeral" }),
  );
  const source = new OpenAiLiveSpeech({
    grant,
    capture,
    socket: (_url, protocols) => {
      expect(protocols).toEqual([
        "realtime",
        "openai-insecure-api-key.fictional-ephemeral",
      ]);
      return socket;
    },
  });
  const onText = jest.fn();
  const onError = jest.fn();
  const start = source.start({ lang: "en-US" }, { onText, onError });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  socket.onopen?.();
  await start;
  frame!(new Float32Array([0, 1]), 24000);
  source.commit();
  expect(JSON.parse(sent[0])).toMatchObject({
    type: "session.update",
    session: {
      type: "transcription",
      audio: { input: { format: { rate: 24000 }, turn_detection: null } },
    },
  });
  expect(JSON.parse(sent[1])).toEqual({
    type: "input_audio_buffer.append",
    audio: "AAD/fw==",
  });
  expect(JSON.parse(sent[2])).toEqual({ type: "input_audio_buffer.commit" });
  socket.onmessage?.({
    data: JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "one",
      transcript: "I check stock",
    }),
  });
  expect(onText).toHaveBeenLastCalledWith("I check stock");
  await source.stop();
});

test("sound without words restarts at six seconds, then falls back after three retries", async () => {
  let now = 0;
  let handlers!: LiveSpeechHandlers;
  const start = jest.fn<LiveSpeech["start"]>(async (_options, current) => {
    handlers = current;
  });
  const primary: LiveSpeech = {
    kind: "openai",
    source: "voice_openai",
    start,
    stop: async () => {},
  };
  const fallbackStart = jest.fn<LiveSpeech["start"]>(async () => {});
  const speech = new ResilientLiveSpeech(
    primary,
    {
      kind: "native",
      source: "voice_device",
      start: fallbackStart,
      stop: async () => {},
    },
    () => now,
  );
  await speech.start(
    { lang: "en-US" },
    { onText: () => {}, onError: () => {} },
  );
  handlers.onLevel?.(0.5);
  for (now = 6000; now <= 24000; now += 6000) {
    handlers.onLevel?.(0.5);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
  expect(start).toHaveBeenCalledTimes(4);
  expect(fallbackStart).toHaveBeenCalledTimes(1);
  expect(speech.source).toBe("voice_device");
  await speech.stop();
});

test("prepared question audio is reused under reducer-generated replay IDs", async () => {
  const repository = {
    getVoiceLines: jest.fn<VoiceLinesRepository["getVoiceLines"]>(
      async (input) => ({
        lines: input.lines.map((line) => ({
          id: line.id,
          url: "audio",
          hash: "a".repeat(64),
          durationMs: 100,
        })),
      }),
    ),
  };
  const play = jest.fn<(uri: string) => Promise<void>>(async () => {});
  const out = createVoiceOut({
    repository,
    device: null,
    cache: { cache: async () => "cached-question" },
    playback: { play, stop: () => {} },
  });
  await Promise.all([
    out.prepare([{ id: "batch-question", text: "What comes next?" }]),
    out.prepare([{ id: "dynamic-question", text: "What comes next?" }]),
  ]);
  await out.play("dynamic-question");
  expect(repository.getVoiceLines).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledWith("cached-question");
  await out.dispose();
});

test("untrusted audio URLs never receive the participant bearer headers", async () => {
  const headers = jest.fn<() => Promise<Record<string, string>>>(async () => ({
    Authorization: "Bearer fictional",
  }));
  const speak = jest.fn<(text: string, speed: number) => Promise<void>>(
    async () => {},
  );
  const out = createVoiceOut({
    allowedAudioOrigin: "https://meeting.example.test",
    downloadHeaders: headers,
    repository: {
      getVoiceLines: async () => ({
        lines: [
          {
            id: "q",
            url: `https://other.example.test/api/mobile/v1x/voice/audio/${"a".repeat(64)}.mp3`,
            hash: "a".repeat(64),
            durationMs: 100,
          },
        ],
      }),
    },
    device: { speak, stop: () => {} },
  });
  await out.prepare([{ id: "q", text: "What comes next?" }]);
  await out.play("q");
  expect(headers).not.toHaveBeenCalled();
  expect(speak).toHaveBeenCalledWith("What comes next?", 1);
  await out.dispose();
});

test("Stop during server preparation prevents late speech after leaving the room", async () => {
  let complete!: (value: {
    lines: { id: string; url: string; hash: string; durationMs: number }[];
  }) => void;
  const playback = {
    play: jest.fn<(uri: string) => Promise<void>>(async () => {}),
    stop: () => {},
  };
  const device = {
    speak: jest.fn<(text: string, speed: number) => Promise<void>>(
      async () => {},
    ),
    stop: () => {},
  };
  const out = createVoiceOut({
    repository: {
      getVoiceLines: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
    device,
    playback,
    cache: { cache: async () => "audio" },
  });
  const pending = out.speak("A delayed question", { id: "delayed" });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  out.stop();
  complete({
    lines: [
      { id: "delayed", url: "audio", hash: "a".repeat(64), durationMs: 100 },
    ],
  });
  await pending;
  expect(playback.play).not.toHaveBeenCalled();
  expect(device.speak).not.toHaveBeenCalled();
  await out.dispose();
});
