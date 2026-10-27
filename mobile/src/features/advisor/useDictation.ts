import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { createLiveSpeech } from "@/features/voice/live";
/** User-started dictation for advisor cards. Switching away always releases the microphone. */
export function useDictation(
  onText: (text: string) => void,
  beforeStart?: () => void,
) {
  const speech = useRef(
    createLiveSpeech({
      dataSource: "http",
      kind: Platform.OS === "web" ? "unavailable" : "native",
    }),
  ).current;
  const [listening, setListening] = useState(false),
    [error, setError] = useState("");
  const callback = useRef(onText);
  callback.current = onText;
  const stop = async () => {
    await speech.stop();
    setListening(false);
  };
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void stop();
    });
    return () => {
      sub.remove();
      void speech.stop();
    };
  }, []);
  const start = async () => {
    beforeStart?.();
    setError("");
    speech.reset?.();
    try {
      await speech.start(
        { lang: "en-US" },
        {
          onText: (text) => callback.current(text),
          onError: () => {
            setListening(false);
            setError("Voice stopped. Type your answer instead.");
          },
        },
      );
      setListening(true);
    } catch {
      setError("Voice is unavailable. Type your answer instead.");
    }
  };
  return {
    available: speech.kind !== "unavailable",
    listening,
    error,
    start,
    stop,
  };
}
