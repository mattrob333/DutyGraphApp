import { levelFromSamples } from "../../sponsor/live-voice-model.ts";

/** Echo cancellation and noise suppression on, one channel: the person talks close to the device. */
const VOICE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, channelCount: 1 };

export const micSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/**
 * Opens the chosen microphone (the consent screen's picker), or the default one when that device
 * is gone, as LiveVoice does. Rejects with the getUserMedia error.
 */
export async function openMic(deviceId?: string): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  try {
    return await md.getUserMedia({ audio: deviceId ? { ...VOICE, deviceId: { exact: deviceId } } : VOICE });
  } catch (e) {
    if (!deviceId || (e as Error)?.name !== "OverconstrainedError") throw e;
    return md.getUserMedia({ audio: VOICE });
  }
}

export const stopTracks = (stream: MediaStream | null | undefined) => stream?.getTracks().forEach((t) => t.stop());

/**
 * Calls `onLost` once when the audio route moves away from this track (Jesse's phone, October 18:
 * Bluetooth earbuds connecting or dropping mid-answer): the track ends, or its device is no longer
 * listed after a `devicechange`. The caller restarts the session on the default microphone. Returns
 * the function that stops watching.
 */
export function watchMicRoute(track: MediaStreamTrack | null, onLost: () => void): () => void {
  if (!track) return () => {};
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const lost = () => {
    if (done) return;
    done = true;
    stop();
    onLost();
  };
  const check = () => {
    if (timer) clearTimeout(timer);
    // Devices settle over a few hundred ms after a Bluetooth handover.
    timer = setTimeout(async () => {
      if (done) return;
      if (track.readyState === "ended") return lost();
      const id = track.getSettings?.().deviceId;
      if (!id || !md?.enumerateDevices) return;
      try {
        const inputs = (await md.enumerateDevices()).filter((d) => d.kind === "audioinput");
        if (!inputs.some((d) => d.deviceId === id)) lost();
      } catch {
        /* Cannot list devices: keep the session. */
      }
    }, 400);
  };
  track.addEventListener?.("ended", lost);
  md?.addEventListener?.("devicechange", check);
  function stop() {
    if (timer) clearTimeout(timer);
    track!.removeEventListener?.("ended", lost);
    md?.removeEventListener?.("devicechange", check);
  }
  return () => {
    done = true;
    stop();
  };
}

/**
 * A level meter on its own AudioContext, about 10 times a second (live-voice-model's levelFromSamples).
 * Returns the function that stops it and closes the context. Without Web Audio it does nothing.
 */
export function startMeter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  void ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    onLevel(levelFromSamples(buf));
  }, 100);
  return () => {
    clearInterval(timer);
    void ctx.close().catch(() => {});
  };
}
