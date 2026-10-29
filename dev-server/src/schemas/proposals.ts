import { z } from "zod";
const text = z.string().max(12000),
  person = z.string().max(200).nullable();
export const sourceSchema = z
  .object({
    segmentId: z.uuid(),
    revision: z.number().int().positive(),
    quote: text.min(1),
    speakerCluster: z.string().nullable(),
    personKey: person,
  })
  .strict();
/** Model and client body edits share the same bounded vocabulary; code still owns state and permissions. */
export const proposalBodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("decision"),
      decision: text.min(1),
      decidedByPersonKey: person,
      rationale: text,
      alternatives: z.array(text).max(20),
      deferred: z.boolean(),
      decideBy: z.string().max(100).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("action"),
      what: text.min(1),
      ownerPersonKey: person,
      due: z.string().max(100).nullable(),
      reviewTrigger: text.optional(),
      dependsOn: z.array(z.string().max(200)).max(20),
      doneWhen: text,
      status: z.enum([
        "suggested",
        "proposed",
        "assigned",
        "accepted",
        "completed",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("open_question"),
      question: text.min(1),
      askPersonKey: person,
    })
    .strict(),
  z
    .object({
      kind: z.literal("task_card_delta"),
      taskCardId: z.uuid().nullable(),
      personKey: z.string().nullable().optional(),
      field: z.enum([
        "title",
        "ownerId",
        "duty",
        "purpose",
        "trigger",
        "inputs",
        "instructions",
        "output",
        "systems",
        "humanGate",
        "destination",
        "mode",
      ]),
      from: text.nullable(),
      to: text,
    })
    .strict(),
  z
    .object({
      kind: z.literal("responsibility_delta"),
      personKey: z.string().min(1).max(200),
      duty: text,
      change: z.enum(["add", "remove"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("contradiction"),
      claimA: z.object({ text, source: sourceSchema }).strict(),
      claimB: z.object({ text, source: sourceSchema }).strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("claim"),
      fieldPath: z.string().min(1).max(200),
      value: text,
    })
    .strict(),
]);
