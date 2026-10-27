import type {
  DiscoveryRequest,
  Id,
  InterpretationItem,
  NotificationPreferences,
  Participant,
  ParticipationRequest,
  TodayFeed,
  VoicePreferences,
} from "@/types/domain";
import { minutesFor } from "@shared/hands-free/hints";
import type { components } from "../generated/companion-mobile-v1";

type S = components["schemas"];
export type ProfileDto = S["ParticipantProfile"];
export type RequestSummaryDto = S["ParticipantRequestSummary"];
export type RequestDetailDto = S["ParticipantRequestDetail"];
export type ProposedTaskDto = S["ProposedParticipantTask"];
export type TaskCardDto = S["TaskCardView"];

export const NOT_STATED = "Not stated";

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  pulseReady: true,
  meetingChanges: true,
  commitmentsDue: true,
  quietHours: false,
};

export const DEFAULT_VOICE_PREFS: VoicePreferences = {
  voiceFirst: false,
  showTranscript: true,
  speakQuestions: true,
};

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function mapProfile(
  p: ProfileDto,
  prefs: {
    notificationPreferences: NotificationPreferences;
    voicePreferences: VoicePreferences;
  },
): Participant {
  const name = p.name.trim();
  return {
    id: p.personId,
    companyId: p.companyId,
    companyName: p.companyName,
    displayName: name,
    firstName: name.split(/\s+/)[0] || name,
    roleTitle: p.roleTitle?.trim() || undefined,
    timezone: localTimezone(),
    notificationPreferences: prefs.notificationPreferences,
    voicePreferences: prefs.voicePreferences,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO-8601 with the device's UTC offset, e.g. 2026-09-29T17:00:00-04:00. */
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** A due date (YYYY-MM-DD) means the end of that day on the participant's clock. */
export function endOfDayLocal(dueDate: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!m) return undefined;
  return toLocalIso(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59),
  );
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 2));
}

export function mapRequestToCard(
  r: RequestSummaryDto,
  nowIso: string,
): ParticipationRequest | null {
  if (r.type === "work") {
    // The web team page's figure, as the question cards' intro shows it.
    const minutes = minutesFor(r.questionCount);
    return {
      id: r.requestId,
      type: "DISCOVERY",
      title: `Answer ${plural(r.questionCount, "question", "questions")}`,
      summary: `${r.title} · about ${minutes} min`,
      reason:
        r.noticePreview?.trim() ||
        "Your advisor asked for your account of how this work is done.",
      estimatedMinutes: minutes,
      dueAt: endOfDayLocal(r.dueDate),
      status: "NOT_STARTED",
      cta: "Start",
      route: `/questions/${r.requestId}`,
      sourceEntityType: "DISCOVERY",
      sourceEntityId: r.requestId,
      createdAt: nowIso,
    };
  }
  if (r.type === "confirmation") {
    const n = r.taskCardIds?.length ?? 0;
    return {
      id: r.requestId,
      type: "CONFIRMATION",
      title: n > 0 ? `Check ${plural(n, "task card", "task cards")}` : r.title,
      summary:
        n > 0
          ? `${r.title} · about ${Math.max(1, n)} min`
          : "A short check of work written down about you",
      reason:
        r.noticePreview?.trim() ||
        "Your advisor wants to be sure these descriptions of your work are right.",
      estimatedMinutes: Math.max(1, n),
      dueAt: endOfDayLocal(r.dueDate),
      status: "NOT_STARTED",
      cta: "Review",
      route: `/confirmations/${r.requestId}`,
      sourceEntityType: "DISCOVERY",
      sourceEntityId: r.requestId,
      createdAt: nowIso,
    };
  }
  return null; // leadership requests stay on their web links
}

export interface DoneLogEntry {
  id: Id;
  title: string;
  completedAt: string;
}

export function mapToday(
  participant: Pick<Participant, "id" | "displayName" | "firstName">,
  requests: RequestSummaryDto[],
  doneLog: DoneLogEntry[],
  now: Date,
): TodayFeed {
  const asOf = toLocalIso(now);
  const dueNow: ParticipationRequest[] = [];
  const doneToday: TodayFeed["doneToday"] = [];
  const today = localDateKey(now);
  const sorted = [...requests].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  for (const r of sorted) {
    if (r.type === "leadership") continue;
    if (r.needsYou) {
      const card = mapRequestToCard(r, asOf);
      if (card) dueNow.push(card);
    } else if (r.state === "returned" || r.state === "accepted") {
      // The server sends no completion time. Only show what this device sent today.
      const logged = doneLog.find(
        (d) =>
          d.id === r.requestId &&
          localDateKey(new Date(d.completedAt)) === today,
      );
      if (logged)
        doneToday.push({
          id: r.requestId,
          title: logged.title,
          completedAt: logged.completedAt,
        });
    }
  }
  return { participant, asOf, dueNow, later: [], doneToday };
}

export function mapDiscovery(d: RequestDetailDto): DiscoveryRequest {
  const intro =
    d.noticePreview?.trim() ||
    (d.notice ? d.notice.trim().slice(0, 500) : "") ||
    "Your advisor would like to understand how this work really happens, in your words.";
  return {
    id: d.requestId,
    requestId: d.requestId,
    title: d.title,
    intro,
    questionCount: d.questions.length || d.questionCount,
    estimatedMinutes: estimateMinutes(d.questions.length || d.questionCount),
    dueAt: endOfDayLocal(d.dueDate),
    whyAsked: [
      "Your advisor asked for your account of how this work is done, so what is written down matches what people actually do.",
      "Your answers describe your own work. Nothing counts as your answer until you review it and choose to send.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Proposed tasks and words
// ---------------------------------------------------------------------------

const known = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t && t !== NOT_STATED ? t : "";
};
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function taskLabel(t: ProposedTaskDto, index: number): string {
  return known(t.title) || `Step ${index + 1}`;
}

/** A readable sentence from the card fields. Fields the answer did not state are named, not invented. */
export function taskSentence(t: ProposedTaskDto): string {
  const parts: string[] = [];
  const duty = known(t.duty) || known(t.title);
  if (duty) parts.push(stop(duty));
  if (known(t.trigger)) parts.push(stop(`It starts when ${known(t.trigger)}`));
  if (known(t.inputs)) parts.push(stop(`You use ${known(t.inputs)}`));
  if (known(t.instructions)) parts.push(stop(`How: ${known(t.instructions)}`));
  if (known(t.output)) parts.push(stop(`You produce ${known(t.output)}`));
  if (known(t.handoff)) parts.push(stop(`It goes to ${known(t.handoff)}`));
  if (known(t.software)) parts.push(stop(`Software: ${known(t.software)}`));
  if (known(t.humanGate))
    parts.push(stop(`A person checks: ${known(t.humanGate)}`));
  const missing = (t.missingFields ?? []).filter((f) => !known((t as any)[f]));
  if (missing.length) parts.push(`${NOT_STATED}: ${missing.join(", ")}.`);
  return parts.join(" ");
}

export function taskCardSentence(c: TaskCardDto): string {
  const d = c.data as Record<string, unknown>;
  const s = (k: string) =>
    typeof d[k] === "string" ? (d[k] as string).trim() : "";
  const parts: string[] = [];
  const duty = s("duty");
  parts.push(stop(duty && duty !== c.title ? `${c.title}: ${duty}` : c.title));
  if (s("output")) parts.push(stop(`Output: ${s("output")}`));
  const systems = Array.isArray(d.systems)
    ? (d.systems as unknown[]).filter((x) => typeof x === "string" && x)
    : [];
  if (systems.length) parts.push(stop(`Software: ${systems.join(", ")}`));
  return parts.join(" ");
}

export function proposedToItem(
  sessionId: Id,
  t: ProposedTaskDto,
  index: number,
  sourceUtteranceIds: Id[],
): InterpretationItem {
  return {
    id: `${sessionId}-task-${index}`,
    sessionId,
    category: "TASK",
    label: taskLabel(t, index),
    proposedText: taskSentence(t),
    status: "PENDING",
    sourceUtteranceIds,
    allowedActions: ["CONFIRM", "CHANGE", "REJECT"],
  };
}
