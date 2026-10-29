import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { createLiveSpeech, type LiveSpeech } from "@/features/voice/live";
import { EarnDictationController, type DictationState } from "./voice-logic";

const nativeSpeech = () =>
  createLiveSpeech({ kind: "native", dataSource: "http" });
export function useEarnDictation({
  value,
  onChange,
  disabled = false,
  createSpeech = nativeSpeech,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  createSpeech?: () => LiveSpeech;
}) {
  const valueRef = useRef(value),
    changeRef = useRef(onChange),
    disabledRef = useRef(disabled);
  valueRef.current = value;
  changeRef.current = onChange;
  disabledRef.current = disabled;
  const controller = useMemo(
    () =>
      new EarnDictationController(createSpeech(), (text) =>
        changeRef.current(text),
      ),
    [createSpeech],
  );
  const [state, setState] = useState<DictationState>(controller.snapshot);
  useEffect(() => {
    const remove = controller.observe(setState);
    return () => {
      remove();
      void controller.stop();
    };
  }, [controller]);
  useFocusEffect(
    useCallback(
      () => () => {
        void controller.stop();
      },
      [controller],
    ),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") void controller.stop();
    });
    return () => sub.remove();
  }, [controller]);
  useEffect(() => {
    if (disabled) void controller.stop();
  }, [controller, disabled]);
  const start = useCallback(() => {
    if (!disabledRef.current) void controller.start(valueRef.current);
  }, [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  return {
    ...state,
    start,
    stop,
    active:
      state.phase === "starting" ||
      state.phase === "listening" ||
      state.phase === "stopping",
  };
}
