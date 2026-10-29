import type { TaskCardDraftInput } from "@/api/earn/types";
import type { LiveSpeech, LiveSpeechError } from "@/features/voice/live/types";

export type DictationPhase =
  "idle" | "starting" | "listening" | "stopping" | "error" | "unavailable";
export type DictationState = { phase: DictationPhase; message?: string };
export const MAX_EARN_WORDS_LENGTH = 3000;
const joinWords = (before: string, heard: string) =>
  [before.trim(), heard.trim()].filter(Boolean).join(" ");
const speechError = (error: LiveSpeechError) =>
  error.code === "permission_denied"
    ? "Microphone permission was not granted. Type instead."
    : error.code === "not_available"
      ? "Voice is not available here. Type instead."
      : "Listening stopped. Review the words or type instead.";

/** Reuses the existing speech transport; every stop fences pending permissions and old results. */
export class EarnDictationController {
  private epoch = 0;
  private active = false;
  private blocked = false;
  private observer: ((state: DictationState) => void) | null = null;
  private stopping: Promise<void> = Promise.resolve();
  private state: DictationState;
  constructor(
    private speech: LiveSpeech,
    private onText: (value: string) => void,
  ) {
    this.state =
      speech.kind === "unavailable"
        ? {
            phase: "unavailable",
            message: "Voice is not available here. Type instead.",
          }
        : { phase: "idle" };
  }
  get snapshot() {
    return this.state;
  }
  observe(listener: (state: DictationState) => void) {
    this.observer = listener;
    listener(this.state);
    return () => {
      if (this.observer === listener) this.observer = null;
    };
  }
  private set(state: DictationState) {
    this.state = state;
    this.observer?.(state);
  }
  async start(before: string) {
    if (
      this.active ||
      this.blocked ||
      this.state.phase === "stopping" ||
      this.speech.kind === "unavailable"
    )
      return;
    const epoch = ++this.epoch;
    this.active = true;
    this.set({ phase: "starting" });
    await this.stopping;
    if (epoch !== this.epoch || !this.active) return;
    try {
      await this.speech.start(
        { lang: "en-US" },
        {
          onText: (words) => {
            if (epoch !== this.epoch || !this.active) return;
            const text = joinWords(before, words);
            if (text.length > MAX_EARN_WORDS_LENGTH) {
              void this.stopWith({
                phase: "error",
                message:
                  "The task is too long. Keep it to 3,000 characters. Review the words before saving.",
              });
              return;
            }
            this.onText(text);
          },
          onError: (error) => {
            if (epoch === this.epoch)
              void this.stopWith({
                phase: "error",
                message: speechError(error),
              });
          },
          onPause: () => {
            if (epoch === this.epoch) void this.stop();
          },
        },
      );
      if (epoch === this.epoch && this.active) this.set({ phase: "listening" });
    } catch {
      if (epoch === this.epoch)
        await this.stopWith({
          phase: "error",
          message: "Listening could not start. Type instead.",
        });
    }
  }
  private stopWith(state: DictationState): Promise<boolean> {
    const epoch = ++this.epoch;
    const wasActive = this.active || this.state.phase === "stopping";
    this.active = false;
    if (wasActive) this.set({ phase: "stopping" });
    const stop = this.stopping.then(() => this.speech.stop());
    this.stopping = stop.catch(() => undefined);
    return stop
      .then(() => {
        if (epoch === this.epoch) {
          this.blocked = false;
          this.set(state);
        }
        return true;
      })
      .catch(() => {
        this.blocked = true;
        if (epoch === this.epoch)
          this.set({
            phase: "error",
            message:
              "Voice did not close. Turn off microphone access in your device settings.",
          });
        return false;
      });
  }
  stop(): Promise<boolean> {
    return this.stopWith(
      this.speech.kind === "unavailable"
        ? {
            phase: "unavailable",
            message: "Voice is not available here. Type instead.",
          }
        : { phase: "idle" },
    );
  }
}

export function spokenTaskDraft(
  title: string,
  duty: string,
  words: string,
  workType: TaskCardDraftInput["workType"] = "mixed",
): TaskCardDraftInput {
  const name = title.trim(),
    job = duty.trim(),
    text = words.trim();
  if (name.length < 3 || name.length > 120)
    throw new Error("Enter a task name with 3 to 120 characters.");
  if (!job || job.length > 200)
    throw new Error("Enter the part of your job, up to 200 characters.");
  if (!text || text.length > MAX_EARN_WORDS_LENGTH)
    throw new Error(
      "Review 1 to 3,000 characters of task words before saving.",
    );
  return {
    title: name,
    duty: job,
    kind: "today",
    workType,
    slots: {
      startsWhen: { value: null, basis: "not_stated" },
      getsFrom: { value: null, basis: "not_stated" },
      does: { value: text, basis: "told_me" },
      handsTo: { value: null, basis: "not_stated" },
      howOften: { value: null, basis: "not_stated" },
      howLong: { value: null, basis: "not_stated" },
      onlyIKnow: { value: null, basis: "not_stated" },
    },
    steps: [],
  };
}
