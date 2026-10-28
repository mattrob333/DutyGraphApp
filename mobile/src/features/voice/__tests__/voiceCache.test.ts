import { beforeEach, expect, jest, test } from "@jest/globals";
const downloads: { url: string; uri: string; headers: unknown }[] = [];
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache/" },
  File: class {
    exists = false;
    uri: string;
    constructor(directory: string, name: string) {
      this.uri = directory + name;
    }
    static async downloadFileAsync(
      url: string,
      target: { uri: string },
      options: { headers: unknown },
    ) {
      downloads.push({ url, uri: target.uri, headers: options.headers });
    }
  },
}));
import { createVoiceOut } from "../out";
beforeEach(() => {
  downloads.length = 0;
});
test("caches actual extensionless WAV voice responses with the declared format and private headers", async () => {
  const play = jest.fn<(uri: string) => Promise<void>>(async () => {});
  const url = `https://company.example.test/api/mobile/v1x/voice/audio/${"b".repeat(64)}`;
  const out = createVoiceOut({
    allowedAudioOrigin: "https://company.example.test",
    device: null,
    downloadHeaders: async () => ({ Authorization: "Bearer fictional" }),
    playback: { play, stop: () => {} },
    repository: {
      getVoiceLines: async () => ({
        lines: [
          {
            id: "q",
            url,
            hash: "a".repeat(64),
            durationMs: 100,
            mimeType: "audio/wav",
          },
        ],
      }),
    },
  });
  await out.prepare([{ id: "q", text: "A fictional question" }]);
  await out.play("q");
  expect(downloads).toEqual([
    {
      url,
      uri: `file:///cache/voice-${"a".repeat(64)}.wav`,
      headers: { Authorization: "Bearer fictional" },
    },
  ]);
  expect(play).toHaveBeenCalledWith(
    `file:///cache/voice-${"a".repeat(64)}.wav`,
  );
  await out.dispose();
});
test.each(["missing-format", "credentials", "query"])(
  "refuses unsafe or ambiguous native voice downloads (%s)",
  async (kind) => {
    const headers = jest.fn<() => Promise<Record<string, string>>>(
      async () => ({ Authorization: "Bearer fictional" }),
    );
    const speak = jest.fn<(text: string, speed: number) => Promise<void>>(
      async () => {},
    );
    const url = `https://${kind === "credentials" ? "user:password@" : ""}company.example.test/api/mobile/v1x/voice/audio/${"b".repeat(64)}${kind === "query" ? "?token=fictional" : ""}`;
    const out = createVoiceOut({
      allowedAudioOrigin: "https://company.example.test",
      downloadHeaders: headers,
      device: { speak, stop: () => {} },
      repository: {
        getVoiceLines: async () => ({
          lines: [
            {
              id: "q",
              url,
              hash: "a".repeat(64),
              durationMs: 100,
              ...(kind === "missing-format"
                ? {}
                : { mimeType: "audio/wav" as const }),
            },
          ],
        }),
      },
    });
    await out.prepare([{ id: "q", text: "A fictional question" }]);
    await out.play("q");
    expect(headers).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
    expect(speak).toHaveBeenCalledWith("A fictional question", 1);
    await out.dispose();
  },
);
test.each([true, false])(
  "simulated server silence shows a notice and uses the available device/text fallback (%s)",
  async (deviceAvailable) => {
    const speak = jest.fn<(text: string, speed: number) => Promise<void>>(
      async () => {},
    );
    const play = jest.fn<(uri: string) => Promise<void>>(async () => {});
    const notice = jest.fn();
    const out = createVoiceOut({
      onSimulation: notice,
      device: deviceAvailable ? { speak, stop: () => {} } : null,
      playback: { play, stop: () => {} },
      repository: {
        getVoiceLines: async () => ({
          lines: [
            {
              id: "q",
              url: `/api/mobile/v1x/voice/audio/${"b".repeat(64)}`,
              hash: "a".repeat(64),
              durationMs: 100,
              mimeType: "audio/wav",
              simulated: true,
            },
          ],
        }),
      },
    });
    await out.prepare([{ id: "q", text: "Fictional question" }]);
    await out.play("q");
    expect(notice).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(deviceAvailable ? 1 : 0);
    await out.dispose();
  },
);
