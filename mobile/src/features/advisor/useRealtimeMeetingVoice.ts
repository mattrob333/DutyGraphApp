import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { config } from "@/api/config";
import {
  getAdvisorRepository,
  type SessionDetail,
  type MeetingDefinition,
} from "@/api/advisor";
import { useAdvisorStore } from "@/state/advisor";
import { newIdempotencyKey } from "@/utils/id";
import { TtsFacilitatorVoice } from "@/features/voice/meeting/facilitator";
import { RealtimeFacilitatorVoice } from "@/features/voice/meeting/realtime/RealtimeFacilitatorVoice";
import { RoutedFacilitatorVoice } from "@/features/voice/meeting/realtime/RoutedFacilitatorVoice";
import {
  NativeRealtimeTransport,
  realtimeCapability,
} from "@/features/voice/meeting/realtime/native";
import type { VoiceEvent, VoiceOut } from "@/features/voice/out";
type Options = {
  session?: SessionDetail;
  meeting?: MeetingDefinition;
  lines: VoiceOut;
  onSpeech(speaking: boolean): void;
  onTranscript(text: string): void;
  onInputStopped(): void;
};
/** Native room input is user-started and all-party-consented; identity/background changes release it. */
export function useRealtimeMeetingVoice(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const alive = useRef(true);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [capability] = useState(() =>
    realtimeCapability(config.facilitatorRealtime),
  );
  const [realtime] = useState(
    () =>
      new RealtimeFacilitatorVoice({
        enabled: config.facilitatorRealtime,
        available:
          capability.available && getAdvisorRepository().kind === "http",
        canBegin: () => {
          const session = latest.current.session,
            identity = useAdvisorStore.getState().identity;
          return (
            !!session &&
            !!identity &&
            session.companyId === identity.company.id &&
            !!session.startedAt &&
            !session.endedAt &&
            session.mode === "facilitator" &&
            session.voice === "realtime" &&
            session.consents.length > 0 &&
            session.consents.every((c) => c.state === "consented") &&
            session.spentCents < session.budgetCents
          );
        },
        transport: () => new NativeRealtimeTransport(),
        mint: (id, input) =>
          getAdvisorRepository().realtime(id, input, newIdempotencyKey()),
        summary: () => {
          const session = latest.current.session,
            meeting = latest.current.meeting;
          return JSON.stringify({
            purpose: meeting?.power.purpose ?? "",
            outcomes: meeting?.power.outcomes ?? [],
            topic: session?.currentTopicId ?? null,
            recent:
              session?.transcript
                .filter((segment) => segment.committed && !segment.excluded)
                .slice(-6)
                .map((segment) => segment.text.slice(0, 400)) ?? [],
          }).slice(0, 4000);
        },
        // $48/hour is an estimated dispatch guard for local stream duration;
        // actual provider cost may differ, including failed requests.
        lifetimeMs: () =>
          Math.max(
            0,
            ((latest.current.session?.budgetCents ?? 0) -
              (latest.current.session?.spentCents ?? 0)) *
              750,
          ),
        onSpeech: (speaking) => latest.current.onSpeech(speaking),
        onTranscript: (text) => latest.current.onTranscript(text),
        onState: (state, reason) => {
          if (!alive.current) return;
          setStatus(state);
          if (reason) setMessage(reason);
          if (state === "ready") setMessage("");
          if (
            state !== "ready" &&
            state !== "connecting" &&
            latest.current.session?.voice === "realtime"
          )
            latest.current.onInputStopped();
        },
      }),
  );
  const [voice] = useState(
    () =>
      new RoutedFacilitatorVoice(
        new TtsFacilitatorVoice(options.lines),
        realtime,
      ),
  );
  const [subscribe] = useState(
    () => (listener: (event: VoiceEvent) => void) => {
      const lines = options.lines.subscribe(listener),
        room = realtime.subscribe(listener);
      return () => {
        lines();
        room();
      };
    },
  );
  useEffect(() => {
    voice.select(
      options.session?.voice === "realtime" ? "realtime" : "tts_lines",
    );
    if (
      options.session?.consents.some((c) => c.state !== "consented") &&
      realtime.inputActive
    )
      realtime.suspend();
  }, [options.session?.voice, options.session?.consents, voice, realtime]);
  useEffect(() => {
    alive.current = true;
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") realtime.suspend();
    });
    const initial = useAdvisorStore.getState().identity;
    const unsubscribe = useAdvisorStore.subscribe((state) => {
      if (
        state.identity?.company.id !== initial?.company.id ||
        state.identity?.advisor.id !== initial?.advisor.id
      )
        realtime.suspend();
    });
    return () => {
      alive.current = false;
      app.remove();
      unsubscribe();
      void voice.dispose();
    };
  }, [voice, realtime]);
  return { realtime, voice, subscribe, status, message, capability };
}
