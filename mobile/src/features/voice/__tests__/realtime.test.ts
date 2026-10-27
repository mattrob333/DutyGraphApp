import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { RealtimeFacilitatorVoice } from "../meeting/realtime/RealtimeFacilitatorVoice";
import {
  NativeRealtimeTransport,
  realtimeCapability,
} from "../meeting/realtime/native";
import type {
  RealtimeMessage,
  RealtimeTransport,
  RealtimeTransportEvent,
} from "../meeting/realtime/types";
import { MeetingTurnController } from "../meeting/facilitator";
class FakeTransport implements RealtimeTransport {
  sent: RealtimeMessage[] = [];
  output: boolean[] = [];
  closed = false;
  answered = false;
  private listeners = new Set<(event: RealtimeTransportEvent) => void>();
  createOffer = async () => "v=0\noffer";
  acceptAnswer = async (_sdp: string) => {
    this.answered = true;
    this.emit({ type: "open" });
  };
  send(message: RealtimeMessage) {
    this.sent.push(message);
    if (message.type === "session.update")
      this.message({
        type: "session.updated",
        session: {
          audio: { input: { turn_detection: { create_response: false } } },
        },
      });
  }
  setOutputEnabled(enabled: boolean) {
    this.output.push(enabled);
  }
  subscribe(listener: (event: RealtimeTransportEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  close() {
    this.closed = true;
    this.listeners.clear();
  }
  queuedEvent(event: RealtimeTransportEvent) {
    const callbacks = [...this.listeners];
    return () => {
      for (const listener of callbacks) listener(event);
    };
  }
  emit(event: RealtimeTransportEvent) {
    for (const listener of this.listeners) listener(event);
  }
  message(message: RealtimeMessage) {
    this.emit({ type: "message", message });
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(
  extra: Partial<
    ConstructorParameters<typeof RealtimeFacilitatorVoice>[0]
  > = {},
) {
  const transports: FakeTransport[] = [],
    speech = jest.fn(),
    transcript = jest.fn(),
    states = jest.fn();
  const mint = jest.fn(
    async (_id: string, _input: { sdp: string; summary?: string }) => ({
      available: true as const,
      sdp: "v=0\nanswer",
      model: "fake-injected-test",
    }),
  );
  const voice = new RealtimeFacilitatorVoice({
    enabled: true,
    available: true,
    canBegin: () => true,
    transport: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    mint,
    onSpeech: speech,
    onTranscript: transcript,
    onState: states,
    ...extra,
  });
  return { voice, transports, mint, speech, transcript, states };
}
afterEach(() => {
  jest.useRealTimers();
});
describe("bounded realtime facilitator", () => {
  it("ignores queued transcript, VAD and response events after a failed connection closes", async () => {
    const f = fixture();
    await f.voice.prepare("session");
    const transport = f.transports[0];
    const lateTranscript = transport.queuedEvent({
      type: "message",
      message: {
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Late private words",
      },
    });
    const lateSpeech = transport.queuedEvent({
      type: "message",
      message: { type: "input_audio_buffer.speech_started" },
    });
    const lateResponse = transport.queuedEvent({
      type: "message",
      message: {
        type: "response.created",
        response: { id: "late", metadata: { line_id: "line" } },
      },
    });
    const speaking = f.voice.speak(
      { id: "line", text: "Who decides?" },
      "opening",
    );
    const rejected = expect(speaking).rejects.toThrow("disconnected");
    transport.emit({ type: "error" });
    await rejected;
    expect(transport.closed).toBe(true);
    expect(f.voice.state).toBe("error");
    lateTranscript();
    lateSpeech();
    lateResponse();
    expect(f.transcript).not.toHaveBeenCalled();
    expect(f.speech).not.toHaveBeenCalled();
    expect(transport.output.at(-1)).toBe(false);
    await f.voice.prepare("session");
    expect(f.transports).toHaveLength(2);
    await f.voice.dispose();
    lateTranscript();
    expect(f.transcript).not.toHaveBeenCalled();
  });
  it("does not request any microphone or provider without the flag, native capability, and consent", async () => {
    for (const override of [
      { enabled: false },
      { available: false },
      { canBegin: () => false },
    ]) {
      const f = fixture(override);
      await expect(f.voice.prepare("session")).rejects.toThrow();
      expect(f.transports).toHaveLength(0);
      expect(f.mint).not.toHaveBeenCalled();
    }
  });
  it("turns off automatic replies and creates audio only for an authorized controller trigger", async () => {
    const f = fixture(),
      events: unknown[] = [];
    f.voice.subscribe((event) => events.push(event));
    await f.voice.prepare("session");
    const transport = f.transports[0];
    expect(transport.sent).toEqual([
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          audio: {
            input: {
              turn_detection: expect.objectContaining({
                create_response: false,
              }),
            },
          },
        }),
      }),
    ]);
    await expect(
      f.voice.speak({ id: "wrong", text: "No trigger" }),
    ).rejects.toThrow("trigger");
    const speaking = f.voice.speak(
      { id: "line", text: "Who owns the credentials?" },
      "leader_next",
    );
    expect(transport.sent.at(-1)).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["audio"],
        metadata: { line_id: "line", trigger: "leader_next" },
      },
    });
    transport.message({
      type: "response.created",
      response: { id: "unsolicited", metadata: {} },
    });
    expect(transport.output.at(-1)).toBe(false);
    expect(transport.sent.at(-1)).toMatchObject({
      type: "response.cancel",
      response_id: "unsolicited",
    });
    transport.message({
      type: "response.created",
      response: { id: "response-one", metadata: { line_id: "line" } },
    });
    expect(transport.output.at(-1)).toBe(true);
    transport.message({
      type: "output_audio_buffer.started",
      response_id: "response-one",
    });
    expect(events).toEqual([{ type: "start", lineId: "line" }]);
    let finished = false;
    void speaking.then(() => {
      finished = true;
    });
    transport.message({ type: "response.done", response_id: "response-one" });
    await Promise.resolve();
    expect(finished).toBe(false);
    transport.message({
      type: "output_audio_buffer.stopped",
      response_id: "response-one",
    });
    await speaking;
    expect(events).toEqual([
      { type: "start", lineId: "line" },
      { type: "end", lineId: "line" },
    ]);
    expect(transport.output.at(-1)).toBe(false);
    await f.voice.dispose();
  });
  it("takes a six-trigger controller turn only after 1.2 seconds of human silence", async () => {
    let now = 0;
    const f = fixture({ now: () => now });
    await f.voice.prepare("session");
    const controller = new MeetingTurnController(f.voice, jest.fn(), () => now);
    controller.queue("opening", {
      id: "opening",
      text: "Please say your name.",
    });
    await controller.tick();
    expect(
      f.transports[0].sent.some((event) => event.type === "response.create"),
    ).toBe(false);
    now = 1200;
    const tick = controller.tick();
    await Promise.resolve();
    expect(
      f.transports[0].sent.some((event) => event.type === "response.create"),
    ).toBe(true);
    controller.speechDetected();
    await tick;
    expect(f.transports[0].output.at(-1)).toBe(false);
    await f.voice.dispose();
  });
  it("cancels immediately on VAD barge-in and does not let an old response resume audio", async () => {
    const f = fixture();
    await f.voice.prepare("session");
    const speaking = f.voice.speak(
      { id: "line", text: "Who decides?" },
      "opening",
    );
    const transport = f.transports[0];
    transport.message({
      type: "response.created",
      response: { id: "r", metadata: { line_id: "line" } },
    });
    transport.message({ type: "input_audio_buffer.speech_started" });
    await speaking;
    expect(f.speech).toHaveBeenCalledWith(true);
    expect(transport.output.at(-1)).toBe(false);
    transport.message({
      type: "response.created",
      response: { id: "r", metadata: { line_id: "line" } },
    });
    expect(transport.output.at(-1)).toBe(false);
    transport.message({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "I own it.",
    });
    expect(f.transcript).toHaveBeenCalledWith("I own it.");
    await f.voice.dispose();
  });
  it("closes microphone input on mute, suspend and disposal and emits no response afterwards", async () => {
    const f = fixture();
    await f.voice.prepare("session");
    f.voice.setMuted(true);
    expect(f.transports[0].closed).toBe(true);
    await f.voice.speak({ id: "muted", text: "Do not speak." }, "opening");
    expect(f.transports[0].sent.some((e) => e.type === "response.create")).toBe(
      false,
    );
    f.voice.setMuted(false);
    await f.voice.prepare("session");
    f.voice.suspend();
    await expect(
      f.voice.speak({ id: "stopped", text: "No" }, "opening"),
    ).rejects.toThrow("transcription");
    await f.voice.dispose();
    await expect(f.voice.prepare("session")).rejects.toThrow("closed");
  });
  it("does not accept a late SDP answer after cancellation or consent revocation during mint", async () => {
    for (const cancel of [true, false]) {
      const grant = deferred<{ available: true; sdp: string; model: string }>();
      let allowed = true;
      const f = fixture({
        canBegin: () => allowed,
        mint: async () => grant.promise,
      });
      const preparing = f.voice.prepare("session");
      await Promise.resolve();
      await Promise.resolve();
      if (cancel) f.voice.suspend();
      else allowed = false;
      grant.resolve({ available: true, sdp: "v=0\nanswer", model: "test" });
      await expect(preparing).rejects.toThrow();
      expect(f.transports[0].answered).toBe(false);
      expect(f.transports[0].closed).toBe(true);
      await f.voice.dispose();
    }
  });
  it("bounds an idle connection at 15 minutes and restarts only after an explicit prepare with a new summary", async () => {
    jest.useFakeTimers();
    let summary = "First topic";
    const f = fixture({ summary: () => summary });
    await f.voice.prepare("session");
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(f.transports[0].closed).toBe(true);
    expect(f.voice.inputActive).toBe(false);
    expect(f.mint).toHaveBeenCalledTimes(1);
    summary = "Current topic and confirmed context";
    await f.voice.prepare("session");
    expect(f.mint.mock.calls[1][1].summary).toBe(summary);
    expect(f.mint).toHaveBeenCalledTimes(2);
    await f.voice.dispose();
  });
  it("closes sooner at a conservative budget bound and watches consent without a subsequent voice turn", async () => {
    jest.useFakeTimers();
    const f = fixture({ lifetimeMs: () => 2500 });
    await f.voice.prepare("session");
    jest.advanceTimersByTime(2500);
    expect(f.transports[0].closed).toBe(true);
    await f.voice.dispose();
    let allowed = true;
    const g = fixture({ canBegin: () => allowed });
    await g.voice.prepare("session");
    allowed = false;
    jest.advanceTimersByTime(1000);
    expect(g.transports[0].closed).toBe(true);
    await g.voice.dispose();
  });
  it("rejects fake secret-only grants and unsafe automatic-response acknowledgments", async () => {
    const fake = fixture({
      mint: async () => ({
        available: true,
        clientSecret: "never-used",
        simulated: true,
        model: "fake",
      }),
    });
    await expect(fake.voice.prepare("session")).rejects.toThrow("unavailable");
    expect(fake.transports[0].closed).toBe(true);
    const transport = new FakeTransport();
    transport.send = (message) => {
      transport.sent.push(message);
      if (message.type === "session.update")
        transport.message({
          type: "session.updated",
          session: {
            audio: { input: { turn_detection: { create_response: true } } },
          },
        });
    };
    const unsafe = fixture({ transport: () => transport });
    await expect(unsafe.voice.prepare("session")).rejects.toThrow("Automatic");
    expect(transport.closed).toBe(true);
  });
});

describe("native WebRTC capability and resource boundaries", () => {
  it("does not even load native code on web or when disabled", () => {
    const load = jest.fn(() => {
      throw Error("No module");
    });
    expect(realtimeCapability(false, "ios", load).available).toBe(false);
    expect(realtimeCapability(true, "web", load).available).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(realtimeCapability(true, "ios", load).available).toBe(false);
  });
  it("stops a microphone stream that arrives after transport close", async () => {
    const pending = deferred<any>(),
      track = { stop: jest.fn() },
      stream = { getTracks: () => [track], release: jest.fn() };
    const transport = new NativeRealtimeTransport({
      mediaDevices: {
        getUserMedia: jest.fn(async (constraints: unknown) => {
          expect(constraints).toEqual({ audio: true, video: false });
          return pending.promise;
        }),
      },
    } as never);
    const offer = transport.createOffer();
    transport.close();
    pending.resolve(stream);
    await expect(offer).rejects.toThrow("stopped");
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(stream.release).toHaveBeenCalledTimes(1);
  });
});
