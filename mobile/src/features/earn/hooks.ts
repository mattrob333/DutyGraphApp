import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { runPendingEarnCommand } from "./pending-command";
export function useEarnResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<unknown>(null),
    [revision, setRevision] = useState(0);
  const owner = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const token = ++owner.current;
      setData(null);
      setError(null);
      load()
        .then((value) => {
          if (owner.current === token) setData(value);
        })
        .catch((e) => {
          if (owner.current === token) setError(e);
        });
      return () => {
        owner.current++;
      };
    }, [load, revision]),
  );
  return { data, error, reload: () => setRevision((n) => n + 1) };
}
export function useEarnCommand() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const active = useRef(false),
    owner = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const token = ++owner.current;
      active.current = false;
      setBusy(false);
      return () => {
        if (owner.current === token) owner.current++;
        active.current = false;
      };
    }, []),
  );
  const run = async <T>(
    intent: { operation: string; body: unknown },
    send: (key: string) => Promise<T>,
    done: (value: T) => void,
  ) => {
    if (active.current || conflict) return;
    const generation = owner.current;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const descriptor = intent;
      if (!descriptor.operation)
        throw new Error("This command needs an operation name.");
      const value = await runPendingEarnCommand(
        descriptor.operation,
        descriptor.body,
        send,
      );
      if (owner.current !== generation) return;
      done(value);
    } catch (e) {
      if (owner.current !== generation) return;
      const code = (e as { code?: string }).code;
      setConflict(code === "VERSION_CONFLICT");
      setError(
        code === "VERSION_CONFLICT"
          ? "This card changed. Reload it before trying again."
          : (e as Error).message || "This could not be saved. Try again.",
      );
    } finally {
      if (owner.current === generation) {
        active.current = false;
        setBusy(false);
      }
    }
  };
  return {
    busy,
    error,
    conflict,
    run,
    clear: () => {
      setConflict(false);
      setError("");
    },
  };
}
