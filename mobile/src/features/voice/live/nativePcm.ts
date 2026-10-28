import { AppState } from "react-native";
import type {
  LiveSpeechError,
  SpeechBackupBatch,
  SpeechBackupFile,
} from "./types";
import type { PcmCapture } from "./openai";

export type PcmSamplesEvent = {
  runId: number;
  sampleRate: number;
  samples: number[];
};
export type PcmErrorEvent = {
  runId: number;
  code: "capture_failed" | "interrupted";
};
export interface NativePcmModule {
  readonly isSupported: boolean;
  startAsync(runId: number): Promise<void>;
  stopAsync(): Promise<void>;
  beginBackupAsync?(id: string): Promise<void>;
  finishBackupAsync?(id: string): Promise<SpeechBackupFile[]>;
  recoverBackupsAsync?(): Promise<SpeechBackupFile[]>;
  clearBackupsAsync?(): Promise<void>;
  /** iOS Application Support, marked to exclude recorded evidence from iCloud backups. */
  meetingRecordingDirectoryAsync?(): Promise<string>;
  addListener(
    event: "samples",
    callback: (event: PcmSamplesEvent) => void,
  ): { remove(): void };
  addListener(
    event: "error",
    callback: (event: PcmErrorEvent) => void,
  ): { remove(): void };
}
export interface NativePcmOptions {
  permission?: () => Promise<boolean>;
  onBackground?: (callback: () => void) => () => void;
}
let nextRun = 0;
let lifecycle = 0;
let owner: NativePcmCapture | null = null;
let nativeCalls = Promise.resolve();

/** Expo Go and older development builds return null; no microphone or provider request is started. */
export function loadNativePcmModule(): NativePcmModule | null {
  try {
    const core =
      require("expo-modules-core") as typeof import("expo-modules-core");
    return core.requireOptionalNativeModule<NativePcmModule>("DutyGraphPcmMic");
  } catch {
    return null;
  }
}

/** A single native microphone owner; release finishes before a fallback recognizer can start. */
export class NativePcmCapture implements PcmCapture {
  private lifecycle = lifecycle;
  get available() {
    return !!this.module?.isSupported && this.lifecycle === lifecycle;
  }
  private run = 0;
  private subscriptions: { remove(): void }[] = [];
  private removeBackground: (() => void) | null = null;
  constructor(
    private module: NativePcmModule | null,
    private options: NativePcmOptions = {},
  ) {}
  private backup: {
    id: string;
    onFinished: (batch: SpeechBackupBatch) => Promise<void>;
    failed: boolean;
  } | null = null;
  private invoke<T>(operation: () => Promise<T>) {
    const result = nativeCalls.catch(() => {}).then(operation);
    nativeCalls = result.then(() => {}).catch(() => {});
    return result;
  }
  async start(
    onSamples: (samples: Float32Array, sampleRate: number) => void,
    onError?: (error: LiveSpeechError) => void,
  ) {
    await this.stop();
    const run = (this.run = ++nextRun);
    if (!this.available || !this.module)
      throw new Error(
        "Native PCM capture requires a development build with DutyGraphPcmMic",
      );
    const permission =
      this.options.permission ??
      (async () => {
        const audio = require("expo-audio") as typeof import("expo-audio");
        return (await audio.requestRecordingPermissionsAsync()).granted;
      });
    if (!(await permission())) {
      if (run === this.run) onError?.({ code: "permission_denied" });
      return;
    }
    if (run !== this.run) return;
    if (owner && owner !== this) await owner.stop();
    if (run !== this.run) return;
    owner = this;
    const fail = async (error: LiveSpeechError) => {
      if (run !== this.run) return;
      this.markBackupFailed();
      try {
        await this.stop();
      } finally {
        onError?.(error);
      }
    };
    this.subscriptions = [
      this.module.addListener("samples", (event) => {
        if (run !== this.run || event.runId !== run || owner !== this) return;
        if (
          !Array.isArray(event.samples) ||
          event.samples.length > 24000 ||
          event.sampleRate !== 24000 ||
          event.samples.some((sample) => !Number.isFinite(sample))
        ) {
          void fail({ code: "not_available" }).catch(() => {});
          return;
        }
        try {
          onSamples(
            Float32Array.from(event.samples, (value) =>
              Math.max(-1, Math.min(1, value)),
            ),
            event.sampleRate,
          );
        } catch {
          void fail({ code: "other" }).catch(() => {});
        }
      }),
      this.module.addListener("error", (event) => {
        if (event.runId !== run) return;
        void fail(
          event.code === "interrupted"
            ? { code: "other", message: "interrupted" }
            : { code: "not_available" },
        ).catch(() => {});
      }),
    ];
    const observeBackground =
      this.options.onBackground ??
      ((callback: () => void) => {
        const subscription = AppState.addEventListener("change", (state) => {
          if (state !== "active") callback();
        });
        return () => subscription.remove();
      });
    this.removeBackground = observeBackground(() => {
      void this.stop().catch(() => {});
    });
    try {
      await this.invoke(async () => {
        if (run === this.run && owner === this)
          await this.module!.startAsync(run);
      });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  get backupGroupId() {
    return this.backup?.id ?? null;
  }
  async beginBackup(
    id: string,
    onFinished: (batch: SpeechBackupBatch) => Promise<void>,
  ) {
    await this.finishBackup();
    if (
      !this.module?.beginBackupAsync ||
      !this.module.finishBackupAsync ||
      owner !== this
    )
      throw new Error(
        "Native capture backup requires the current development build",
      );
    this.backup = { id, onFinished, failed: false };
    await this.invoke(() => this.module!.beginBackupAsync!(id));
  }
  markBackupFailed() {
    if (this.backup) this.backup.failed = true;
  }
  async finishBackup(failed = false) {
    const backup = this.backup;
    this.backup = null;
    if (!backup || !this.module?.finishBackupAsync) return;
    const files = await this.invoke(() =>
      this.module!.finishBackupAsync!(backup.id),
    );
    await backup.onFinished({ files, failed: backup.failed || failed });
  }
  async stop() {
    this.run = ++nextRun;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    this.removeBackground?.();
    this.removeBackground = null;
    try {
      if (owner === this) {
        owner = null;
        await this.invoke(() => this.module!.stopAsync());
      }
    } finally {
      await this.finishBackup();
    }
  }
}
export function createNativePcmCapture(options?: NativePcmOptions): PcmCapture {
  return new NativePcmCapture(loadNativePcmModule(), options);
}

export async function recoverNativePcmBackups(
  finalizeGroups: string[] = [],
): Promise<SpeechBackupFile[]> {
  if (owner?.backupGroupId && finalizeGroups.includes(owner.backupGroupId))
    await owner.finishBackup(true);
  await nativeCalls;
  return (await loadNativePcmModule()?.recoverBackupsAsync?.()) ?? [];
}
export async function clearNativePcmBackups(): Promise<void> {
  lifecycle++;
  await owner?.stop().catch(() => {});
  await nativeCalls;
  await loadNativePcmModule()?.clearBackupsAsync?.();
}
