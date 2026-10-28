import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { loadNativePcmModule } from "../live/nativePcm";
import {
  MeetingRecorder,
  type MeetingRecorderPorts,
  type RecorderManifest,
} from "./recorder";

const activeRecorders = new Set<MeetingRecorder>();

/**
 * iOS must never persist meeting evidence in Documents, which iCloud backs up.
 * If a native build does not expose this location, recording is unavailable.
 */
async function privateMeetingDirectory(): Promise<string> {
  const native = loadNativePcmModule();
  if (!native?.meetingRecordingDirectoryAsync)
    throw new Error("Recording requires a current native build");
  return native.meetingRecordingDirectoryAsync();
}

function privateRecordingAvailable(): boolean {
  return Platform.OS !== "ios" || !!loadNativePcmModule()?.meetingRecordingDirectoryAsync;
}


export async function clearMeetingRecordingData() {
  await Promise.all(
    [...activeRecorders].map((recorder) => recorder.stop().catch(() => {})),
  );
  activeRecorders.clear();
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter((key) => key.startsWith("dg.meeting-recording."));
  const journals = allKeys.filter((key) =>
    key.startsWith("dg.meeting-recording-active."),
  );
  try {
    const { File, Directory, Paths } =
      require("expo-file-system") as typeof import("expo-file-system");
    const removeFile = (uri: string) => {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        /* The OS may already have removed the file. */
      }
    };
    for (const key of journals) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        try {
          const record = JSON.parse(raw) as RecordingJournal;
          for (const uri of new Set([record.uri, record.originalUri]))
            removeFile(uri);
        } catch {
          /* Metadata may be corrupt. */
        }
      }
    }
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        try {
          for (const segment of (JSON.parse(raw) as RecorderManifest).segments)
            removeFile(segment.uri);
        } catch {
          /* Metadata may be corrupt. */
        }
      }
    }
    if (Platform.OS !== "web") {
      const directories = [new Directory(Paths.document)];
      if (Platform.OS === "ios") {
        try {
          directories.push(new Directory(await privateMeetingDirectory()));
        } catch {
          /* Older native builds still allow removing known journal paths. */
        }
      }
      for (const directory of directories)
        for (const item of directory.list())
          if (item instanceof File && item.name.startsWith("meeting-"))
            removeFile(item.uri);
    }
  } catch {
    /* Web and older development builds have no native recording files. */
  } finally {
    if (keys.length || journals.length)
      await AsyncStorage.multiRemove([...keys, ...journals]);
  }
}

type RecordingJournal = {
  id: string;
  uri: string;
  originalUri: string;
  startedAt: number;
  durationMs?: number;
};

/** SDK 57 options checked against installed types. Native execution still needs device QA. */
export function createNativeMeetingRecorder(
  sessionId: string,
  upload: MeetingRecorderPorts["upload"],
): MeetingRecorder {
  const audio = require("expo-audio") as typeof import("expo-audio");
  const { File, Paths } =
    require("expo-file-system") as typeof import("expo-file-system");
  const crypto = require("expo-crypto") as typeof import("expo-crypto");
  const journalKey = `dg.meeting-recording-active.${sessionId}`;
  const options = {
    ...audio.RecordingPresets.HIGH_QUALITY,
    // Raw clips use Cache (not backed up); sealed evidence goes into private Application Support on iOS.
    directory: "cache" as const,
    numberOfChannels: 1,
    sampleRate: 24000,
    bitRate: 32000,
    isMeteringEnabled: true,
  };
  let recorder: InstanceType<typeof audio.AudioModule.AudioRecorder> | null =
    null;
  let journal: RecordingJournal | null = null;
  let recordingSubscription: { remove(): void } | null = null;
  const readJournal = async (): Promise<RecordingJournal | null> => {
    const raw = await AsyncStorage.getItem(journalKey);
    return raw ? JSON.parse(raw) : null;
  };
  const hash = async (bytes: Uint8Array) => {
    const result = await crypto.digest(
      crypto.CryptoDigestAlgorithm.SHA256,
      bytes as unknown as BufferSource,
    );
    return [...new Uint8Array(result)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  };
  const instance = new MeetingRecorder(sessionId, {
    recorder: {
      available: Platform.OS !== "web" && privateRecordingAvailable(),
      simulated: false,
      async start() {
        if (!(await audio.requestRecordingPermissionsAsync()).granted)
          throw new Error("Microphone permission was declined");
        await audio.setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          shouldRouteThroughEarpiece: false,
        });
        const current = new audio.AudioModule.AudioRecorder(options);
        recorder = current;
        recordingSubscription = current.addListener(
          "recordingStatusUpdate",
          (status) => {
            if (
              recorder !== current ||
              (!status.hasError &&
                !status.mediaServicesDidReset &&
                !status.isFinished)
            )
              return;
            void instance
              .interrupt(
                "Recording was interrupted. Check the recording, then tap Resume.",
              )
              .catch(() => {});
          },
        );
        try {
          await current.prepareToRecordAsync();
          current.record();
          if (current.uri) {
            journal = {
              id: `${sessionId}-recovered-${Date.now()}`,
              uri: current.uri,
              originalUri: current.uri,
              startedAt: Date.now(),
            };
            await AsyncStorage.setItem(journalKey, JSON.stringify(journal));
          }
        } catch (error) {
          recorder = null;
          recordingSubscription?.remove();
          recordingSubscription = null;
          try {
            await current.stop();
          } catch {
            /* The recorder may not have opened. */
          }
          current.release();
          await audio.setAudioModeAsync({
            allowsRecording: false,
            allowsBackgroundRecording: false,
          });
          throw error;
        }
      },
      async stop() {
        if (!recorder) return null;
        const current = recorder;
        recorder = null;
        recordingSubscription?.remove();
        recordingSubscription = null;
        const durationMs = Math.round(current.currentTime * 1000);
        try {
          await current.stop();
          if (journal) {
            journal.durationMs = durationMs;
            await AsyncStorage.setItem(journalKey, JSON.stringify(journal));
          }
          return current.uri ? { uri: current.uri, durationMs } : null;
        } finally {
          current.release();
          await audio.setAudioModeAsync({
            allowsRecording: false,
            allowsBackgroundRecording: false,
          });
        }
      },
    },
    files: {
      async persist(uri, id) {
        const source = new File(uri);
        const directory =
          Platform.OS === "ios"
            ? await privateMeetingDirectory()
            : Paths.document;
        const target = new File(
          directory,
          `meeting-${id.replace(/[^a-z0-9-]/gi, "_")}.m4a`,
        );
        if (source.uri !== target.uri && !target.exists) source.copy(target);
        if (journal) {
          journal.uri = target.uri;
          journal.id = id;
          await AsyncStorage.setItem(journalKey, JSON.stringify(journal));
        }
        return target.uri;
      },
      bytes: (uri) => new File(uri).bytes(),
      hash,
    },
    storage: {
      async load(id) {
        const raw = await AsyncStorage.getItem(`dg.meeting-recording.${id}`);
        const manifest: RecorderManifest = raw
          ? JSON.parse(raw)
          : { sessionId: id, segments: [] };
        const interrupted = await readJournal();
        if (
          interrupted &&
          !manifest.segments.some((segment) => segment.uri === interrupted.uri)
        ) {
          const file = new File(interrupted.uri);
          if (file.exists && file.size > 0) {
            const bytes = await file.bytes();
            manifest.segments.push({
              id: `${id}-recovered-${manifest.segments.length}`,
              uri: interrupted.uri,
              hash: await hash(bytes),
              bytes: bytes.length,
              durationMs:
                interrupted.durationMs ??
                Math.min(300000, Date.now() - interrupted.startedAt),
              uploadedBytes: 0,
            });
            await AsyncStorage.setItem(
              `dg.meeting-recording.${id}`,
              JSON.stringify(manifest),
            );
          }
        }
        if (
          interrupted &&
          manifest.segments.some((segment) => segment.uri === interrupted.uri)
        ) {
          await AsyncStorage.removeItem(journalKey);
          if (interrupted.originalUri !== interrupted.uri) {
            const original = new File(interrupted.originalUri);
            if (original.exists) original.delete();
          }
        }
        // Upgrade old installs before reopening their saved evidence. A crash
        // after copying is safe: the source stays until the new manifest is saved.
        if (Platform.OS === "ios") {
          const destination = await privateMeetingDirectory();
          const documentPrefix = Paths.document.uri.replace(/\\/+$/, "") + "/";
          let changed = false;
          const legacySources: File[] = [];
          for (const segment of manifest.segments) {
            if (!segment.uri.startsWith(documentPrefix)) continue;
            const original = new File(segment.uri);
            if (!original.exists) continue;
            const target = new File(
              destination,
              `meeting-${segment.id.replace(/[^a-z0-9-]/gi, "_")}.m4a`,
            );
            if (!target.exists) original.copy(target);
            segment.uri = target.uri;
            legacySources.push(original);
            changed = true;
          }
          if (changed) {
            await AsyncStorage.setItem(
              `dg.meeting-recording.${id}`,
              JSON.stringify(manifest),
            );
            for (const file of legacySources)
              if (file.exists) file.delete();
          }
        }
        return manifest;
      },
      async save(manifest) {
        await AsyncStorage.setItem(
          `dg.meeting-recording.${manifest.sessionId}`,
          JSON.stringify(manifest),
        );
        const completed = journal ?? (await readJournal());
        if (
          completed &&
          manifest.segments.some((segment) => segment.uri === completed.uri)
        ) {
          await AsyncStorage.removeItem(journalKey);
          if (completed.originalUri !== completed.uri) {
            const source = new File(completed.originalUri);
            if (source.exists) source.delete();
          }
          journal = null;
        }
      },
    },
    upload,
  });
  activeRecorders.add(instance);
  return instance;
}
