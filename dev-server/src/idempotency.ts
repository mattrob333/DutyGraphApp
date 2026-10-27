import type { Request, Response } from "express";
import {
  digest,
  hash,
  requireKey,
  fail,
  principal,
  type Store,
} from "./core.ts";
type Result = { status?: number; body?: unknown };
/** Pending promises reserve a command before awaiting I/O. Persist only non-credential results. */
export function commands(store: Store) {
  const pending = new Map<string, { hash: string; promise: Promise<Result> }>();
  return (fn: (req: Request, res: Response) => Result | Promise<Result>) =>
    async (req: Request, res: Response) => {
      const key = requireKey(req),
        p = principal(res);
      const scope = hash([p.sessionId, req.method, req.originalUrl, key]);
      const bodyHash = hash({
        body: req.body ?? null,
        ...(req.file ? { audio: digest(req.file.buffer) } : {}),
      });
      const saved = store.records.idempotency?.[scope]?.value as
        { hash: string; result: Result; blockedReason?: string } | undefined;
      const inflight = pending.get(scope);
      if (
        (saved && saved.hash !== bodyHash) ||
        (inflight && inflight.hash !== bodyHash)
      )
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "That key belongs to a different request.",
        );
      if (saved?.blockedReason)
        fail(
          409,
          saved.blockedReason,
          "Consent changed. Load the current meeting state.",
        );
      let result: Result;
      if (saved) result = saved.result;
      else if (inflight) result = await inflight.promise;
      else {
        const promise = Promise.resolve().then(() => fn(req, res));
        pending.set(scope, { hash: bodyHash, promise });
        try {
          result = await promise;
          store.put(
            "idempotency",
            scope,
            {
              hash: bodyHash,
              result,
              resources: Object.values(req.params).flat(),
            },
            p.companyId,
          );
        } finally {
          pending.delete(scope);
        }
      }
      res.status(result.status ?? 200);
      if (result.status === 204) res.end();
      else {
        const body = result.body;
        if (
          (saved || inflight) &&
          body &&
          typeof body === "object" &&
          "idempotentReplay" in body
        )
          res.json({ ...body, idempotentReplay: true });
        else res.json(body);
      }
    };
}

/** Ephemeral provider credentials are returned only to this connection, never to JSON persistence. */
export function transientCommands(store: Store) {
  return (fn: (req: Request, res: Response) => Result | Promise<Result>) =>
    async (req: Request, res: Response) => {
      const key = requireKey(req),
        p = principal(res);
      const id = hash([p.sessionId, req.method, req.originalUrl, key]);
      const fingerprint = hash(req.body ?? null);
      const previous = store.records.transientCommands?.[id]?.value as
        { hash: string } | undefined;
      if (previous && previous.hash !== fingerprint)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "That key belongs to a different request.",
        );
      store.put("transientCommands", id, { hash: fingerprint }, p.companyId);
      const result = await fn(req, res);
      res.status(result.status ?? 200).json(result.body);
    };
}
