import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createNativeMeetingRecorder,
  clearMeetingRecordingData,
} from "../meeting/nativeRecorder";
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
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
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
    Paths: { document: "file:///document" },
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
