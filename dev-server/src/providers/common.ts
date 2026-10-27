import { z } from 'zod';
import type { ProviderConfig, TranscriptionSettings } from './types.ts';
export const LIVE_PROMPT = "An employee describes their own work for their company's advisor: the steps, the tools and systems, the people and teams, waits and decisions.";
export const TTS_STYLE = 'Calm, warm, clear. Normal speaking speed. A colleague asking a short question.';
export class ProviderError extends Error {
  constructor(readonly code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_INVALID_RESPONSE' | 'PROVIDER_TIMEOUT') { super(code); this.name = 'ProviderError'; }
}
export function durationFor(text: string, speed = 1): number { return Math.max(400, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 400 / speed)); }
export function transcriptionSettings(config: ProviderConfig, input: string[] = []): TranscriptionSettings {
  const keywords = [...new Set(input.map(t => t.replace(/[<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean))].slice(0, 40);
  const delay = config.liveDelay === undefined ? 'low' : config.liveDelay;
  return { languages: ['en'], ...(keywords.length ? { keywords } : {}), prompt: LIVE_PROMPT, ...(delay ? { delay } : {}) };
}
export function dataBlock(value: unknown): string { return '<<<DATA id=input>>>\n' + JSON.stringify(value).replace(/<<</g, '<\u200b<\u200b<').replace(/>>>/g, '>\u200b>\u200b>') + '\n<<<END DATA id=input>>>'; }
export function strictJsonSchema(schema: z.ZodType): object {
  const root = z.toJSONSchema(schema) as Record<string, unknown>;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    delete node.default; delete node.$schema;
    if (node.type === 'object' && node.properties) { node.additionalProperties = false; node.required = Object.keys(node.properties); }
    Object.values(node).forEach(visit);
  };
  visit(root); return root;
}
export async function providerFetch(fetcher: typeof fetch, config: ProviderConfig, path: string, init: RequestInit, timeoutMs = 15000, key = config.apiKey): Promise<Response> {
  try {
    const response = await fetcher((config.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new ProviderError('PROVIDER_UNAVAILABLE');
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
  }
}
export async function responseJson(response: Response): Promise<unknown> { try { return await response.json(); } catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE'); } }
