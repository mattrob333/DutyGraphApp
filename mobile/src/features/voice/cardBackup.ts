import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { RecordedBackupQueue, hashBackupText, type BackupClip } from "./backup";
import type { LiveSpeech, SpeechBackupFile } from "./live/types";
import { newIdempotencyKey } from "@/utils/id";
export interface CardBackup {
  pending(): Promise<BackupClip[]>;
  remove(id: string): Promise<void>;
  startPcm?(
    input: {
      questionKey: string;
      session: number;
      before?: string;
      getText?: () => string;
    },
    speech: LiveSpeech,
  ): Promise<void>;
  start(input: { questionKey: string; session: number }): Promise<void>;
  finish(failed: boolean): Promise<void>;
  flush(
    apply: (
      clip: BackupClip,
      text: string,
      isCurrent?: () => boolean,
    ) => void | Promise<void>,
    canApply: (clip: BackupClip) => boolean,
  ): Promise<void>;
}
let generation = 0;
const PCM_CONTEXT = "dg.pcm-backup-context.";
const queues = new Map<string, RecordedBackupQueue>();
export interface PcmBackupRecovery {
  recover(finalizeGroups?: string[]): Promise<SpeechBackupFile[]>;
  clear(): Promise<void>;
}
const nativePcmRecovery: PcmBackupRecovery = {
  recover: (groups) => {
    const native =
      require("./live/nativePcm") as typeof import("./live/nativePcm");
    return native.recoverNativePcmBackups(groups);
  },
  clear: () => {
    const native =
      require("./live/nativePcm") as typeof import("./live/nativePcm");
    return native.clearNativePcmBackups();
  },
};
async function deleteFile(uri: string) {
  try {
    const { File } =
      require("expo-file-system") as typeof import("expo-file-system");
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* Already removed. */
  }
}
export async function clearCardBackupCache() {
  generation++;
  const pendingApplies = [...queues.values()].map((queue) =>
    queue.invalidate(),
  );
  queues.clear();
  await Promise.all(pendingApplies);
  await nativePcmRecovery.clear();
  const contextKeys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(PCM_CONTEXT),
  );
  if (contextKeys.length) await AsyncStorage.multiRemove(contextKeys);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith("dg.card-backups."),
  );
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      try {
        for (const clip of JSON.parse(raw) as BackupClip[])
          await deleteFile(clip.uri);
      } catch {
        /* Ignore corrupt metadata. */
      }
    }
  }
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
/** Encoded recording runs independently of live word delivery; capture failure never disables typing. */
export function createCardBackup(
  requestId: string,
  transcribe: (clip: BackupClip) => Promise<{ text: string }>,
  nativeRecovery: PcmBackupRecovery = nativePcmRecovery,
): CardBackup | null {
  if (Platform.OS === "web") return null;
  const key = `dg.card-backups.${requestId}`;
  const ownerGeneration = generation;
  let queue = queues.get(key);
  if (!queue) {
    queue = new RecordedBackupQueue({
      async load() {
        const raw = await AsyncStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      },
      async save(clips) {
        if (generation === ownerGeneration)
          await AsyncStorage.setItem(key, JSON.stringify(clips));
      },
      transcribe,
      removeFile: deleteFile,
    });
    queues.set(key, queue);
  }
  const capturedQueue = queue;
  let capture: {
    recorder: import("expo-audio").AudioRecorder;
    questionKey: string;
    session: number;
  } | null = null;
  const recover = async (finalize: boolean) => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(PCM_CONTEXT),
    );
    const contexts = new Map<
      string,
      {
        questionKey: string;
        session: number;
        beforeLength?: number;
        beforeHash?: string;
      }
    >();
    for (const contextKey of keys) {
      const raw = await AsyncStorage.getItem(contextKey);
      if (!raw) continue;
      try {
        const context = JSON.parse(raw) as {
          requestId: string;
          questionKey: string;
          session: number;
          beforeLength?: number;
          beforeHash?: string;
        };
        if (context.requestId === requestId)
          contexts.set(contextKey.slice(PCM_CONTEXT.length), context);
      } catch {
        /* Corrupt metadata is retained for explicit cleanup. */
      }
    }
    if (!contexts.size) return;
    const files = await nativeRecovery.recover(
      finalize ? [...contexts.keys()] : [],
    );
    const recoveredCounts = new Map<string, number>();
    for (const file of files) {
      const index = recoveredCounts.get(file.groupId) ?? 0;
      recoveredCounts.set(file.groupId, index + 1);
      const context = contexts.get(file.groupId);
      if (!context) continue;
      if (file.durationMs >= 300)
        await capturedQueue.add({
          id: file.id,
          requestId,
          ...context,
          beforeLength: index === 0 ? context.beforeLength : undefined,
          replaceLength: index === 0 ? undefined : 0,
          beforeHash: index === 0 ? context.beforeHash : undefined,
          uri: file.uri,
          mimeType: "audio/wav",
          durationMs: file.durationMs,
        });
      else await deleteFile(file.uri);
    }
    for (const id of contexts.keys())
      if (files.some((file) => file.groupId === id))
        await AsyncStorage.removeItem(PCM_CONTEXT + id);
  };
  return {
    pending: async () => {
      await recover(true);
      return capturedQueue.pending();
    },
    remove: (id) => capturedQueue.remove(id),
    async startPcm(input, speech) {
      if (!speech.beginBackup || generation !== ownerGeneration) return;
      const id = (
        "pcm_" +
        newIdempotencyKey().replace(/[^a-z0-9]/gi, "") +
        "_" +
        input.session +
        "_" +
        Date.now()
      ).slice(0, 80);
      const context = {
        requestId,
        questionKey: input.questionKey,
        session: input.session,
        beforeLength: input.before?.length,
        beforeHash:
          input.before === undefined
            ? undefined
            : await hashBackupText(input.before),
      };
      await AsyncStorage.setItem(PCM_CONTEXT + id, JSON.stringify(context));
      await speech.beginBackup(id, async ({ files, failed }) => {
        const raw = input.getText?.() ?? "";
        const replaceLength =
          input.before !== undefined && raw.startsWith(input.before)
            ? raw.slice(input.before.length).length
            : undefined;
        const replaceHash =
          replaceLength === undefined
            ? undefined
            : await hashBackupText(raw.slice(input.before?.length ?? 0));
        for (const [index, file] of files.entries()) {
          if (
            failed &&
            file.durationMs >= 300 &&
            generation === ownerGeneration
          )
            await capturedQueue.add({
              id: file.id,
              requestId,
              questionKey: input.questionKey,
              session: input.session,
              beforeLength: index === 0 ? input.before?.length : undefined,
              replaceLength: index === 0 ? replaceLength : 0,
              beforeHash: index === 0 ? context.beforeHash : undefined,
              replaceHash: index === 0 ? replaceHash : undefined,
              uri: file.uri,
              mimeType: "audio/wav",
              durationMs: file.durationMs,
            });
          else await deleteFile(file.uri);
        }
        await AsyncStorage.removeItem(PCM_CONTEXT + id);
      });
    },
    async start(input) {
      const audio = require("expo-audio") as typeof import("expo-audio");
      const permission = await audio.getRecordingPermissionsAsync();
      if (!permission.granted) return;
      const recorder = new audio.AudioModule.AudioRecorder({
        ...audio.RecordingPresets.HIGH_QUALITY,
        directory: "document",
        numberOfChannels: 1,
        bitRate: 32000,
      });
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
        capture = { recorder, ...input };
      } catch {
        recorder.release();
      }
    },
    async finish(failed) {
      const current = capture;
      capture = null;
      if (!current) return;
      const durationMs = Math.round(current.recorder.currentTime * 1000);
      try {
        await current.recorder.stop();
        const uri = current.recorder.uri;
        if (
          uri &&
          failed &&
          durationMs >= 300 &&
          generation === ownerGeneration
        ) {
          await capturedQueue.add({
            id: `${requestId}-${current.session}-${Date.now()}`,
            requestId,
            questionKey: current.questionKey,
            session: current.session,
            uri,
            mimeType: "audio/m4a",
            durationMs,
          });
        } else if (uri) {
          const { File } =
            require("expo-file-system") as typeof import("expo-file-system");
          try {
            new File(uri).delete();
          } catch {
            /* Already released. */
          }
        }
      } finally {
        current.recorder.release();
      }
    },
    flush: async (apply, canApply) => {
      await recover(false);
      await capturedQueue.flush(apply, canApply);
    },
  };
}
