import { AppState, type NativeEventSubscription } from 'react-native';
import type { LiveSpeech, LiveSpeechError, LiveSpeechHandlers, LiveSpeechStartOptions } from './types';

type Subscription = { remove(): void };

/**
 * The part of `ExpoSpeechRecognitionModule` (expo-speech-recognition 57.x) this adapter uses.
 * Written out so tests can pass a fake and nothing here loads the native module at import time.
 */
export interface SpeechModuleLike {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  addListener(event: 'start' | 'end' | 'speechend' | 'result' | 'error' | 'volumechange', listener: (event: any) => void): Subscription;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
}

/**
 * Loads the recognizer lazily. Expo Go and builds made before the module was added have no
 * `ExpoSpeechRecognition` native module; requiring it then throws, and the app falls back to
 * typing instead of crashing.
 */
export function loadSpeechModule(): SpeechModuleLike | null {
  try {
    return (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: SpeechModuleLike }).ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

/** How long `start` waits for the recognizer to report that the microphone is open. */
const OPEN_TIMEOUT_MS = 2000;
/** A recognizer that keeps ending on its own (Android 12 and older stop after each phrase) is restarted, within reason. */
const MAX_QUICK_RESTARTS = 5;
const QUICK_RESTART_WINDOW_MS = 10_000;

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');

/**
 * The phone's own speech recognizer (iOS Speech, Android SpeechRecognizer) through
 * expo-speech-recognition, with interim results. It asks for on-device recognition where the
 * phone supports it, so the audio stays on the phone; otherwise the platform's speech service
 * (Apple or Google) recognizes it, as the iOS permission text says. The microphone is released
 * on `stop`, on any error, and when the app goes to the background.
 */
export class NativeLiveSpeech implements LiveSpeech {
  readonly kind = 'native' as const;
  readonly source = 'voice_device' as const;
  reset() { this.committed = ''; this.interim = ''; this.watchdogRestarts = 0; this.soundSince = null; this.lastWordAt = this.now(); }
  private run = 0;
  private active = false;
  private subs: Subscription[] = [];
  private appState: NativeEventSubscription | null = null;
  private handlers: LiveSpeechHandlers | null = null;
  private lang = 'en-US';
  private onDevice = false;
  private triedNetwork = false;
  /** Final segments so far (Android sends each phrase as its own final result). */
  private committed = '';
  private interim = '';
  private soundSince: number | null = null;
  private lastWordAt = 0;
  private watchdogRestarts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private restarts: number[] = [];
  private opened: (() => void) | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly mod: SpeechModuleLike,
    private readonly now: () => number = Date.now,
  ) {}

  async start(options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers): Promise<void> {
    await this.stop();
    const run = ++this.run;
    let granted = false;
    try {
      granted = (await this.mod.requestPermissionsAsync()).granted;
    } catch {
      granted = false;
    }
    if (run !== this.run) return; // stopped while the permission prompt was up
    if (!granted) return handlers.onError({ code: 'permission_denied' });
    if (!this.safe(() => this.mod.isRecognitionAvailable(), false)) return handlers.onError({ code: 'not_available' });

    this.handlers = handlers;
    this.lang = options.lang;
    this.onDevice = this.safe(() => this.mod.supportsOnDeviceRecognition(), false);
    this.triedNetwork = !this.onDevice;
    this.committed = '';
    this.interim = '';
    this.restarts = [];
    this.active = true;
    this.subs = [
      this.mod.addListener('start', () => this.markOpen()),
      this.mod.addListener('result', (e) => this.onResult(run, e)),
      this.mod.addListener('error', (e) => this.onError(run, e)),
      this.mod.addListener('end', () => this.onEnd(run)),
      this.mod.addListener('volumechange', (event) => {
        if (run !== this.run || !this.active) return;
        const level = Math.max(0, event.value ?? 0) / 10;
        this.handlers?.onLevel?.(level);
        if (level < 0.03) { this.soundSince = null; return; }
        const now = this.now(); this.soundSince ??= now;
        if (now - Math.max(this.soundSince, this.lastWordAt) < 6000) return;
        this.soundSince = now;
        if (this.watchdogRestarts++ >= 3) return this.fail(run, { code: 'not_available' });
        this.safe(() => this.mod.stop(), undefined);
      }),
      this.mod.addListener('speechend', () => run === this.run && this.active && this.handlers?.onPause?.()),
    ];
    this.appState = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && run === this.run && this.active) this.fail(run, { code: 'other', message: 'background' });
    });
    const open = new Promise<void>((resolve) => {
      this.opened = resolve;
      this.openTimer = setTimeout(() => this.markOpen(), OPEN_TIMEOUT_MS);
    });
    this.begin(run);
    await open;
  }

  async stop(): Promise<void> {
    this.run += 1;
    this.release(true);
  }

  private begin(run: number) {
    try {
      this.mod.start({
        lang: this.lang,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: this.onDevice,
        addsPunctuation: true,
        iosTaskHint: 'dictation',
        iosVoiceProcessingEnabled: true,
      });
    } catch (e) {
      this.fail(run, { code: 'other', message: e instanceof Error ? e.message : undefined });
    }
  }

  private onResult(run: number, e: { isFinal?: boolean; results?: { transcript?: string }[] }) {
    if (run !== this.run || !this.active) return;
    this.lastWordAt = this.now(); this.soundSince = null; this.reconnectDelay = 2000;
    const text = e?.results?.[0]?.transcript ?? '';
    if (e?.isFinal) {
      this.committed = join(this.committed, text);
      this.interim = '';
    } else {
      this.interim = text;
    }
    this.restarts = [];
    this.handlers?.onText(join(this.committed, this.interim));
  }

  private onError(run: number, e: { error?: string; message?: string }) {
    if (run !== this.run || !this.active) return;
    switch (e?.error) {
      case 'aborted':
      case 'no-speech':
      case 'speech-timeout':
        return; // silence is the deck's business; 'end' follows and listening restarts
      case 'not-allowed':
        return this.fail(run, { code: 'permission_denied' });
      case 'language-not-supported':
      case 'service-not-allowed':
        // No on-device model for this language (common on Android): try the platform service once.
        if (this.onDevice && !this.triedNetwork) {
          this.onDevice = false;
          this.triedNetwork = true;
          return;
        }
        return this.fail(run, { code: 'not_available' });
      case 'network':
        if (this.committed || this.interim) {
          if (!this.reconnectTimer) { this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (run === this.run && this.active) this.begin(run); }, this.reconnectDelay); this.reconnectDelay = Math.min(15000, this.reconnectDelay * 2); }
          return;
        }
        return this.fail(run, { code: 'network' });
      default:
        return this.fail(run, { code: 'other', message: e?.message });
    }
  }

  private onEnd(run: number) {
    if (run !== this.run || !this.active || this.reconnectTimer) return;
    // Still listening as far as the deck knows: keep the words so far and start again.
    if (this.interim) this.committed = join(this.committed, this.interim);
    this.interim = '';
    const t = this.now();
    this.restarts = this.restarts.filter((x) => t - x < QUICK_RESTART_WINDOW_MS).concat(t);
    if (this.restarts.length > MAX_QUICK_RESTARTS) return this.fail(run, { code: 'other', message: 'restarts' });
    this.begin(run);
  }

  private fail(run: number, error: LiveSpeechError) {
    if (run !== this.run || !this.active) return;
    const handlers = this.handlers;
    this.run += 1;
    this.release(true);
    handlers?.onError(error);
  }

  private markOpen() {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
    this.opened?.();
    this.opened = null;
  }

  private release(abort: boolean) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const wasActive = this.active;
    this.active = false;
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.appState?.remove();
    this.appState = null;
    this.handlers = null;
    this.markOpen();
    if (abort && wasActive) this.safe(() => this.mod.abort(), undefined);
  }

  private safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }
}
