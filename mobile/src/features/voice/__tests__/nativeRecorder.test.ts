import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  createNativeMeetingRecorder,
  clearMeetingRecordingData,
} from "../meeting/nativeRecorder";
jest.mock("../live/nativePcm", () => ({
  loadNativePcmModule: () => ({
    meetingRecordingDirectoryAsync: async () =>
      "file:///app-support/dutygraph-meeting-recordings",
  }),
}));
const mockFiles = new Map<string, Uint8Array>();
let mockNumber = 0;
jest.mock("expo-audio", () => ({
  RecordingPresets: {
    HIGH_QUALITY: { extension: ".m4a", android: {}, ios: {}, web: {} },
  },
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async () => {},
  AudioModule: {
    AudioRecorder: class {
      uri = `file:///document/raw-${++mockNumber}.m4a`;
      currentTime = 17;
      prepareToRecordAsync = async () => {};
      record() {
        mockFiles.set(this.uri, new Uint8Array([1, 2, 3]));
      }
      stop = async () => {};
      addListener() {
        return { remove() {} };
      }
      release() {}
    },
  },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest: async () => new Uint8Array(32).fill(7).buffer,
}));
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    get name() {
      return this.uri.split("/").pop() ?? "";
    }
    async bytes() {
      return mockFiles.get(this.uri) ?? new Uint8Array();
    }
    copy(target: File) {
      mockFiles.set(target.uri, new Uint8Array(mockFiles.get(this.uri)!));
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return {
    File,
    Directory: class {
      list() {
        return [...mockFiles.keys()].map((uri) => new File(uri));
      }
    },
    Paths: { document: { uri: "file:///document" }, cache: { uri: "file:///cache" } },
  };
});
beforeEach(async () => {
  mockFiles.clear();
  mockNumber = 0;
  await AsyncStorage.clear();
});
test("a fresh recorder recovers interrupted bytes with stable upload index before a new recording", async () => {
  const first = createNativeMeetingRecorder(
    "session",
    async ({ bytes, offset }) => ({ uploadedBytes: offset + bytes.length }),
  );
  await first.start();
  expect(
    await AsyncStorage.getItem("dg.meeting-recording-active.session"),
  ).toBeTruthy();
  // A second controller represents process restart; it only has persisted storage and the file.
  const restored = createNativeMeetingRecorder(
    "session",
    async ({ bytes, offset }) => ({ uploadedBytes: offset + bytes.length }),
  );
  const segments = await restored.restore();
  expect(segments).toHaveLength(1);
  expect(segments[0].id.split("-").pop()).toBe("0");
  expect(segments[0].bytes).toBe(3);
  expect(segments[0].hash).toHaveLength(64);
  expect(
    await AsyncStorage.getItem("dg.meeting-recording-active.session"),
  ).toBeNull();
  await restored.start();
  expect(mockFiles.has(segments[0].uri)).toBe(true);
  await restored.stop();
  expect(restored.segments).toHaveLength(2);
  await clearMeetingRecordingData();
  expect(mockFiles.size).toBe(0);
  expect(
    (await AsyncStorage.getAllKeys()).some((key) =>
      key.startsWith("dg.meeting-recording"),
    ),
  ).toBe(false);
});

test("sealed iOS meeting recordings are stored outside iCloud-backed Documents", async () => {
  if (Platform.OS !== "ios") return;
  const recorder = createNativeMeetingRecorder(
    "private-session",
    async ({ bytes, offset }) => ({ uploadedBytes: offset + bytes.length }),
  );
  await recorder.start();
  await recorder.stop();
  const segment = recorder.segments[0];
  expect(segment.uri).toContain("/app-support/dutygraph-meeting-recordings/");
  expect(segment.uri).not.toContain("/document/");
  await clearMeetingRecordingData();
  expect(mockFiles.has(segment.uri)).toBe(false);
});

test("legacy iOS recordings migrate to backup-excluded storage on recovery", async () => {
  if (Platform.OS !== "ios") return;
  const legacyUri = "file:///document/meeting-legacy.m4a";
  mockFiles.set(legacyUri, new Uint8Array([1, 2, 3]));
  await AsyncStorage.setItem("dg.meeting-recording.migrate", JSON.stringify({
    sessionId: "migrate",
    segments: [{
      id: "legacy", uri: legacyUri, hash: "a".repeat(64),
      bytes: 3, durationMs: 1000, uploadedBytes: 0,
    }],
  }));
  const recorder = createNativeMeetingRecorder(
    "migrate",
    async ({ bytes, offset }) => ({ uploadedBytes: offset + bytes.length }),
  );
  const segments = await recorder.restore();
  expect(segments[0].uri).toContain("/app-support/");
  expect(mockFiles.has(legacyUri)).toBe(false);
  expect(mockFiles.has(segments[0].uri)).toBe(true);
  await clearMeetingRecordingData();
});
