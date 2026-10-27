import { z } from "zod";

/**
 * Where the words of an answer came from, per question (the interview app on the team and kickoff
 * links): typed, transcribed by OpenAI from a recording, transcribed on this device (Whisper in the
 * browser), or live captions from the browser's speech service. `edited` means the person also
 * typed in that answer after (or before) the transcription. The advisor sees it next to the words;
 * it changes nothing about review or acceptance.
 */
export const answerVias = ["typed", "voice_openai", "voice_device", "voice_browser"] as const;
export type AnswerVia = (typeof answerVias)[number];
export type AnswerSource = { via: AnswerVia; edited?: boolean };
export type AnswerSources = Record<string, AnswerSource>;

export const answerSourcesSchema = z
  .record(
    z.string().regex(/^question\.\d+$/),
    z.object({ via: z.enum(answerVias), edited: z.boolean().optional() }).strict(),
  )
  .refine((v) => Object.keys(v).length <= 12, "Too many answers");

/** One change to an answer: the person typed, or a transcription added words. */
export function noteAnswerSource(sources: AnswerSources | undefined, key: string, via: AnswerVia, hadText: boolean): AnswerSources {
  const prev = sources?.[key];
  let next: AnswerSource;
  if (via === "typed") next = prev && prev.via !== "typed" ? { via: prev.via, edited: true } : { via: "typed" };
  else next = prev?.edited || (hadText && (!prev || prev.via === "typed")) ? { via, edited: true } : { via };
  return { ...sources, [key]: next };
}

/** The sources to send: only for questions that still have words. */
export function sourcesForAnswers(sources: AnswerSources | undefined, answers: Record<string, string> | undefined): AnswerSources {
  return Object.fromEntries(Object.entries(sources || {}).filter(([key]) => (answers?.[key] || "").trim()));
}

/** What the advisor reads next to an answer; "" for a typed answer. */
export function answerSourceLabel(source: AnswerSource | undefined, who: string): string {
  if (!source || source.via === "typed") return "";
  const how =
    source.via === "voice_openai"
      ? "Transcribed from voice by OpenAI"
      : source.via === "voice_device"
        ? "Transcribed from voice on their device"
        : "Transcribed from voice by live captions";
  return source.edited ? `${how}, edited by ${who || "them"}` : `${how}. ${who || "They"} could check and change the words before sending.`;
}
