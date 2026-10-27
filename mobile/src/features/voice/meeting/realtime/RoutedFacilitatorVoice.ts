import type {
  FacilitatorLine,
  FacilitatorTrigger,
  FacilitatorVoice,
} from "../facilitator";
import type { RealtimeFacilitatorVoice } from "./RealtimeFacilitatorVoice";
/** Switching voice changes no recorder state. Both providers release speech when selection changes. */
export class RoutedFacilitatorVoice implements FacilitatorVoice {
  private realtimeSelected = false;
  constructor(
    private lines: FacilitatorVoice,
    private realtime: RealtimeFacilitatorVoice,
  ) {}
  get kind() {
    return this.realtimeSelected
      ? ("realtime" as const)
      : ("tts_lines" as const);
  }
  select(kind: "tts_lines" | "realtime") {
    if (this.realtimeSelected === (kind === "realtime")) return;
    this.stop();
    if (kind !== "realtime") this.realtime.suspend();
    this.realtimeSelected = kind === "realtime";
  }
  prepare(sessionId: string) {
    return this.realtimeSelected
      ? this.realtime.prepare(sessionId)
      : this.lines.prepare(sessionId);
  }
  speak(line: FacilitatorLine, trigger?: FacilitatorTrigger) {
    return this.realtimeSelected
      ? this.realtime.speak(line, trigger)
      : this.lines.speak(line, trigger);
  }
  stop() {
    this.lines.stop();
    this.realtime.stop();
  }
  setMuted(muted: boolean) {
    this.lines.setMuted(muted);
    this.realtime.setMuted(muted);
  }
  async dispose() {
    await Promise.all([this.lines.dispose(), this.realtime.dispose()]);
  }
}
