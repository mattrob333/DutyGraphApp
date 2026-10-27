import { createBrowserSource } from "./browser-source.ts";
import { type ApiFn, createOpenAISource } from "./openai-source.ts";
import type { SpeechSource, SpeechSourceKind } from "./types.ts";

export type { ApiFn } from "./openai-source.ts";
export type * from "./types.ts";

/**
 * The speech source for one hands-free deck (spec §9.1): OpenAI live transcription when the
 * server grants a key, else the browser's speech recognition, else none (typing). `preferred`
 * starts lower in that order ("browser" skips OpenAI, "none" skips both). Create it once per deck:
 * the OpenAI source asks the server for a key here and reuses it for every card.
 *
 * All sources report problems through `handlers.onError` and never reject from `start()`.
 */
export async function createSpeechSource(options: { token: string; api: ApiFn; preferred?: SpeechSourceKind }): Promise<SpeechSource> {
  const preferred = options.preferred ?? "openai";
  if (preferred === "openai") {
    try {
      const { source } = await createOpenAISource({ token: options.token, api: options.api });
      if (source) return source;
    } catch {
      /* Fall through to the browser. */
    }
  }
  if (preferred !== "none") {
    const browser = createBrowserSource();
    if (browser) return browser;
  }
  return noneSource();
}

/** No live words: `start` reports not_available, so the deck moves to typing with its note. */
export function noneSource(): SpeechSource {
  return {
    kind: "none",
    async start(_options, handlers) {
      handlers.onError({ code: "not_available" });
    },
    commit() {},
    reset() {},
    async stop() {},
  };
}
