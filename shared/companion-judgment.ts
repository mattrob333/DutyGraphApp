import { z } from "zod";

/**
 * Companion facilitator contracts (PRD sections 10, 12, 14).
 *
 * The split: Jev judges typed questions (is a follow-up justified, is this a
 * contradiction, is the meeting ready to close). The conversation model
 * facilitates (phrases the next utterance). Deterministic code enforces facts:
 * timers, arithmetic, due dates, presence, permissions, authentication, known
 * ids, version checks, approval state and database truth (PRD 10.2). Nothing in
 * this file calls a model or does that deterministic work; it defines the
 * shapes, validates model output, and holds the pure state machine.
 *
 * Internal judgments carry confidence and information-value numbers. Those
 * never reach ordinary mobile participants (PRD 10.3): pass every judgment
 * through `toParticipantFacing()` before it crosses the mobile API boundary.
 */

// ---------- Enums ----------

export const MEETING_MODES = [
  "ASYNC",
  "LIVE",
  "HYBRID",
  "NO_MEETING",
  "INSUFFICIENT_INFO",
] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

export const MEETING_TYPES = [
  "INFORMATIONAL",
  "DECISION",
  "PROBLEM_SOLVING",
  "BRAINSTORMING",
  "TEAM_BUILDING",
  "INSTRUCTIONAL",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MISSING_VARIABLES = [
  "OWNER",
  "DEADLINE",
  "DEADLINE_IMPACT",
  "BLOCKER",
  "EVIDENCE",
  "SCOPE",
  "OTHER",
] as const;
export type MissingVariable = (typeof MISSING_VARIABLES)[number];

export const FOLLOW_UP_REASONS = [
  "CLEAR_ANSWER",
  "VAGUE_ANSWER",
  "MISSING_CRITICAL",
  "ALREADY_KNOWN",
  "LOW_VALUE",
  "OFF_TOPIC",
  "WRONG_PERSON",
  "PARTICIPANT_DECLINED",
  "PARTICIPANT_UNKNOWN",
  "CONTRADICTION",
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

export const COVERAGE_DIMENSIONS = ["WHAT", "HOW", "WHO", "WHY", "EVIDENCE"] as const;
export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

// ---------- Inputs ----------

export interface MeetingModeInput {
  purpose: string;
  desiredOutcome: string;
  participants: { participantId: string; role?: string }[];
  knownContext: string[];
  estimatedMinutes?: number;
}
export interface MeetingTypeInput {
  purpose: string;
  desiredOutcome: string;
  agendaItems?: string[];
}
export interface FollowUpInput {
  interaction: "PULSE" | "DISCOVERY" | "CLARIFICATION" | "MEETING";
  outcome: string;
  topic: string;
  question: string;
  answer: string;
  /** Already confirmed context; a follow-up for any of it is not justified. */
  confirmedFacts: string[];
  followUpsAlreadyAskedOnTopic: number;
}
export interface TopicInput {
  outcome: string;
  currentTopic: string;
  utterance: string;
}
export interface EvidenceInput {
  outcome: string;
  statement: string;
  supportingEvidence: string[];
  confirmedFacts: string[];
}
export interface DecisionInput {
  decision: string;
  options: string[];
  evidence: string[];
  statedDecider?: string;
  statedDeadline?: string;
}
export interface ContradictionInput {
  newStatement: string;
  confirmedContext: string[];
}
export interface CloseInput {
  outcome: string;
  capturedItems: string[];
  openItems: string[];
}

// ---------- Judgment outputs (internal, validated) ----------

const confidence = z.number().min(0).max(1);
const shortText = z.string().max(400);
const textList = z.array(shortText).max(10).default([]);

export const meetingModeJudgmentSchema = z.object({
  mode: z.enum(MEETING_MODES),
  /** Model free text; internal only. */
  rationale: shortText.default(""),
  missingInformation: textList,
  /** participantId values only; deterministic code owns presence and permission. */
  requiredParticipantIds: z.array(z.string().max(100)).max(50).default([]),
  confidence,
});
export type MeetingModeJudgment = z.infer<typeof meetingModeJudgmentSchema>;

export const meetingTypeJudgmentSchema = z.object({
  meetingType: z.enum(MEETING_TYPES).nullable(),
  rationale: shortText.default(""),
  confidence,
});
export type MeetingTypeJudgment = z.infer<typeof meetingTypeJudgmentSchema>;

export const followUpJudgmentSchema = z.object({
  followUpNeeded: z.boolean(),
  reason: z.enum(FOLLOW_UP_REASONS),
  /** The single thing a follow-up should ask about, when one is needed. */
  missingVariable: z.enum(MISSING_VARIABLES).nullable(),
  informationValue: confidence,
  confidence,
});
export type FollowUpJudgment = z.infer<typeof followUpJudgmentSchema>;

export const topicJudgmentSchema = z.object({
  relevance: z.enum(["ON_TOPIC", "TANGENT", "OFF_TOPIC"]),
  action: z.enum(["CONTINUE", "PARK", "REDIRECT"]),
  confidence,
});
export type TopicJudgment = z.infer<typeof topicJudgmentSchema>;

export const evidenceJudgmentSchema = z.object({
  sufficient: z.boolean(),
  basis: z.enum(["OBSERVED", "BELIEF", "ASSUMPTION", "UNKNOWN"]),
  missing: z.array(z.enum(COVERAGE_DIMENSIONS)).max(5).default([]),
  confidence,
});
export type EvidenceJudgment = z.infer<typeof evidenceJudgmentSchema>;

export const decisionReadinessJudgmentSchema = z.object({
  status: z.enum(["READY", "BLOCKED", "UNSUPPORTED"]),
  blockers: textList,
  missingEvidence: textList,
  confidence,
});
export type DecisionReadinessJudgment = z.infer<typeof decisionReadinessJudgmentSchema>;

export const contradictionJudgmentSchema = z.object({
  contradicts: z.boolean(),
  severity: z.enum(["NONE", "MINOR", "MATERIAL"]),
  /** Index into `confirmedContext` of the conflicting item, if any. */
  conflictingContextIndex: z.number().int().min(0).max(1000).nullable(),
  confidence,
});
export type ContradictionJudgment = z.infer<typeof contradictionJudgmentSchema>;

export const closeReadinessJudgmentSchema = z.object({
  ready: z.boolean(),
  remaining: z
    .array(z.enum(["OUTCOME", "OWNER", "DEADLINE", "OPEN_QUESTION", "CONFIRMATION"]))
    .max(5)
    .default([]),
  confidence,
});
export type CloseReadinessJudgment = z.infer<typeof closeReadinessJudgmentSchema>;

/** PRD 10.3 service interface. Implementations call Jev server-side only. */
export interface MeetingJudgmentService {
  classifyMeetingMode(input: MeetingModeInput): Promise<MeetingModeJudgment>;
  classifyMeetingType(input: MeetingTypeInput): Promise<MeetingTypeJudgment>;
  assessFollowUpNeed(input: FollowUpInput): Promise<FollowUpJudgment>;
  assessTopicRelevance(input: TopicInput): Promise<TopicJudgment>;
  assessEvidenceSufficiency(input: EvidenceInput): Promise<EvidenceJudgment>;
  assessDecisionReadiness(input: DecisionInput): Promise<DecisionReadinessJudgment>;
  assessContradiction(input: ContradictionInput): Promise<ContradictionJudgment>;
  assessCloseReadiness(input: CloseInput): Promise<CloseReadinessJudgment>;
}

// ---------- Parsing model output ----------

export const JUDGMENT_SCHEMAS = {
  meetingMode: meetingModeJudgmentSchema,
  meetingType: meetingTypeJudgmentSchema,
  followUp: followUpJudgmentSchema,
  topic: topicJudgmentSchema,
  evidence: evidenceJudgmentSchema,
  decisionReadiness: decisionReadinessJudgmentSchema,
  contradiction: contradictionJudgmentSchema,
  closeReadiness: closeReadinessJudgmentSchema,
} as const;
export type JudgmentKind = keyof typeof JUDGMENT_SCHEMAS;
export interface JudgmentByKind {
  meetingMode: MeetingModeJudgment;
  meetingType: MeetingTypeJudgment;
  followUp: FollowUpJudgment;
  topic: TopicJudgment;
  evidence: EvidenceJudgment;
  decisionReadiness: DecisionReadinessJudgment;
  contradiction: ContradictionJudgment;
  closeReadiness: CloseReadinessJudgment;
}

export type JudgmentParseFailure = {
  ok: false;
  kind: string;
  code: "UNKNOWN_KIND" | "NOT_JSON" | "TOO_LARGE" | "SCHEMA";
  message: string;
  issues: string[];
};
export type JudgmentParseResult<K extends JudgmentKind> =
  | { ok: true; kind: K; value: JudgmentByKind[K] }
  | JudgmentParseFailure;

const MAX_RAW_CHARS = 20_000;

/**
 * Validate raw model output (a JSON string, optionally in a code fence, or an
 * already-parsed value). Never throws: garbage becomes a typed failure so the
 * caller can fall back to a conservative default and record why. Unknown extra
 * fields are dropped.
 */
export function parseJudgment<K extends JudgmentKind>(
  kind: K,
  raw: unknown,
): JudgmentParseResult<K> {
  const fail = (
    code: JudgmentParseFailure["code"],
    message: string,
    issues: string[] = [],
  ): JudgmentParseFailure => ({ ok: false, kind: String(kind), code, message, issues });
  try {
    if (!Object.prototype.hasOwnProperty.call(JUDGMENT_SCHEMAS, kind))
      return fail("UNKNOWN_KIND", "Unknown judgment kind");
    let value: unknown = raw;
    if (typeof raw === "string") {
      if (raw.length > MAX_RAW_CHARS) return fail("TOO_LARGE", "Judgment output is too large");
      const text = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      try {
        value = JSON.parse(text);
      } catch {
        return fail("NOT_JSON", "Judgment output is not valid JSON");
      }
    }
    const result = JUDGMENT_SCHEMAS[kind].safeParse(value);
    if (!result.success)
      return fail(
        "SCHEMA",
        "Judgment output does not match the schema",
        result.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      );
    return { ok: true, kind, value: result.data as JudgmentByKind[K] };
  } catch {
    return fail("SCHEMA", "Judgment output could not be validated");
  }
}

/**
 * Conservative defaults when Jev is unavailable or returns garbage. They bias
 * toward fewer questions and toward not closing or deciding on our own; code
 * records the failure reason. Confidence 0 marks them as not model-derived.
 */
export const FAILSAFE_JUDGMENTS: JudgmentByKind = {
  meetingMode: {
    mode: "INSUFFICIENT_INFO",
    rationale: "",
    missingInformation: [],
    requiredParticipantIds: [],
    confidence: 0,
  },
  meetingType: { meetingType: null, rationale: "", confidence: 0 },
  followUp: {
    followUpNeeded: false,
    reason: "LOW_VALUE",
    missingVariable: null,
    informationValue: 0,
    confidence: 0,
  },
  topic: { relevance: "ON_TOPIC", action: "CONTINUE", confidence: 0 },
  evidence: { sufficient: false, basis: "UNKNOWN", missing: [], confidence: 0 },
  decisionReadiness: { status: "UNSUPPORTED", blockers: [], missingEvidence: [], confidence: 0 },
  contradiction: {
    contradicts: false,
    severity: "NONE",
    conflictingContextIndex: null,
    confidence: 0,
  },
  closeReadiness: { ready: false, remaining: [], confidence: 0 },
};

// ---------- Participant-facing projection ----------

const INTERNAL_KEY = /(confidence|score|probabilit|informationvalue|logit|rationale)/i;

export type ParticipantFacing<T> = T extends readonly (infer U)[]
  ? ParticipantFacing<U>[]
  : T extends object
    ? {
        [K in keyof T as K extends
          | "confidence"
          | "informationValue"
          | "rationale"
          ? never
          : K]: ParticipantFacing<T[K]>;
      }
    : T;

/**
 * Remove every score, confidence, information-value and free-text rationale
 * field, recursively, so nothing internal reaches the mobile API (PRD 10.3).
 * Uses a name pattern rather than the known field list so a field added later
 * fails closed. Participant-visible wording (for example the reason a meeting
 * was avoided) is composed by deterministic server code, not passed through.
 */
export function toParticipantFacing<T>(value: T): ParticipantFacing<T> {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) if (!INTERNAL_KEY.test(k)) out[k] = strip(val);
      return out;
    }
    return v;
  };
  return strip(value) as ParticipantFacing<T>;
}

// ---------- Conversation state machine (PRD 12) ----------

export const CONVERSATION_STATES = [
  "CREATED",
  "READY",
  "ACTIVE",
  "PROCESSING_TURN",
  "FOLLOW_UP",
  "NEXT_TOPIC",
  "REVIEW_READY",
  "REVIEWING",
  "SUBMITTING",
  "SUBMITTED",
  "MIC_ERROR",
  "OFFLINE_DRAFT",
  "PROVIDER_ERROR",
  "SUBMISSION_FAILED",
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export type ConversationEvent =
  | "MARK_READY"
  | "START"
  | "TURN_RECEIVED"
  | "FOLLOW_UP_NEEDED"
  | "TOPIC_COMPLETE"
  | "ALL_TOPICS_COVERED"
  | "QUESTION_ASKED"
  | "TOPIC_STARTED"
  | "PARTICIPANT_DONE"
  | "REVIEW_OPENED"
  | "REVIEW_EDITED"
  | "SUBMIT_REQUESTED"
  | "SUBMIT_SUCCEEDED"
  | "SUBMIT_FAILED"
  | "BACK_TO_REVIEW"
  | "MIC_FAILED"
  | "MIC_RECOVERED"
  | "WENT_OFFLINE"
  | "BACK_ONLINE"
  | "PROVIDER_FAILED"
  | "RETRY_TURN"
  | "ABANDON_TURN";

/** Allowed transitions: state -> event -> next state. The server owns state. */
export const CONVERSATION_TRANSITIONS: Record<
  ConversationState,
  Partial<Record<ConversationEvent, ConversationState>>
> = {
  CREATED: { MARK_READY: "READY" },
  READY: { START: "ACTIVE" },
  ACTIVE: {
    TURN_RECEIVED: "PROCESSING_TURN",
    PARTICIPANT_DONE: "REVIEW_READY",
    MIC_FAILED: "MIC_ERROR",
    WENT_OFFLINE: "OFFLINE_DRAFT",
  },
  PROCESSING_TURN: {
    FOLLOW_UP_NEEDED: "FOLLOW_UP",
    TOPIC_COMPLETE: "NEXT_TOPIC",
    ALL_TOPICS_COVERED: "REVIEW_READY",
    PROVIDER_FAILED: "PROVIDER_ERROR",
  },
  FOLLOW_UP: { QUESTION_ASKED: "ACTIVE" },
  NEXT_TOPIC: { TOPIC_STARTED: "ACTIVE", ALL_TOPICS_COVERED: "REVIEW_READY" },
  REVIEW_READY: { REVIEW_OPENED: "REVIEWING" },
  REVIEWING: { REVIEW_EDITED: "REVIEWING", SUBMIT_REQUESTED: "SUBMITTING" },
  SUBMITTING: { SUBMIT_SUCCEEDED: "SUBMITTED", SUBMIT_FAILED: "SUBMISSION_FAILED" },
  // Terminal. Replayed submit events are treated as idempotent no-ops below.
  SUBMITTED: {},
  MIC_ERROR: { MIC_RECOVERED: "ACTIVE" },
  OFFLINE_DRAFT: { BACK_ONLINE: "ACTIVE" },
  PROVIDER_ERROR: { RETRY_TURN: "PROCESSING_TURN", ABANDON_TURN: "ACTIVE" },
  SUBMISSION_FAILED: { SUBMIT_REQUESTED: "SUBMITTING", BACK_TO_REVIEW: "REVIEWING" },
};

/** Final submit is idempotent: a replay against SUBMITTED changes nothing. */
const IDEMPOTENT_REPLAYS: Partial<Record<ConversationState, ConversationEvent[]>> = {
  SUBMITTED: ["SUBMIT_REQUESTED", "SUBMIT_SUCCEEDED"],
};

export type TransitionResult<S extends string, E extends string> =
  | { ok: true; state: S; changed: boolean }
  | { ok: false; code: "ILLEGAL_TRANSITION"; from: S; event: E };

/** Pure. Never throws; unknown states or events are illegal transitions. */
export function nextConversationState(
  state: ConversationState,
  event: ConversationEvent,
): TransitionResult<ConversationState, ConversationEvent> {
  const row = Object.prototype.hasOwnProperty.call(CONVERSATION_TRANSITIONS, state)
    ? CONVERSATION_TRANSITIONS[state]
    : undefined;
  const next = row && Object.prototype.hasOwnProperty.call(row, event) ? row[event] : undefined;
  if (next) return { ok: true, state: next, changed: next !== state };
  if (Object.prototype.hasOwnProperty.call(IDEMPOTENT_REPLAYS, state) && IDEMPOTENT_REPLAYS[state]?.includes(event)) return { ok: true, state, changed: false };
  return { ok: false, code: "ILLEGAL_TRANSITION", from: state, event };
}

// Meeting facilitator states (PRD 12.2).
export const MEETING_FACILITATOR_STATES = [
  "PREPARE",
  "OPEN",
  "ESTABLISH_PURPOSE",
  "CONFIRM_OUTCOME",
  "COLLECT",
  "PROBE",
  "RESOLVE_CONTRADICTIONS",
  "DECIDE",
  "ASSIGN_EXECUTION",
  "CONFIRM_RESPONSIBILITY",
  "CLOSE",
  "COMPLETE",
] as const;
export type MeetingFacilitatorState = (typeof MEETING_FACILITATOR_STATES)[number];

export const MEETING_TRANSITIONS: Record<
  MeetingFacilitatorState,
  readonly MeetingFacilitatorState[]
> = {
  PREPARE: ["OPEN"],
  OPEN: ["ESTABLISH_PURPOSE"],
  ESTABLISH_PURPOSE: ["CONFIRM_OUTCOME"],
  CONFIRM_OUTCOME: ["COLLECT"],
  COLLECT: ["PROBE", "RESOLVE_CONTRADICTIONS", "DECIDE", "ASSIGN_EXECUTION", "CLOSE"],
  PROBE: ["COLLECT", "RESOLVE_CONTRADICTIONS", "DECIDE", "ASSIGN_EXECUTION", "CLOSE"],
  RESOLVE_CONTRADICTIONS: ["COLLECT", "PROBE", "DECIDE", "ASSIGN_EXECUTION", "CLOSE"],
  DECIDE: ["PROBE", "ASSIGN_EXECUTION", "CLOSE"],
  ASSIGN_EXECUTION: ["CONFIRM_RESPONSIBILITY", "PROBE", "CLOSE"],
  CONFIRM_RESPONSIBILITY: ["ASSIGN_EXECUTION", "CLOSE"],
  // Reopening from CLOSE is allowed when close-readiness was wrong.
  CLOSE: ["COMPLETE", "PROBE"],
  COMPLETE: [],
};

/**
 * Meeting types omit or specialise states (PRD 12.2). Informational and
 * instructional sessions skip decision states; team-building uses lighter
 * intervention and also skips contradiction resolution. Brainstorming keeps
 * every state; the brainstorming prompt protects divergence before convergence.
 */
export const MEETING_TYPE_SKIPPED_STATES: Record<MeetingType, readonly MeetingFacilitatorState[]> = {
  INFORMATIONAL: ["DECIDE"],
  DECISION: [],
  PROBLEM_SOLVING: [],
  BRAINSTORMING: [],
  TEAM_BUILDING: ["DECIDE", "RESOLVE_CONTRADICTIONS"],
  INSTRUCTIONAL: ["DECIDE"],
};

/** Pure. Rejects unknown states, illegal edges, and states a meeting type skips. */
export function nextMeetingState(
  state: MeetingFacilitatorState,
  to: MeetingFacilitatorState,
  meetingType?: MeetingType,
): TransitionResult<MeetingFacilitatorState, `MOVE_TO_${MeetingFacilitatorState}`> {
  const event = `MOVE_TO_${to}` as const;
  const allowed = Object.prototype.hasOwnProperty.call(MEETING_TRANSITIONS, state)
    ? MEETING_TRANSITIONS[state]
    : [];
  const skipped = meetingType ? MEETING_TYPE_SKIPPED_STATES[meetingType] ?? [] : [];
  if (allowed.includes(to) && !skipped.includes(to)) return { ok: true, state: to, changed: true };
  return { ok: false, code: "ILLEGAL_TRANSITION", from: state, event };
}

// ---------- Provider abstraction (PRD 14), types only ----------
// The domain layer never imports a vendor SDK; adapters implement these.

export interface SttSessionConfig {
  sessionId: string;
  language: string;
  sampleRateHz: number;
  encoding: "pcm16" | "opus";
}
export interface SttTranscriptEvent {
  utteranceId: string;
  text: string;
  /** Final segments are distinguishable from partial ones (PRD 15). */
  isFinal: boolean;
}
export interface SttSession {
  sessionId: string;
  sendAudio(chunk: Uint8Array): void;
  onTranscript(listener: (event: SttTranscriptEvent) => void): () => void;
  close(): Promise<void>;
}
export interface SpeechToTextProvider {
  startSession(config: SttSessionConfig): Promise<SttSession>;
}

export interface TtsInput {
  text: string;
  voice?: string;
  language?: string;
}
export interface TtsOutput {
  audio: Uint8Array;
  mimeType: string;
  durationMs?: number;
}
export interface TextToSpeechProvider {
  synthesize(input: TtsInput): Promise<TtsOutput>;
}

export interface ConversationTurnInput {
  /** The composed facilitator system prompt (server/companion/prompt-pack.ts). */
  system: string;
  promptVersion: string;
  maxOutputTokens?: number;
}
export interface ConversationTurnOutput {
  /** The next spoken utterance. Never contains internal scores. */
  utterance: string;
  model: string;
  finishReason: "stop" | "length" | "filtered" | "error";
}
export interface ConversationModelProvider {
  generateTurn(input: ConversationTurnInput): Promise<ConversationTurnOutput>;
}

export interface MeetingJoinTarget {
  meetingId: string;
  provider: string;
  joinUrl: string;
  startsAt?: string;
}
export interface MeetingProvider {
  getJoinTarget(meetingId: string): Promise<MeetingJoinTarget>;
}
