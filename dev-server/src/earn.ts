import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  checkVersion,
  fail,
  hash,
  principal,
  Store,
  uuid,
  type Principal,
} from "./core.ts";
import { commands } from "./idempotency.ts";
import { earnChecks, earnSeed, earnSlots } from "./earn-fixtures.ts";
import type {
  Claim,
  DraftChecks,
  EarnSummary,
  Fix,
  TaskCardDraft,
  TaskCardDraftInput,
} from "../../mobile/src/api/earn/types.ts";
const text = z.string().max(3000),
  hours = z
    .number()
    .finite()
    .nonnegative()
    .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-8);
const score = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const slot = z.strictObject({
  value: text.nullable(),
  basis: z.enum(["stated", "told_me", "not_stated"]),
  suggestion: text.optional(),
});
const step = z.union([
  text,
  z.strictObject({
    do: text.min(1),
    where: text.optional(),
    tool: z.strictObject({ name: text, getFrom: text.optional() }).optional(),
    materials: z
      .array(z.strictObject({ name: text, getFrom: text.optional() }))
      .max(30)
      .optional(),
    minutes: z.number().finite().nonnegative().optional(),
    watchFor: text.optional(),
    safety: text.optional(),
  }),
]);
const cardSchema = z.strictObject({
  title: text.min(3).max(120),
  duty: text.min(1).max(200),
  kind: z.enum(["today", "proposed"]),
  workType: z.enum(["digital", "manual", "mixed"]),
  slots: z.record(z.enum(earnSlots), slot),
  steps: z.array(step).max(40),
  doneMeans: text.optional(),
  tools: z.array(text).max(30).optional(),
  approvalsAndRules: text.optional(),
  safety: z.array(text).max(30).optional(),
  whereThingsAre: z
    .array(z.strictObject({ item: text, place: text }))
    .max(30)
    .optional(),
  aiIAlreadyUse: z.string().max(20000).optional(),
  links: z
    .strictObject({
      companyPurpose: text.optional(),
      canvasBlock: text.optional(),
      departmentGoal: text.optional(),
      role: text.optional(),
      myDuty: text.optional(),
    })
    .optional(),
  fit: z
    .strictObject({
      canvas: score,
      department: score,
      role: score,
      impact: score,
      reasons: z.strictObject({
        canvas: text.optional(),
        department: text.optional(),
        role: text.optional(),
        impact: text.optional(),
      }),
    })
    .optional(),
  impact: z
    .strictObject({ measure: text.optional(), how: text.optional() })
    .optional(),
  fixesGapId: text.optional(),
  money: z
    .strictObject({
      kind: z.enum([
        "pay_invoice",
        "transfer",
        "refund",
        "purchase",
        "collect",
        "other",
      ]),
      system: text.optional(),
      typicalAmount: text.optional(),
      limit: text.optional(),
      approver: text.optional(),
    })
    .optional(),
});
const createBody = z.strictObject({
  cards: z.array(cardSchema).min(1).max(15),
  sourceNote: z.literal("app"),
});
const decision = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
});
const confirmBody = decision.extend({ card: cardSchema.optional() });
const fixBody = z.strictObject({
  gapId: text.optional(),
  text: text.min(1),
  kind: z.enum(["new_steps", "agent", "tool", "more_people"]),
  measureName: text.min(1),
  measureBefore: text.optional(),
  hoursBefore: hours,
  hoursAfter: hours,
  card: cardSchema.optional(),
});
type State = ReturnType<typeof earnSeed>;
const owner = (p: Principal) => hash(["earn", p.companyId, p.personId]);
function luhn(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = digits.length - 1, j = 0; i >= 0; i--, j++) {
    let n = Number(digits[i]);
    if (j % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}
/** Deterministic best-effort fixture scrub, not arbitrary secret detection. No provider is called. */
export function cleanEarnCard(value: TaskCardDraftInput): {
  card: TaskCardDraftInput;
  removed: number;
} {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024)
    fail(400, "CARD_INVALID", "Keep each card below 64 KB.");
  if (/dgp_[A-Za-z0-9_-]+/i.test(JSON.stringify(value)))
    fail(
      400,
      "DUTYGRAPH_TOKEN_IN_CARD",
      "Remove the DutyGraph token before saving this draft.",
    );
  let removed = 0;
  const replace = (value: string) => {
    let result = value.replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:sk|rk|pk)_(?:live_|test_)?[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
      () => {
        removed++;
        return "[removed]";
      },
    );
    result = result.replace(
      /\b(password|passwd|api[_ -]?key|secret|access[_ -]?token)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi,
      (_match, label: string) => {
        removed++;
        return label + "=[removed]";
      },
    );
    result = result.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, () => {
      removed++;
      return "Bearer [removed]";
    });
    // Canonical record UUIDs are identifiers, not payment card numbers.
    const spans = [
      ...result.matchAll(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      ),
    ].map((match) => [match.index!, match.index! + match[0].length]);
    return result.replace(
      /\b(?:\d[ .-]?){13,19}\b/g,
      (value, offset: number) => {
        if (
          spans.some(
            ([start, end]) => offset >= start && offset + value.length <= end,
          ) ||
          !luhn(value)
        )
          return value;
        removed++;
        return "[removed]";
      },
    );
  };
  const walk = (item: unknown): unknown =>
    typeof item === "string"
      ? replace(item)
      : Array.isArray(item)
        ? item.map(walk)
        : item && typeof item === "object"
          ? Object.fromEntries(
              Object.entries(item).map(([key, v]) => [key, walk(v)]),
            )
          : item;
  return { card: walk(value) as TaskCardDraftInput, removed };
}
function getState(store: Store, p: Principal, enabled: boolean): State {
  const id = owner(p),
    saved = store.records.earn?.[id];
  if (saved) return store.get<State>("earn", id, p, true);
  const state = earnSeed(p, enabled);
  state.gaps[0].myFixIds = [state.fixes[0].id];
  state.gaps[2].myFixIds = [state.fixes[1].id];
  store.put("earn", id, state, p.companyId, p.personId);
  return state;
}
function save(store: Store, p: Principal, state: State) {
  store.put("earn", owner(p), state, p.companyId, p.personId);
}
function ownDraft(state: State, id: string) {
  const value = state.drafts.find((d) => d.id === id);
  if (!value) fail(404, "DRAFT_NOT_FOUND", "This draft was not found.");
  return value;
}
function refreshExpiry(state: State) {
  for (const row of state.drafts)
    if (row.state === "waiting" && Date.parse(row.expiresAt) <= Date.now()) {
      row.state = "expired";
      row.version++;
      row.stateChangedAt = new Date().toISOString();
    }
}
function newDraft(state: State, card: TaskCardDraftInput): TaskCardDraft {
  if (state.drafts.filter((d) => d.state === "waiting").length >= 50)
    fail(409, "DRAFT_LIMIT", "Check your waiting drafts before sending more.");
  if (
    card.fixesGapId &&
    (card.kind !== "proposed" ||
      !state.gaps.some((g) => g.id === card.fixesGapId))
  )
    fail(400, "CARD_INVALID", "Link a proposed card to an available gap.");
  const cleaned = cleanEarnCard(card),
    now = new Date().toISOString();
  const checks = earnChecks(cleaned.card, state.settings.enabled);
  checks.secretsRemoved = cleaned.removed;
  const row: TaskCardDraft = {
    id: uuid(),
    version: 1,
    via: "app",
    sourceNote: "app",
    state: "waiting",
    card: cleaned.card,
    checks,
    createdAt: now,
    stateChangedAt: now,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  state.drafts.unshift(row);
  return row;
}
function summary(state: State): EarnSummary {
  const { settings, claims, fixes } = structuredClone(state);
  const enabled = settings.enabled;
  if (!enabled) {
    settings.perCardCents = 0;
    settings.poolCents = 0;
    settings.poolCommittedCents = 0;
    settings.poolLeftCents = 0;
    settings.loadedHourlyRateCents = 0;
    settings.bonusCapCents = 0;
    settings.bonusRateBp = 0;
  }
  const myClaims = enabled ? claims : [],
    myFixes = fixes.map((f) => (enabled ? f : { ...f, bonusCents: undefined }));
  return {
    settings,
    me: {
      paidCards: enabled ? claims.filter((c) => c.state === "paid").length : 0,
      maxPaidCards: settings.maxPaidCardsPerPerson,
      earnedPaidCents: enabled
        ? claims
            .filter((c) => c.state === "paid")
            .reduce((n, c) => n + c.amountCents, 0) +
          fixes
            .filter((f) => f.state === "paid")
            .reduce((n, f) => n + (f.bonusCents ?? 0), 0)
        : 0,
      earnedWaitingCents: enabled
        ? claims
            .filter((c) => ["approved", "manager_checking"].includes(c.state))
            .reduce((n, c) => n + c.amountCents, 0) +
          fixes
            .filter((f) => f.state === "checking")
            .reduce((n, f) => n + (f.bonusCents ?? 0), 0)
        : 0,
      hoursSavedPerWeek: fixes
        .filter((f) => f.hoursAfterChecked !== undefined)
        .reduce(
          (n, f) => n + Math.max(0, f.hoursBefore - f.hoursAfterChecked!),
          0,
        ),
      confirmedCards:
        4 + state.drafts.filter((d) => d.state === "confirmed").length,
      draftsWaiting: state.drafts.filter((d) => d.state === "waiting").length,
    },
    claims: myClaims,
    fixes: myFixes,
  };
}
export function earnRoutes(store: Store, options: { enabled?: boolean } = {}) {
  const router = Router(),
    command = commands(store),
    enabled = options.enabled ?? true;
  router.use(authenticate(store, ["participant_mobile"]));
  router.get("/capabilities", (_req, res) =>
    res.json({ developmentFixture: true, draftCreation: true }),
  );
  router.get("/summary", (_req, res) => {
    const p = principal(res),
      state = getState(store, p, enabled);
    refreshExpiry(state);
    save(store, p, state);
    res.json(summary(state));
  });
  router.get("/drafts", (req, res) => {
    const p = principal(res),
      state = getState(store, p, enabled);
    refreshExpiry(state);
    save(store, p, state);
    const filter = z
      .enum(["waiting", "confirmed", "not_mine", "expired"])
      .optional()
      .parse(req.query.state);
    const counts = { waiting: 0, confirmed: 0, not_mine: 0, expired: 0 };
    for (const row of state.drafts) counts[row.state]++;
    res.json({
      drafts: state.drafts
        .filter((d) => !filter || d.state === filter)
        .map((d) => ({
          ...d,
          checks: {
            ...d.checks,
            earnHint: state.settings.enabled ? d.checks.earnHint : "off",
            earnHintReasons: state.settings.enabled
              ? d.checks.earnHintReasons
              : [],
          },
        })),
      counts,
    });
  });
  router.get("/drafts/:draftId", (req, res) => {
    const p = principal(res),
      state = getState(store, p, enabled);
    refreshExpiry(state);
    save(store, p, state);
    const row = ownDraft(state, String(req.params.draftId));
    res.json({
      ...row,
      checks: {
        ...row.checks,
        earnHint: state.settings.enabled ? row.checks.earnHint : "off",
        earnHintReasons: state.settings.enabled
          ? row.checks.earnHintReasons
          : [],
      },
    });
  });
  router.post(
    "/drafts",
    command((req, res) => {
      const body = createBody.parse(req.body),
        p = principal(res),
        state = getState(store, p, enabled);
      refreshExpiry(state);
      const drafts: TaskCardDraft[] = [],
        refused: { index: number; code: string; message: string }[] = [];
      for (const [index, card] of body.cards.entries()) {
        try {
          drafts.push(newDraft(state, card));
        } catch (e) {
          if (e && typeof e === "object" && "code" in e && "message" in e)
            refused.push({
              index,
              code: String(e.code),
              message: String(e.message),
            });
          else throw e;
        }
      }
      save(store, p, state);
      return { body: { drafts, refused } };
    }),
  );
  router.post(
    "/drafts/:draftId/confirm",
    command((req, res) => {
      const body = confirmBody.parse(req.body),
        p = principal(res),
        state = getState(store, p, enabled);
      refreshExpiry(state);
      const row = ownDraft(state, String(req.params.draftId));
      checkVersion(row, body.expectedVersion);
      if (row.state !== "waiting")
        fail(409, "DRAFT_NOT_WAITING", "This draft is not waiting for review.");
      if (body.card) {
        const clean = cleanEarnCard(body.card);
        row.card = clean.card;
        row.checks = earnChecks(clean.card, state.settings.enabled);
        row.checks.secretsRemoved = clean.removed;
      }
      row.state = "confirmed";
      row.version++;
      row.stateChangedAt = new Date().toISOString();
      row.taskRecordId = uuid();
      const task = {
        id: row.taskRecordId,
        title: row.card.title,
        version: 1,
        hash: hash(row.card),
        state: "proposed",
        needsAttestation: false,
        reviewed: true,
        data: {
          duty: row.card.duty,
          purpose: row.card.duty,
          trigger: row.card.slots.startsWhen.value ?? "",
          inputs: row.card.slots.getsFrom.value ?? "",
          instructions: row.card.steps
            .map((s) => (typeof s === "string" ? s : s.do))
            .join("\n"),
          systems: (row.card.tools ?? []).join(", "),
          output: row.card.doneMeans ?? "",
          destination: row.card.slots.handsTo.value ?? "",
          humanGate: row.card.approvalsAndRules ?? "",
        },
      };
      let claim: Claim | undefined;
      if (state.settings.enabled && row.checks.readyToHandOff) {
        claim = {
          id: uuid(),
          version: 1,
          draftId: row.id,
          taskRecordId: row.taskRecordId,
          title: row.card.title,
          state: "manager_checking",
          amountCents: state.settings.perCardCents,
          createdAt: row.stateChangedAt,
        };
        row.claimId = claim.id;
        state.claims.unshift(claim);
      }
      // Store.save atomically renames a complete synchronous snapshot. Stage both
      // records together so neither a crash nor a failed save can leave a task
      // without its confirmed draft/claim. Do not mutate other Store collections.
      const result = {
        body: {
          draft: row,
          taskRecordId: row.taskRecordId,
          ...(claim ? { claim } : {}),
        },
      };
      // Match the existing command receipt scope so a crash after the snapshot,
      // but before the wrapper acknowledgement, can replay this exact result.
      const receiptScope = hash([
        p.sessionId,
        req.method,
        req.originalUrl,
        req.get("Idempotency-Key"),
      ]);
      const previousReceipts = store.records.idempotency;
      const previousTasks = store.records.tasks;
      const previousEarn = store.records.earn;
      store.records.tasks = {
        ...previousTasks,
        [row.taskRecordId]: {
          companyId: p.companyId,
          personId: p.personId,
          value: structuredClone(task),
        },
      };
      store.records.earn = {
        ...previousEarn,
        [owner(p)]: {
          companyId: p.companyId,
          personId: p.personId,
          value: structuredClone(state),
        },
      };
      store.records.idempotency = {
        ...previousReceipts,
        [receiptScope]: {
          companyId: p.companyId,
          value: {
            hash: hash({ body: req.body ?? null }),
            result: structuredClone(result),
            resources: Object.values(req.params).flat(),
          },
        },
      };
      try {
        store.save();
      } catch (error) {
        if (previousReceipts) store.records.idempotency = previousReceipts;
        else delete store.records.idempotency;
        if (previousTasks) store.records.tasks = previousTasks;
        else delete store.records.tasks;
        if (previousEarn) store.records.earn = previousEarn;
        else delete store.records.earn;
        throw error;
      }
      return result;
    }),
  );
  router.post(
    "/drafts/:draftId/not-mine",
    command((req, res) => {
      const body = decision.parse(req.body),
        p = principal(res),
        state = getState(store, p, enabled);
      refreshExpiry(state);
      const row = ownDraft(state, String(req.params.draftId));
      checkVersion(row, body.expectedVersion);
      if (row.state !== "waiting")
        fail(409, "DRAFT_NOT_WAITING", "This draft is not waiting for review.");
      row.state = "not_mine";
      row.version++;
      row.stateChangedAt = new Date().toISOString();
      save(store, p, state);
      return { body: row };
    }),
  );
  router.get("/team-board", (_req, res) => {
    const state = getState(store, principal(res), enabled),
      team = structuredClone(state.team),
      extra = state.drafts.filter((d) => d.state === "confirmed").length;
    team.teamTotalCards += extra;
    team.rows[2].confirmedCards += extra;
    team.rows.sort((a, b) => a.name.localeCompare(b.name));
    res.json(team);
  });
  router.get("/gaps", (_req, res) => {
    const state = getState(store, principal(res), enabled);
    res.json({
      gaps: state.gaps.map((g) =>
        state.settings.enabled ? g : { ...g, rewardRangeCents: undefined },
      ),
    });
  });
  router.post(
    "/fixes",
    command((req, res) => {
      const body = fixBody.parse(req.body),
        p = principal(res),
        state = getState(store, p, enabled);
      if (body.gapId && !state.gaps.some((g) => g.id === body.gapId))
        fail(404, "GAP_NOT_FOUND", "This gap was not found.");
      if (
        body.card &&
        (body.card.kind !== "proposed" ||
          !body.gapId ||
          body.card.fixesGapId !== body.gapId)
      )
        fail(400, "CARD_INVALID", "Link the proposed Task Card to this gap.");
      const draft = body.card ? newDraft(state, body.card) : undefined;
      const fix: Fix = {
        id: uuid(),
        version: 1,
        gapId: body.gapId ?? null,
        text: body.text,
        kind: body.kind,
        measureName: body.measureName,
        ...(body.measureBefore ? { measureBefore: body.measureBefore } : {}),
        hoursBefore: body.hoursBefore,
        hoursAfter: body.hoursAfter,
        state: "sent",
        createdAt: new Date().toISOString(),
        ...(draft ? { draftId: draft.id } : {}),
      };
      state.fixes.unshift(fix);
      if (body.gapId) {
        const gap = state.gaps.find((g) => g.id === body.gapId)!;
        if (!gap.myFixIds.length) gap.peopleWorkingOnIt++;
        gap.myFixIds.unshift(fix.id);
      }
      save(store, p, state);
      return { body: { fix, ...(draft ? { draft } : {}) } };
    }),
  );
  return router;
}
