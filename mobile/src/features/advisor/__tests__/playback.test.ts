import { describe, expect, it, jest } from "@jest/globals";
jest.mock("@/features/voice/out", () => ({
  clearVoiceAudioCache: jest.fn(async () => {}),
}));
jest.mock("@/features/voice/meeting", () => ({
  clearMeetingRecordingData: jest.fn(async () => {}),
}));
import { SourcePlayback, type SourcePlayerPort } from "../useSourcePlayback";
const source = {
  uri: "http://localhost/audio",
  headers: { Authorization: "Bearer private" },
  offsetSeconds: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const status = { isLoaded: true, error: null, didJustFinish: false };
function fixture(
  waitForSource?: ReturnType<typeof deferred<typeof source>>,
  waitForSeek?: ReturnType<typeof deferred<void>>,
) {
  let listener: ((value: typeof status) => void) | undefined;
  let scope: string | null = "company:advisor";
  const removed = jest.fn();
  const player: SourcePlayerPort = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(async () => {
      await waitForSeek?.promise;
    }),
    addListener: (_name, callback) => {
      listener = callback;
      return { remove: removed };
    },
  };
  const create = jest.fn(() => player),
    onError = jest.fn(),
    onPlaying = jest.fn();
  const engine = new SourcePlayback({
    source: async () => (waitForSource ? waitForSource.promise : source),
    create,
    scope: () => scope,
    onError,
    onPlaying,
  });
  return {
    engine,
    player,
    create,
    removed,
    onError,
    onPlaying,
    emit: (value = status) => listener?.(value),
    changeScope: () => {
      scope = "other-company:advisor";
    },
  };
}
describe("source audio cancellation", () => {
  it("does not create a player when a delayed source resolves after Stop", async () => {
    const pending = deferred<typeof source>(),
      f = fixture(pending);
    const playing = f.engine.play("session", 1000);
    f.engine.stop();
    pending.resolve(source);
    await playing;
    expect(f.create).not.toHaveBeenCalled();
  });
  it("does not start a delayed seek after Stop and removes its listener", async () => {
    const seeking = deferred<void>(),
      f = fixture(undefined, seeking);
    await f.engine.play("session", 1000);
    f.emit();
    expect(f.player.seekTo).toHaveBeenCalledWith(1);
    f.engine.stop();
    seeking.resolve();
    await Promise.resolve();
    expect(f.player.play).not.toHaveBeenCalled();
    expect(f.removed).toHaveBeenCalledTimes(1);
    expect(f.player.remove).toHaveBeenCalledTimes(1);
  });
  it("does not start audio after unmount or a company identity change", async () => {
    const pending = deferred<typeof source>(),
      f = fixture(pending);
    const playing = f.engine.play("session", 0);
    f.engine.dispose();
    pending.resolve(source);
    await playing;
    expect(f.create).not.toHaveBeenCalled();
    const next = deferred<typeof source>(),
      g = fixture(next);
    const another = g.engine.play("session", 0);
    g.changeScope();
    next.resolve(source);
    await another;
    expect(g.create).not.toHaveBeenCalled();
  });
  it("plays only after loading and seeking, then releases completed audio", async () => {
    const f = fixture();
    await f.engine.play("session", 1000);
    expect(f.player.play).not.toHaveBeenCalled();
    f.emit();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.player.play).toHaveBeenCalledTimes(1);
    f.emit({ ...status, didJustFinish: true });
    expect(f.player.pause).toHaveBeenCalled();
    expect(f.player.remove).toHaveBeenCalled();
  });
  it("ignores stale listener events from an older player", async () => {
    const f = fixture();
    await f.engine.play("old", 1000);
    f.engine.stop();
    f.emit();
    await Promise.resolve();
    expect(f.player.play).not.toHaveBeenCalled();
  });
});
