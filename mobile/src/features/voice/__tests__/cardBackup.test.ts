import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { mergeRecorded } from "@shared/hands-free/recorded";
import {
  createCardBackup,
  clearCardBackupCache,
  type PcmBackupRecovery,
} from "../cardBackup";
import { backupReplacement, hashBackupText } from "../backup";
import type {
  LiveSpeech,
  SpeechBackupBatch,
  SpeechBackupFile,
} from "../live/types";
const mockFiles = new Set<string>();
let mockPrivateDirectory: string | null = "file:///private/backups";
const mockRecorderOptions: { directory: string }[] = [];
let mockPrepare: () => Promise<void> = async () => {};
jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  getRecordingPermissionsAsync: async () => ({ granted: true }),
  AudioModule: { AudioRecorder: class {
    uri = "file:///cache/raw.m4a";
    currentTime = 2;
    constructor(options: { directory: string }) { mockRecorderOptions.push(options); }
    async prepareToRecordAsync() { await mockPrepare(); }
    record() { mockFiles.add(this.uri); }
    async stop() {}
    release() {}
  } },
}));
jest.mock("../live/nativePcm", () => ({
  recoverNativePcmBackups: async () => [],
  clearNativePcmBackups: async () => {},
  loadNativePcmModule: () => mockPrivateDirectory ? {
    meetingRecordingDirectoryAsync: async () => mockPrivateDirectory,
  } : null,
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "fictional-id",
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require("node:crypto").createHash("sha256").update(value).digest("hex"),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(...values: string[]) {
      this.uri = values.join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    copy(target: { uri: string }) { mockFiles.add(target.uri); }
  },
  Paths: { document: { uri: "file:///document" } },
}));
beforeEach(async () => {
  await clearCardBackupCache();
  await AsyncStorage.clear();
  mockFiles.clear();
  mockPrivateDirectory = "file:///private/backups";
  mockRecorderOptions.length = 0;
  mockPrepare = async () => {};
});

test("iOS device-speech fallback retains recoverable M4A only in backup-excluded storage", async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  try {
    const backup = createCardBackup("fallback", async () => ({ text: "Recovered." }))!;
    await backup.start({ questionKey: "q", session: 1 });
    expect(mockRecorderOptions[0].directory).toBe("cache");
    await backup.finish(true);
    const [clip] = await backup.pending();
    expect(clip.uri).toMatch(/^file:\/\/\/private\/backups\/card-backup-/);
    expect(mockFiles.has(clip.uri)).toBe(true);
    expect(mockFiles.has("file:///cache/raw.m4a")).toBe(false);
    const stored = JSON.parse((await AsyncStorage.getItem("dg.card-backups.fallback"))!);
    expect(stored[0].uri).toBe(clip.uri);
    await backup.flush(() => {}, () => true);
    expect(mockFiles.has(clip.uri)).toBe(false);
  } finally { Object.defineProperty(Platform, "OS", { configurable: true, value: os }); }
});

test("iOS fallback refuses capture without a backup-excluded native directory", async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  try {
    mockPrivateDirectory = null;
    const backup = createCardBackup("no-native", async () => ({ text: "" }))!;
    await backup.start({ questionKey: "q", session: 1 });
    expect(mockRecorderOptions).toHaveLength(0);
    expect(await backup.pending()).toEqual([]);
  } finally { Object.defineProperty(Platform, "OS", { configurable: true, value: os }); }
});

test("iOS legacy M4A recovery commits private pointers before deleting Documents evidence", async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  try {
    const uri = "file:///document/legacy.m4a";
    mockFiles.add(uri);
    await AsyncStorage.setItem("dg.card-backups.legacy", JSON.stringify([
      { id: "old", requestId: "legacy", questionKey: "q", session: 1, uri, mimeType: "audio/m4a", durationMs: 1000 },
    ]));
    const backup = createCardBackup("legacy", async () => ({ text: "" }))!;
    const [clip] = await backup.pending();
    expect(clip.uri).toBe("file:///private/backups/card-backup-old.m4a");
    expect(mockFiles.has(clip.uri)).toBe(true);
    expect(mockFiles.has(uri)).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem("dg.card-backups.legacy"))!)[0].uri).toBe(clip.uri);
  } finally { Object.defineProperty(Platform, "OS", { configurable: true, value: os }); }
});

test("logout during native preparation never starts a late fallback recording", async () => {
  let ready!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { ready = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  mockPrepare = async () => { ready(); await waiting; };
  const backup = createCardBackup("late-start", async () => ({ text: "" }))!;
  const started = backup.start({ questionKey: "q", session: 1 });
  await entered;
  await clearCardBackupCache();
  release();
  await started;
  expect(mockFiles.has("file:///cache/raw.m4a")).toBe(false);
});

test("logout waits for a migrating index write and removes its private evidence", async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  const uri = "file:///document/racing.m4a";
  const key = "dg.card-backups.migrating";
  mockFiles.add(uri);
  await AsyncStorage.setItem(key, JSON.stringify([
    { id: "racing", requestId: "migrating", questionKey: "q", session: 1, uri, mimeType: "audio/m4a", durationMs: 1000 },
  ]));
  const setMock = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
  const originalSet = setMock.getMockImplementation()!;
  let ready!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { ready = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  setMock.mockImplementationOnce(async (k, value) => {
    ready(); await waiting; await originalSet(k, value);
  });
  try {
    const backup = createCardBackup("migrating", async () => ({ text: "" }))!;
    const loading = backup.pending();
    await entered;
    const clearing = clearCardBackupCache();
    release();
    await Promise.all([loading, clearing]);
    expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(mockFiles.size).toBe(0);
  } finally {
    setMock.mockImplementation(originalSet);
    Object.defineProperty(Platform, "OS", { configurable: true, value: os });
  }
});
const file = (id: string, groupId: string): SpeechBackupFile => ({
  id,
  groupId,
  uri: `file://${id}.wav`,
  durationMs: 1000,
  bytes: 48044,
});

test("restart recovery retains two WAV chunks and preserves earlier healthy words", async () => {
  const files = [file("part-1", "group"), file("part-2", "group")];
  files.forEach((item) => mockFiles.add(item.uri));
  const prefix = "Earlier healthy words. ";
  await AsyncStorage.setItem(
    "dg.pcm-backup-context.group",
    JSON.stringify({
      requestId: "recovery",
      questionKey: "q",
      session: 2,
      beforeLength: prefix.length,
      beforeHash: await hashBackupText(prefix),
    }),
  );
  const recover = jest.fn<PcmBackupRecovery["recover"]>(async () => files);
  const backup = createCardBackup(
    "recovery",
    async (clip) => ({
      text:
        clip.id === "part-1"
          ? "Recovered first chunk."
          : "Recovered second chunk.",
    }),
    { recover, clear: async () => {} },
  )!;
  expect(await backup.pending()).toHaveLength(2);
  expect(recover).toHaveBeenCalledWith(["group"]);
  let raw = prefix + "partial words";
  await backup.flush(
    async (clip, text) => {
      const range = await backupReplacement(clip, raw);
      raw = mergeRecorded(raw, range.replace, text, range.before);
    },
    () => true,
  );
  expect(raw).toBe(
    prefix + "partial words Recovered first chunk. Recovered second chunk.",
  );
  expect(mockFiles.size).toBe(0);
  expect(await backup.pending()).toEqual([]);
});

test("same-engine backup stores no answer text and two failed sessions cannot erase earlier recovery", async () => {
  let done!: (batch: SpeechBackupBatch) => Promise<void>;
  let group = "";
  const source: LiveSpeech = {
    kind: "openai",
    start: async () => {},
    stop: async () => {},
    beginBackup: async (id, onFinished) => {
      group = id;
      done = onFinished;
    },
  };
  const backup = createCardBackup(
    "sessions",
    async (clip) => ({
      text:
        clip.id === "one"
          ? "Complete first answer."
          : "Complete second answer.",
    }),
    { recover: async () => [], clear: async () => {} },
  )!;
  const prefix = "Healthy answer. ";
  let raw = prefix + "part one";
  await backup.startPcm!(
    { questionKey: "q", session: 1, before: prefix, getText: () => raw },
    source,
  );
  const first = file("one", group);
  mockFiles.add(first.uri);
  await done({ files: [first], failed: true });
  await backup.startPcm!(
    { questionKey: "q", session: 2, before: raw, getText: () => raw },
    source,
  );
  raw += " part two";
  const second = file("two", group);
  mockFiles.add(second.uri);
  await done({ files: [second], failed: true });
  for (const key of await AsyncStorage.getAllKeys())
    expect(await AsyncStorage.getItem(key)).not.toContain(prefix);
  await backup.flush(
    async (clip, text) => {
      const range = await backupReplacement(clip, raw);
      raw = mergeRecorded(raw, range.replace, text, range.before);
    },
    () => true,
  );
  expect(raw).toContain("Healthy answer.");
  expect(raw).toContain("Complete first answer.");
  expect(raw).toContain("Complete second answer.");
});

test("raw edits fail closed for replacement and retain both edited words and recovered words", async () => {
  const raw = "The participant edited this wording.";
  const range = await backupReplacement(
    {
      id: "drift",
      requestId: "r",
      questionKey: "q",
      session: 1,
      uri: "file",
      mimeType: "audio/wav",
      durationMs: 1000,
      beforeLength: 4,
      beforeHash: await hashBackupText("Old "),
    },
    raw,
  );
  expect(range.boundaryMatched).toBe(false);
  expect(
    mergeRecorded(raw, range.replace, "Retained recording.", range.before),
  ).toBe(raw + " Retained recording.");
});
