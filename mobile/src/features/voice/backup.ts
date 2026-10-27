/** Durable card backup queue. Its store contains local file references, never transcript text. */
export type BackupClip = {
  id: string;
  requestId: string;
  questionKey: string;
  session: number;
  uri: string;
  mimeType: string;
  durationMs: number;
  before?: string;
  replace?: string;
  beforeLength?: number;
  replaceLength?: number;
  beforeHash?: string;
  replaceHash?: string;
};
export interface BackupPorts {
  load(): Promise<BackupClip[]>;
  save(clips: BackupClip[]): Promise<void>;
  removeFile?(uri: string): Promise<void>;
  transcribe(clip: BackupClip): Promise<{ text: string }>;
}
export class RecordedBackupQueue {
  private items: BackupClip[] = [];
  private loaded = false;
  private running: Promise<void> | null = null;
  private epoch = 0;
  private invalidated = false;
  private applying: Promise<void> | null = null;
  invalidate() {
    this.invalidated = true;
    this.epoch++;
    this.items = [];
    this.loaded = false;
    return this.applying?.catch(() => {}) ?? Promise.resolve();
  }
  constructor(private ports: BackupPorts) {}
  private async load() {
    if (this.invalidated) return;
    if (!this.loaded) {
      this.items = await this.ports.load();
      this.loaded = true;
    }
  }
  async add(clip: BackupClip) {
    const epoch = this.epoch;
    await this.load();
    if (this.invalidated || epoch !== this.epoch) return;
    if (!this.items.some((item) => item.id === clip.id)) this.items.push(clip);
    await this.ports.save(this.items);
  }
  async pending() {
    if (this.invalidated) return [];
    await this.load();
    return this.items.map((clip) => ({ ...clip }));
  }
  async remove(id: string) {
    await this.load();
    const clip = this.items.find((item) => item.id === id);
    this.items = this.items.filter((item) => item.id !== id);
    await this.ports.save(this.items);
    if (clip) await this.ports.removeFile?.(clip.uri);
  }
  flush(
    apply: (
      clip: BackupClip,
      text: string,
      isCurrent?: () => boolean,
    ) => Promise<void> | void,
    canApply: (clip: BackupClip) => boolean = () => true,
  ) {
    if (this.invalidated) return Promise.resolve();
    if (this.running) return this.running;
    const epoch = this.epoch;
    const isCurrent = () => !this.invalidated && epoch === this.epoch;
    this.running = (async () => {
      await this.load();
      if (!isCurrent()) return;
      while (this.items.length) {
        const clip = this.items[0];
        if (!canApply(clip)) return;
        const result = await this.ports.transcribe(clip);
        if (!isCurrent()) return;
        // Keep the clip pending until the caller has accepted its transcript.
        this.applying = Promise.resolve(
          apply(clip, result.text.trim(), isCurrent),
        );
        try {
          await this.applying;
        } finally {
          this.applying = null;
        }
        if (!isCurrent()) return;
        this.items.shift();
        await this.ports.save(this.items);
        await this.ports.removeFile?.(clip.uri);
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}

export async function hashBackupText(text: string): Promise<string> {
  const crypto = require("expo-crypto") as typeof import("expo-crypto");
  return crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, text);
}
/** Hashes fence raw-text drift without storing the participant's words in the audio index. */
export async function backupReplacement(
  clip: BackupClip,
  raw: string,
  digest: (text: string) => Promise<string> = hashBackupText,
): Promise<{ replace: string; before?: string; boundaryMatched: boolean }> {
  if (clip.replaceLength === 0) return { replace: "", boundaryMatched: true };
  if (clip.beforeLength === undefined && clip.replaceLength === undefined)
    return {
      replace: clip.replace ?? raw,
      before: clip.before,
      boundaryMatched: true,
    };
  // After a process crash there is no verified live-text span. A later typed answer may be new.
  if (
    clip.beforeLength !== undefined &&
    clip.replaceLength === undefined &&
    clip.replaceHash === undefined
  )
    return { replace: "", boundaryMatched: false };
  const start = clip.beforeLength ?? 0;
  const end =
    clip.replaceLength === undefined ? raw.length : start + clip.replaceLength;
  const before = raw.slice(0, start);
  const replace = raw.slice(start, end);
  const drifted =
    start > raw.length ||
    end > raw.length ||
    (clip.beforeHash !== undefined &&
      (await digest(before)) !== clip.beforeHash) ||
    (clip.replaceHash !== undefined &&
      (await digest(replace)) !== clip.replaceHash);
  // A prior recovery or user edit changed the raw answer. Add the retained words; never erase edits.
  return drifted
    ? { replace: "", boundaryMatched: false }
    : { replace, before, boundaryMatched: true };
}
