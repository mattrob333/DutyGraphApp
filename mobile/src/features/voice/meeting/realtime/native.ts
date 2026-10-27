import { Platform } from "react-native";
import type {
  RealtimeTransport,
  RealtimeTransportEvent,
  RealtimeMessage,
} from "./types";
type WebRtc = typeof import("react-native-webrtc");
export function realtimeCapability(
  enabled: boolean,
  platform: string = Platform.OS,
  load: () => WebRtc = () => require("react-native-webrtc") as WebRtc,
): { available: boolean; reason?: string } {
  if (!enabled)
    return { available: false, reason: "Realtime voice is off in this build." };
  if (platform !== "ios" && platform !== "android")
    return {
      available: false,
      reason: "Realtime voice needs an iOS or Android development build.",
    };
  try {
    const rtc = load();
    if (!rtc.RTCPeerConnection || !rtc.mediaDevices?.getUserMedia)
      return {
        available: false,
        reason: "The native WebRTC module is unavailable.",
      };
    return { available: true };
  } catch {
    return {
      available: false,
      reason: "Install a native development build to use realtime voice.",
    };
  }
}
/** SDK APIs checked against react-native-webrtc155 installed types. No camera track is requested. */
export class NativeRealtimeTransport implements RealtimeTransport {
  private peer: InstanceType<WebRtc["RTCPeerConnection"]> | null = null;
  private channel: ReturnType<
    InstanceType<WebRtc["RTCPeerConnection"]>["createDataChannel"]
  > | null = null;
  private local: InstanceType<WebRtc["MediaStream"]> | null = null;
  private remote = new Set<InstanceType<WebRtc["MediaStreamTrack"]>>();
  private outputEnabled = false;
  private closed = false;
  private listeners = new Set<(event: RealtimeTransportEvent) => void>();
  private abortOffer: (() => void) | null = null;
  constructor(private rtc: WebRtc = require("react-native-webrtc") as WebRtc) {}
  subscribe(listener: (event: RealtimeTransportEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: RealtimeTransportEvent) {
    if (!this.closed) for (const listener of this.listeners) listener(event);
  }
  async createOffer(): Promise<string> {
    if (this.closed) throw new Error("The realtime connection is closed.");
    const stream = await this.rtc.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      throw new Error("Realtime microphone input was stopped.");
    }
    this.local = stream;
    const peer = new this.rtc.RTCPeerConnection({ iceServers: [] });
    this.peer = peer;
    stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
    peer.addEventListener("track", (event) => {
      const track = event.track;
      if (!track) return;
      if (this.closed) {
        track.stop();
        return;
      }
      if (track.kind === "audio") {
        track.enabled = this.outputEnabled;
        this.remote.add(track);
      } else track.stop();
    });
    peer.addEventListener("connectionstatechange", () => {
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected"
      )
        this.emit({ type: "error" });
    });
    const channel = peer.createDataChannel("oai-events", { ordered: true });
    this.channel = channel;
    channel.addEventListener("open", () => this.emit({ type: "open" }));
    channel.addEventListener("close", () => this.emit({ type: "close" }));
    channel.addEventListener("error", () => this.emit({ type: "error" }));
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > 1000000) return;
      try {
        const message: unknown = JSON.parse(event.data);
        if (message && typeof message === "object" && !Array.isArray(message))
          this.emit({ type: "message", message: message as RealtimeMessage });
      } catch {
        /* Invalid provider events cannot trigger speech. */
      }
    });
    const offer = await peer.createOffer();
    if (this.closed) throw new Error("The realtime connection is closed.");
    await peer.setLocalDescription(offer);
    if (this.closed) throw new Error("The realtime connection is closed.");
    if (peer.iceGatheringState !== "complete")
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timeout);
          peer.removeEventListener("icegatheringstatechange", changed);
          this.abortOffer = null;
          resolve();
        };
        const changed = () => {
          if (peer.iceGatheringState === "complete") finish();
        };
        const timeout = setTimeout(finish, 3000);
        this.abortOffer = () => {
          clearTimeout(timeout);
          peer.removeEventListener("icegatheringstatechange", changed);
          reject(new Error("The realtime connection is closed."));
        };
        peer.addEventListener("icegatheringstatechange", changed);
      });
    const sdp = peer.localDescription?.sdp;
    if (this.closed || !sdp?.startsWith("v=0"))
      throw new Error("Realtime could not create an audio session.");
    return sdp;
  }
  async acceptAnswer(sdp: string) {
    if (this.closed || !this.peer)
      throw new Error("The realtime connection is closed.");
    await this.peer.setRemoteDescription(
      new this.rtc.RTCSessionDescription({ type: "answer", sdp }),
    );
  }
  send(message: RealtimeMessage) {
    if (!this.closed && this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(message));
  }
  setOutputEnabled(enabled: boolean) {
    this.outputEnabled = enabled && !this.closed;
    for (const track of this.remote) track.enabled = this.outputEnabled;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.abortOffer?.();
    this.abortOffer = null;
    this.setOutputEnabled(false);
    this.channel?.close();
    this.channel = null;
    this.local?.getTracks().forEach((track) => track.stop());
    this.local?.release();
    this.local = null;
    for (const track of this.remote) track.stop();
    this.remote.clear();
    this.peer?.close();
    this.peer = null;
    this.listeners.clear();
  }
}
