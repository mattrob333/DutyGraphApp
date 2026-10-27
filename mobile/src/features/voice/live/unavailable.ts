import type { LiveSpeech, LiveSpeechHandlers, LiveSpeechStartOptions } from './types';

/**
 * No recognizer on this device or in this build (Expo Go, web without speech support). The deck
 * starts in typing mode; if it asks to listen anyway, it hears "not available".
 */
export class UnavailableLiveSpeech implements LiveSpeech {
  readonly kind = 'unavailable' as const;

  constructor(
    /** Why, for logs and the Developer panel: `no_module`, `not_available` or `chosen`. */
    readonly reason: string = 'not_available',
  ) {}

  async start(_options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers): Promise<void> {
    handlers.onError({ code: 'not_available' });
  }

  async stop(): Promise<void> {}
}
