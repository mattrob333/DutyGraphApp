import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SimulatedVoiceCapture } from '../SimulatedVoiceCapture';
import { RecordedClipCapture, type AudioSession, type RecorderLike } from '../RecordedClipCapture';
import { VoiceError } from '../types';
import { CompanionApiError } from '@/types/domain';

const ANSWER = "Yes, I sent it Wednesday and he's already using it for the late-shift bays.";

describe('SimulatedVoiceCapture', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('streams about two words per 600ms as partials', async () => {
    const cap = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER });
    const seen: string[] = [];
    cap.onPartial((t) => seen.push(t));
    await cap.start();
    jest.advanceTimersByTime(600);
    expect(seen[seen.length - 1]).toBe('Yes, I');
    jest.advanceTimersByTime(600);
    expect(seen[seen.length - 1]).toBe('Yes, I sent it');
    expect(cap.hasLivePartials).toBe(true);
  });

  it('stops streaming while paused and continues on resume', async () => {
    const cap = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER });
    const seen: string[] = [];
    cap.onPartial((t) => seen.push(t));
    await cap.start();
    jest.advanceTimersByTime(600);
    cap.pause();
    const n = seen.length;
    jest.advanceTimersByTime(3000);
    expect(seen.length).toBe(n);
    cap.resume();
    jest.advanceTimersByTime(600);
    expect(seen[seen.length - 1]).toBe('Yes, I sent it');
  });

  it('returns the words heard so far once past two words, otherwise the whole sample (prototype)', async () => {
    const a = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER });
    await a.start();
    jest.advanceTimersByTime(1800); // 6 words
    expect(await a.stop()).toEqual({ text: 'Yes, I sent it Wednesday and' });
    const b = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER });
    await b.start();
    jest.advanceTimersByTime(600);
    expect(await b.stop()).toEqual({ text: ANSWER });
  });

  it('cancel stops timers and clears the transcript', async () => {
    const cap = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER });
    const seen: string[] = [];
    cap.onPartial((t) => seen.push(t));
    await cap.start();
    jest.advanceTimersByTime(600);
    cap.cancel();
    expect(seen[seen.length - 1]).toBe('');
    const n = seen.length;
    jest.advanceTimersByTime(5000);
    expect(seen.length).toBe(n);
  });

  it('rejects start with MIC_DENIED when the simulation blocks the microphone', async () => {
    const cap = new SimulatedVoiceCapture({ sampleAnswer: () => ANSWER, isDenied: () => true });
    await expect(cap.start()).rejects.toMatchObject({ code: 'MIC_DENIED' });
  });

  it('returns null when there is nothing to hear', async () => {
    const cap = new SimulatedVoiceCapture({ sampleAnswer: () => '' });
    await cap.start();
    expect(await cap.stop()).toBeNull();
  });
});

describe('RecordedClipCapture', () => {
  const setup = (over: { granted?: boolean; uri?: string | null; seconds?: number; transcribe?: () => Promise<{ text: string }> } = {}) => {
    const calls: string[] = [];
    const recorder: RecorderLike = {
      prepareToRecordAsync: async () => void calls.push('prepare'),
      record: () => void calls.push('record'),
      pause: () => void calls.push('pause'),
      stop: async () => void calls.push('stop'),
      uri: over.uri === undefined ? 'file:///clip.m4a' : over.uri,
      currentTime: over.seconds ?? 4.2,
    };
    const audio: AudioSession = {
      requestPermission: async () => over.granted ?? true,
      setRecordingMode: async (on) => void calls.push(`mode:${on}`),
    };
    const transcribeClip = jest.fn(over.transcribe ?? (async () => ({ text: '  I sent it.  ' })));
    const cap = new RecordedClipCapture(recorder, audio, { transcribeClip }, 'sess-1');
    return { cap, calls, transcribeClip };
  };

  it('has no live partials', () => {
    expect(setup().cap.hasLivePartials).toBe(false);
  });

  it('opens the microphone only in start(), after permission', async () => {
    const { cap, calls } = setup();
    expect(calls).toEqual([]);
    await cap.start();
    expect(calls).toEqual(['mode:true', 'prepare', 'record']);
  });

  it('rejects with MIC_DENIED and never records when permission is refused', async () => {
    const { cap, calls } = setup({ granted: false });
    await expect(cap.start()).rejects.toMatchObject({ code: 'MIC_DENIED' });
    expect(calls).not.toContain('record');
  });

  it('pauses and resumes the recorder', async () => {
    const { cap, calls } = setup();
    await cap.start();
    cap.pause();
    cap.resume();
    expect(calls.slice(-2)).toEqual(['pause', 'record']);
  });

  it('on stop uploads the clip with the contract mime type and returns trimmed text', async () => {
    const { cap, calls, transcribeClip } = setup();
    await cap.start();
    const res = await cap.stop();
    expect(transcribeClip).toHaveBeenCalledWith({ sessionId: 'sess-1', uri: 'file:///clip.m4a', mimeType: 'audio/m4a', durationMs: 4200 });
    expect(res).toEqual({ text: 'I sent it.' });
    expect(calls).toContain('stop');
    expect(calls[calls.length - 1]).toBe('mode:false');
  });

  it('returns null for a clip that is too short or empty and does not upload it', async () => {
    const { cap, transcribeClip } = setup({ seconds: 0.1 });
    await cap.start();
    expect(await cap.stop()).toBeNull();
    expect(transcribeClip).not.toHaveBeenCalled();
  });

  it('keeps API errors (e.g. offline) intact and wraps anything else', async () => {
    const offline = setup({ transcribe: async () => { throw new CompanionApiError('NETWORK_OFFLINE', 'offline', 0, true); } });
    await offline.cap.start();
    await expect(offline.cap.stop()).rejects.toMatchObject({ status: 0 });
    const odd = setup({ transcribe: async () => { throw new Error('boom'); } });
    await odd.cap.start();
    await expect(odd.cap.stop()).rejects.toBeInstanceOf(VoiceError);
  });

  it('cancel releases the recorder and discards the clip', async () => {
    const { cap, calls, transcribeClip } = setup();
    await cap.start();
    cap.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toContain('stop');
    expect(transcribeClip).not.toHaveBeenCalled();
    expect(await cap.stop()).toBeNull();
  });
});
