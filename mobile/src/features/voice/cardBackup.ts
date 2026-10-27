import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { RecordedBackupQueue, type BackupClip } from "./backup";
export interface CardBackup {
  pending(): Promise<BackupClip[]>;
  remove(id: string): Promise<void>;
  start(input: { questionKey: string; session: number }): Promise<void>;
  finish(failed: boolean): Promise<void>;
  flush(
    apply: (clip: BackupClip, text: string) => void | Promise<void>,
    canApply: (clip: BackupClip) => boolean,
  ): Promise<void>;
}
let generation = 0;
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
): CardBackup | null {
  if (Platform.OS === "web") return null;
  const key = `dg.card-backups.${requestId}`;
  const ownerGeneration = generation;
  const queue = new RecordedBackupQueue({
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
  let capture: {
    recorder: import("expo-audio").AudioRecorder;
    questionKey: string;
    session: number;
  } | null = null;
  return {
    pending: () => queue.pending(),
    remove: (id) => queue.remove(id),
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
          await queue.add({
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
    flush: (apply, canApply) => queue.flush(apply, canApply),
  };
}
