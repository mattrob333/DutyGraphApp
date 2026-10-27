// The real module needs a development build; under jest requiring it fails like it does in Expo Go.
jest.mock('expo-speech-recognition', () => {
  throw new Error("Cannot find native module 'ExpoSpeechRecognition'");
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { HF_IDS } from '@/api/mock/handsFree';
import { useSimulationStore } from '@/state/simulation';
import { createLiveSpeech, loadSpeechModule, NativeLiveSpeech, SimulatedLiveSpeech, type LiveSpeechError, type SpeechModuleLike } from '..';

function recorder() {
  const texts: string[] = [];
  const errors: LiveSpeechError[] = [];
  let pauses = 0;
  return { texts, errors, pauses: () => pauses, handlers: { onText: (t: string) => texts.push(t), onError: (e: LiveSpeechError) => errors.push(e), onPause: () => void pauses++ } };
}

describe('simulated live speech', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    useSimulationStore.getState().reset();
  });

  it('plays the prototype script two words every 180 ms, for the question and attempt', async () => {
    const speech = createLiveSpeech({ dataSource: 'mock', requestId: HF_IDS.cobalt });
    expect(speech.kind).toBe('simulated');
    const r = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 0, attempt: 1 } }, r.handlers);
    jest.advanceTimersByTime(180);
    expect(r.texts).toEqual(['Then it']);
    jest.advanceTimersByTime(180 * 20);
    expect(r.texts[r.texts.length - 1]).toBe('Then it goes to the warehouse team. Usually Priya picks it up.');
    const n = r.texts.length;
    jest.advanceTimersByTime(2000);
    expect(r.texts).toHaveLength(n); // done: no repeats
  });

  it('joins the sentences of one attempt, as one answer', async () => {
    const speech = createLiveSpeech({ dataSource: 'mock', requestId: HF_IDS.cobalt });
    const r = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 4, attempt: 0 } }, r.handlers);
    jest.advanceTimersByTime(180 * 10);
    expect(r.texts[r.texts.length - 1]).toBe("Hmm. I don't know yet, honestly. It changes week to week.");
  });

  it('stop halts the words, and a new start replaces the old run', async () => {
    const speech = createLiveSpeech({ dataSource: 'mock', requestId: HF_IDS.cobalt });
    const a = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 2, attempt: 0 } }, a.handlers);
    jest.advanceTimersByTime(360);
    await speech.stop();
    await speech.stop(); // safe twice
    jest.advanceTimersByTime(5000);
    expect(a.texts).toEqual(['Orders wait', 'Orders wait when they']);
    const b = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 1, attempt: 0 } }, b.handlers);
    await speech.start({ lang: 'en-US', script: { questionIndex: 3, attempt: 0 } }, b.handlers);
    jest.advanceTimersByTime(180);
    expect(b.texts).toEqual(['I check']);
  });

  it('carries on after a restart of the same question and attempt (Resume) instead of repeating', async () => {
    const speech = new SimulatedLiveSpeech({ sentences: () => ['one two three four five six'], tickMs: 100 });
    const a = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 0, attempt: 0 } }, a.handlers);
    jest.advanceTimersByTime(200);
    await speech.stop();
    const b = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 0, attempt: 0 } }, b.handlers);
    jest.advanceTimersByTime(1000);
    expect(a.texts).toEqual(['one two', 'one two three four']);
    expect(b.texts).toEqual(['five six']);
    const c = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 0, attempt: 0 } }, c.handlers);
    jest.advanceTimersByTime(1000);
    expect(c.texts).toEqual([]);
  });

  it('is silent with no script (free talk) or a missing attempt', async () => {
    const speech = createLiveSpeech({ dataSource: 'mock', requestId: HF_IDS.cobalt });
    const r = recorder();
    await speech.start({ lang: 'en-US' }, r.handlers);
    jest.advanceTimersByTime(5000);
    await speech.start({ lang: 'en-US', script: { questionIndex: 1, attempt: 3 } }, r.handlers);
    jest.advanceTimersByTime(5000);
    await speech.start({ lang: 'en-US', script: { questionIndex: 6, attempt: 0 } }, r.handlers); // "Anything else?"
    jest.advanceTimersByTime(5000);
    expect(r.texts).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('reports a blocked microphone with the Developer toggle', async () => {
    useSimulationStore.getState().set({ micDenied: true });
    const r = recorder();
    await createLiveSpeech({ dataSource: 'mock' }).start({ lang: 'en-US', script: { questionIndex: 0, attempt: 0 } }, r.handlers);
    jest.advanceTimersByTime(1000);
    expect(r.errors).toEqual([{ code: 'permission_denied' }]);
    expect(r.texts).toEqual([]);
  });

  it('honours its timing options', async () => {
    const speech = new SimulatedLiveSpeech({ sentences: () => ['one two three four five'], wordsPerTick: 3, tickMs: 50 });
    const r = recorder();
    await speech.start({ lang: 'en-US', script: { questionIndex: 0, attempt: 0 } }, r.handlers);
    jest.advanceTimersByTime(100);
    expect(r.texts).toEqual(['one two three', 'one two three four five']);
  });
});

type Listener = (e: any) => void;
function fakeModule(over: Partial<SpeechModuleLike> = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload?: unknown) => listeners.get(event)?.forEach((l) => l(payload));
  const mod = {
    starts: [] as Record<string, unknown>[],
    aborts: 0,
    start: jest.fn((o: Record<string, unknown>) => {
      mod.starts.push(o);
      emit('start');
    }),
    stop: jest.fn(),
    abort: jest.fn(() => {
      mod.aborts += 1;
      emit('error', { error: 'aborted', message: '' });
      emit('end');
    }),
    addListener: jest.fn((event: string, l: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(l);
      return { remove: () => listeners.get(event)!.delete(l) };
    }),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    isRecognitionAvailable: jest.fn(() => true),
    supportsOnDeviceRecognition: jest.fn(() => true),
    emit,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    snapshot: (event: string) => [...(listeners.get(event) ?? [])],
    ...over,
  };
  return mod;
}

describe('createLiveSpeech', () => {
  it('uses the simulated recognizer for demo data', () => {
    expect(createLiveSpeech({ dataSource: 'mock', loadNative: () => fakeModule() }).kind).toBe('simulated');
  });

  it('uses the phone recognizer for real data when the build has it and the phone has one', () => {
    expect(createLiveSpeech({ dataSource: 'http', loadNative: () => fakeModule() }).kind).toBe('native');
  });

  it('falls back to unavailable without the module, without a recognizer, or when the check throws', () => {
    expect(createLiveSpeech({ dataSource: 'http', loadNative: () => null })).toMatchObject({ kind: 'unavailable', reason: 'no_module' });
    expect(createLiveSpeech({ dataSource: 'http', loadNative: () => fakeModule({ isRecognitionAvailable: () => false }) })).toMatchObject({ kind: 'unavailable', reason: 'not_available' });
    const throwing = fakeModule({
      isRecognitionAvailable: () => {
        throw new Error('boom');
      },
    });
    expect(createLiveSpeech({ dataSource: 'http', loadNative: () => throwing }).kind).toBe('unavailable');
    expect(createLiveSpeech({ kind: 'unavailable' }).kind).toBe('unavailable');
  });

  it('loads the native module softly: in Expo Go (and jest) it is missing', () => {
    expect(loadSpeechModule()).toBeNull();
    expect(createLiveSpeech({ dataSource: 'http' })).toMatchObject({ kind: 'unavailable', reason: 'no_module' });
  });

  it('the unavailable recognizer answers start with not_available', async () => {
    const r = recorder();
    await createLiveSpeech({ kind: 'unavailable' }).start({ lang: 'en-US' }, r.handlers);
    expect(r.errors).toEqual([{ code: 'not_available' }]);
  });
});

describe('native live speech (fake module)', () => {
  it('fences old task callbacks after stopping and starting a new session', async () => {
    const mod = fakeModule();
    const speech = new NativeLiveSpeech(mod);
    const first = recorder(), second = recorder();
    await speech.start({ lang: 'en-US' }, first.handlers);
    const prior = mod.snapshot('result')[0];
    await speech.stop();
    await speech.start({ lang: 'en-US' }, second.handlers);
    prior({ isFinal: true, results: [{ transcript: 'old card words' }] });
    expect(second.texts).toEqual([]);
    mod.emit('result', { isFinal: false, results: [{ transcript: 'new card words' }] });
    expect(second.texts).toEqual(['new card words']);
    await speech.stop();
  });

  it('fails closed if the old recognizer never reports a terminal end', async () => {
    jest.useFakeTimers();
    try {
      const mod = fakeModule();
      mod.abort = () => { mod.aborts += 1; };
      const speech = new NativeLiveSpeech(mod);
      const first = recorder(), second = recorder();
      await speech.start({ lang: 'en-US' }, first.handlers);
      const stopping = speech.stop();
      jest.advanceTimersByTime(2000);
      await stopping;
      await speech.start({ lang: 'en-US' }, second.handlers);
      expect(mod.starts).toHaveLength(1);
      expect(second.errors).toEqual([{ code: 'not_available' }]);
    } finally { jest.useRealTimers(); }
  });

  it('waits for the native abort end before opening the next recognizer task', async () => {
    const mod = fakeModule();
    mod.abort = () => { mod.aborts += 1; };
    const speech = new NativeLiveSpeech(mod);
    const first = recorder(), second = recorder();
    await speech.start({ lang: 'en-US' }, first.handlers);
    const stopping = speech.stop();
    const starting = speech.start({ lang: 'en-US' }, second.handlers);
    await Promise.resolve();
    expect(mod.starts).toHaveLength(1);
    mod.emit('result', { isFinal: true, results: [{ transcript: 'late old result' }] });
    expect(second.texts).toEqual([]);
    mod.emit('end');
    await stopping;
    await starting;
    expect(mod.starts).toHaveLength(2);
    mod.emit('result', { isFinal: false, results: [{ transcript: 'new session' }] });
    expect(second.texts).toEqual(['new session']);
    const finalStop = speech.stop(); mod.emit('end'); await finalStop;
  });

  it('starts on-device with interim results and adds final phrases to the text', async () => {
    const mod = fakeModule();
    const speech = new NativeLiveSpeech(mod);
    const r = recorder();
    await speech.start({ lang: 'en-US' }, r.handlers);
    expect(mod.starts[0]).toMatchObject({ lang: 'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: true });
    mod.emit('result', { isFinal: false, results: [{ transcript: 'Most orders' }] });
    mod.emit('result', { isFinal: false, results: [{ transcript: 'Most orders come in' }] });
    mod.emit('result', { isFinal: true, results: [{ transcript: 'Most orders come in through the portal.' }] });
    mod.emit('result', { isFinal: false, results: [{ transcript: 'First I' }] });
    expect(r.texts).toEqual(['Most orders', 'Most orders come in', 'Most orders come in through the portal.', 'Most orders come in through the portal. First I']);
    mod.emit('speechend');
    expect(r.pauses()).toBe(1);
  });

  it('restarts when the recognizer ends on its own and keeps the words so far', async () => {
    const mod = fakeModule({ supportsOnDeviceRecognition: () => false });
    const speech = new NativeLiveSpeech(mod);
    const r = recorder();
    await speech.start({ lang: 'en-US' }, r.handlers);
    expect(mod.starts[0].requiresOnDeviceRecognition).toBe(false);
    mod.emit('result', { isFinal: false, results: [{ transcript: 'Orders wait' }] });
    mod.emit('error', { error: 'no-speech', message: '' });
    mod.emit('end');
    expect(mod.starts).toHaveLength(2);
    mod.emit('result', { isFinal: false, results: [{ transcript: 'for a credit check' }] });
    expect(r.texts[r.texts.length - 1]).toBe('Orders wait for a credit check');
    expect(r.errors).toEqual([]);
  });

  it('gives up with "other" when the recognizer keeps ending at once', async () => {
    const mod = fakeModule();
    const speech = new NativeLiveSpeech(mod);
    const r = recorder();
    await speech.start({ lang: 'en-US' }, r.handlers);
    for (let i = 0; i < 6; i++) mod.emit('end');
    expect(r.errors).toEqual([{ code: 'other', message: 'restarts' }]);
    expect(mod.aborts).toBe(1);
  });

  it('maps recognizer errors and releases the microphone', async () => {
    const cases: [string, LiveSpeechError['code']][] = [
      ['not-allowed', 'permission_denied'],
      ['network', 'network'],
      ['audio-capture', 'other'],
    ];
    for (const [error, code] of cases) {
      const mod = fakeModule();
      const r = recorder();
      await new NativeLiveSpeech(mod).start({ lang: 'en-US' }, r.handlers);
      mod.emit('error', { error, message: 'm' });
      expect(r.errors.map((e) => e.code)).toEqual([code]);
      expect(mod.aborts).toBe(1);
      expect(mod.listenerCount()).toBe(0);
    }
  });

  it('falls back from on-device to the platform service once when the language has no model', async () => {
    const mod = fakeModule();
    const r = recorder();
    await new NativeLiveSpeech(mod).start({ lang: 'en-US' }, r.handlers);
    mod.emit('error', { error: 'language-not-supported', message: '' });
    mod.emit('end');
    expect(mod.starts.map((o) => o.requiresOnDeviceRecognition)).toEqual([true, false]);
    expect(r.errors).toEqual([]);
    mod.emit('error', { error: 'language-not-supported', message: '' });
    expect(r.errors).toEqual([{ code: 'not_available' }]);
  });

  it('reports a denied permission without starting the recognizer', async () => {
    const mod = fakeModule({ requestPermissionsAsync: async () => ({ granted: false }) });
    const r = recorder();
    await new NativeLiveSpeech(mod).start({ lang: 'en-US' }, r.handlers);
    expect(r.errors).toEqual([{ code: 'permission_denied' }]);
    expect(mod.start).not.toHaveBeenCalled();
  });

  it('stop aborts once, drops late events, and is safe twice', async () => {
    const mod = fakeModule();
    const speech = new NativeLiveSpeech(mod);
    const r = recorder();
    await speech.start({ lang: 'en-US' }, r.handlers);
    await speech.stop();
    await speech.stop();
    expect(mod.aborts).toBe(1);
    mod.emit('result', { isFinal: false, results: [{ transcript: 'late words' }] });
    expect(r.texts).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(mod.starts).toHaveLength(1);
  });

  it('releases the microphone when the app leaves the foreground', async () => {
    const handlers: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: () => {} };
    }) as any);
    const mod = fakeModule();
    const r = recorder();
    await new NativeLiveSpeech(mod).start({ lang: 'en-US' }, r.handlers);
    handlers.forEach((h) => h('background'));
    expect(mod.aborts).toBe(1);
    expect(r.errors).toEqual([{ code: 'other', message: 'background' }]);
    spy.mockRestore();
  });

  it('a stop during the permission prompt keeps the microphone closed', async () => {
    let grant: (v: { granted: boolean }) => void = () => {};
    const mod = fakeModule({ requestPermissionsAsync: () => new Promise((res) => (grant = res)) });
    const speech = new NativeLiveSpeech(mod);
    const r = recorder();
    const started = speech.start({ lang: 'en-US' }, r.handlers);
    await Promise.resolve();
    await speech.stop();
    grant({ granted: true });
    await started;
    expect(mod.start).not.toHaveBeenCalled();
  });
});

it('native PCM unavailable selects device speech without minting a provider secret', async () => {
  const grant = jest.fn<() => Promise<{available: false}>>(async () => ({ available: false }));
  const source = createLiveSpeech({ dataSource: 'http', kind: 'openai', grant, capture: { available: false, start: async () => { throw Error('no PCM'); }, stop: async () => {} }, loadNative: () => fakeModule() });
  expect(source.kind).toBe('native'); expect(source.source).toBe('voice_device');
  expect(grant).not.toHaveBeenCalled();
  const unavailable = createLiveSpeech({ dataSource: 'http', kind: 'openai', grant, capture: { available: false, start: async () => {}, stop: async () => {} }, loadNative: () => null });
  expect(unavailable.kind).toBe('unavailable');
  const result = recorder(); await unavailable.start({lang:'en-US'},result.handlers); expect(result.errors).toEqual([{code:'not_available'}]); expect(grant).not.toHaveBeenCalled();
});
