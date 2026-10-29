import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { newIdempotencyKey } from "@/utils/id";
import { getAdvisorRepository, type AdvisorRepository } from "@/api/advisor";
import {
  advisorCommandKey,
  acknowledgeAdvisorCommand,
} from "@/storage/advisor";
import { CompanionApiError } from "@/api/http/errors";
/** A retry of the same operation keeps its key. Changing the body uses a new key. */
export function useCommand() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null),
    qc = useQueryClient();
  const locked = useRef(false);
  const run = async <T>(
    signature: unknown,
    operation: (repo: AdvisorRepository, key: string) => Promise<T>,
  ): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    const signatureText = JSON.stringify(signature);
    setBusy(true);
    setError(null);
    try {
      pending.current = {
        signature: signatureText,
        key: await advisorCommandKey(signatureText),
      };
      const result = await operation(
        getAdvisorRepository(),
        pending.current.key,
      );
      await acknowledgeAdvisorCommand(signatureText, pending.current.key);
      pending.current = null;
      await qc.invalidateQueries({ queryKey: ["advisor"] });
      return result;
    } catch (e) {
      if (
        Array.isArray(signature) &&
        signature[0] === "finish" &&
        e instanceof CompanionApiError &&
        e.code === "COMMAND_FAILED" &&
        pending.current
      ) {
        // The server has authoritatively marked this exact attempt terminal.
        // Retire only its key; the next deliberate tap starts a new attempt.
        await acknowledgeAdvisorCommand(signatureText, pending.current.key);
        pending.current = null;
        setError(
          new CompanionApiError(
            "COMMAND_FAILED",
            "The previous attempt failed. Your recording is retained. Tap Review closing to start another attempt.",
            e.status,
            false,
          ),
        );
        return undefined;
      }
      setError(e);
      return undefined;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error, setError };
}
