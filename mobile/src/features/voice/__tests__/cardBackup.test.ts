import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
jest.mock("../live/nativePcm", () => ({
  recoverNativePcmBackups: async () => [],
  clearNativePcmBackups: async () => {},
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
    constructor(value: string) {
      this.uri = value;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
beforeEach(async () => {
  await clearCardBackupCache();
  await AsyncStorage.clear();
  mockFiles.clear();
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
