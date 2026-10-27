export * from "./types.ts";
export {
  ProviderError,
  dataBlock,
  durationFor,
  LIVE_PROMPT,
  transcriptionSettings,
} from "./common.ts";
export { createFakeProviders } from "./fake.ts";
export { createOpenAIProviders } from "./openai.ts";
import type { ProviderConfig, Providers } from "./types.ts";
import { createOpenAIProviders } from "./openai.ts";
/** Keys are explicit config only. Tests do not inherit process credentials. */
export function createProviders(
  config: ProviderConfig = {},
  fetchImpl: typeof fetch = fetch,
): Providers {
  return createOpenAIProviders(config, fetchImpl);
}
