/** Durable card backup queue. Its store contains local file references, never transcript text. */
export type BackupClip = {
  id: string;
  requestId: string;
  questionKey: string;
  session: number;
  uri: string;
  mimeType: string;
  durationMs: number;
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
  constructor(private ports: BackupPorts) {}
  private async load() {
    if (!this.loaded) {
      this.items = await this.ports.load();
      this.loaded = true;
    }
  }
  async add(clip: BackupClip) {
    await this.load();
    if (!this.items.some((item) => item.id === clip.id)) this.items.push(clip);
    await this.ports.save(this.items);
  }
  async pending() {
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
    apply: (clip: BackupClip, text: string) => Promise<void> | void,
    canApply: (clip: BackupClip) => boolean = () => true,
  ) {
    if (this.running) return this.running;
    this.running = (async () => {
      await this.load();
      while (this.items.length) {
        const clip = this.items[0];
        if (!canApply(clip)) return;
        const result = await this.ports.transcribe(clip);
        // Keep the clip pending until the caller has accepted its transcript.
        await apply(clip, result.text.trim());
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
