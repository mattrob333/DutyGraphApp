/**
 * Deterministic team question sets (D14, TEAM-01-01). An advisor with no AI
 * provider can still send each chosen person an editable set of questions
 * built from their role, department and recorded duties. AI, when configured,
 * only improves the wording. Nothing here reads or invents company facts.
 */
export type TemplatePerson = {
  name: string;
  role?: string;
  team?: string;
  duties?: string[];
};

export type TemplateContext = {
  companyName: string;
  /** Open questions the advisor wants routed to the right people. */
  gaps?: string[];
};

export type TeamQuestionSet = {
  title: string;
  questions: string[];
  emailSubject: string;
  emailBody: string;
};

export const MANUAL_TEAM_PLAN_PREFIX = "discovery-team:manual:";
export const MAX_TEAM_QUESTIONS = 8;
const LIMIT = 200;

/**
 * The time question every role template asks (journey step 7, October 14, 2026). It follows the walk-through, so
 * "this" is the work the person just described. The participant page shows it as a set of ranges, not a text box:
 * the answer is a structured value that needs no AI to read. Bound to `task.hours_per_week` for the Task Card the
 * ask is about, or carried to the Task Card drafted from the answer (server/fill/structured-hours.ts).
 */
export const HOURS_QUESTION = "About how many hours a week does this take?";

export type HoursPreset = { id: string; label: string; low: number; high: number };
/** The ranges a person picks from. "More than 20" stops at a full working week (40 h). "Not sure" is a skip. */
export const HOURS_PRESETS: readonly HoursPreset[] = [
  { id: "lt1", label: "Less than 1 hour", low: 0, high: 1 },
  { id: "1-2", label: "1–2 hours", low: 1, high: 2 },
  { id: "2-5", label: "2–5 hours", low: 2, high: 5 },
  { id: "5-10", label: "5–10 hours", low: 5, high: 10 },
  { id: "10-20", label: "10–20 hours", low: 10, high: 20 },
  { id: "20+", label: "More than 20 hours", low: 20, high: 40 },
];
export const HOURS_PRESET_IDS = HOURS_PRESETS.map((p) => p.id) as [string, ...string[]];

/** A question that asks for hours a week: this template's question, or the fill loop's per-Task-Card ask. */
export const isHoursQuestion = (text: string) => /\bhow many hours a week\b/i.test(String(text ?? ""));
export const hoursPreset = (id: unknown) => HOURS_PRESETS.find((p) => p.id === id) ?? null;
/** The words the answer keeps for a preset ("10–20 hours a week"), so the advisor and the text read the same. */
export const hoursAnswerText = (p: HoursPreset) => `${p.label} a week`;
/** The preset an answer's words name, or null (the person typed something else). */
export const hoursPresetOfAnswer = (text: unknown) => HOURS_PRESETS.find((p) => hoursAnswerText(p) === String(text ?? "").trim()) ?? null;

type Family = {
  id: string;
  match: RegExp;
  questions: string[];
};

/** Role families by keyword. Order matters: the first match wins. */
export const roleFamilies: Family[] = [
  {
    id: "leadership",
    match:
      /\b(ceo|coo|cfo|cto|chief|owner|founder|president|director|vp|vice president|head of|general manager|partner)\b/i,
    questions: [
      "Which decisions reach you, how often, and what do you need to make them?",
      "Which measures tell you the work is going well or badly?",
    ],
  },
  {
    id: "manager",
    match: /\b(manager|supervisor|lead|team lead|coordinator|foreman)\b/i,
    questions: [
      "How is work assigned to your team, and how do you know it is done?",
      "Which problems does your team bring to you, and what do you do with them?",
    ],
  },
  {
    id: "finance",
    match:
      /\b(finance|accounting|accountant|controller|bookkeep\w*|billing|invoice\w*|payable|receivable|ar|ap|payroll|credit|treasury)\b/i,
    questions: [
      "Which checks or approvals happen before money moves, and who gives them?",
      "Which systems, spreadsheets or reports do you use, and where does the data come from?",
    ],
  },
  {
    id: "operations",
    match:
      /\b(operations?|warehouse|logistics|shipping|receiving|dispatch|production|plant|fulfil\w*|inventory|purchasing|procurement|driver|technician|field)\b/i,
    questions: [
      "What has to be ready before you can start, and what happens when it is not?",
      "How do you hand finished work to the next person, and how do they know it is ready?",
    ],
  },
  {
    id: "customer",
    match:
      /\b(customer|client|service|support|success|sales|account|order desk|reception|front desk)\b/i,
    questions: [
      "What do customers most often ask for, and what do you need from others to answer?",
      "Where do customer requests get stuck, and who can unblock them?",
    ],
  },
  {
    id: "people",
    match: /\b(hr|human resources|people|recruit\w*|talent|training)\b/i,
    questions: [
      "Which requests come to you from other teams, and what information is usually missing?",
      "Which records must be kept, and who checks them?",
    ],
  },
  {
    id: "technology",
    match: /\b(it|developer|engineer\w*|systems?|data|analyst|admin\w*)\b/i,
    questions: [
      "Which systems do other people depend on you for, and how do requests reach you?",
      "What access or changes need someone else's approval?",
    ],
  },
];

export function roleFamily(person: TemplatePerson) {
  const text = `${person.role || ""} ${person.team || ""}`;
  return roleFamilies.find((family) => family.match.test(text))?.id || "general";
}

const clip = (text: string) =>
  text.length <= LIMIT ? text : text.slice(0, LIMIT - 1).trimEnd() + "…";

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4),
  );

/** A gap goes to a person only when it names their role or department. */
export function gapsForPerson(person: TemplatePerson, gaps: string[] = []) {
  const mine = words(`${person.role || ""} ${person.team || ""}`);
  if (!mine.size) return [];
  return gaps.filter((gap) => [...words(gap)].some((word) => mine.has(word)));
}

export function teamQuestionTemplate(
  person: TemplatePerson,
  context: TemplateContext,
): TeamQuestionSet {
  const role = (person.role || "").trim();
  const family = roleFamilies.find((f) => f.id === roleFamily(person));
  const questions = [
    role && role !== "Not yet provided"
      ? `What are you responsible for as ${role}, and what does a good week look like?`
      : "What are you responsible for, and what does a good week look like?",
    "Walk through one recent piece of work, from what started it to the finished result.",
    ...(person.duties || [])
      .filter((duty) => duty.trim())
      .slice(0, 2)
      .map(
        (duty) =>
          `How do you handle "${duty.trim()}"? What starts it, and what does done look like?`,
      ),
    ...(family?.questions || []),
    "Who gives you work, and who receives what you finish?",
    "Where does work wait, get sent back, or need a workaround?",
    "What can you decide yourself, and when do you need someone else?",
    ...gapsForPerson(person, context.gaps).slice(0, 2),
  ];
  const unique = [...new Set(questions.map((q) => clip(q.trim())))].filter(
    Boolean,
  );
  // The hours question always stays, right after the walk-through (question 2), so "this" is that work.
  const kept = unique.slice(0, MAX_TEAM_QUESTIONS - 1);
  return {
    title: clip(`How your work happens — ${person.name}`),
    questions: [...kept.slice(0, 2), HOURS_QUESTION, ...kept.slice(2)],
    emailSubject: clip(`${context.companyName}: tell us how your work happens`),
    // No greeting here: the email layout already opens with "Hello <name>." (DF-10).
    emailBody: [
      `As part of the operations review at ${context.companyName}, your advisor is asking a few people to describe their work in their own words. There are no right or wrong answers. A recent example is the most useful thing you can share.`,
      "Your answer goes to your advisor, who reviews it before anything is written up. It does not change your duties or give anyone permission to act.",
      "Thank you.",
    ].join("\n\n"),
  };
}

/** The default due date for team questions: ten days out, as a calendar date. */
export function defaultTeamDueDate(now = Date.now()) {
  return new Date(now + 10 * 86400000).toISOString().slice(0, 10);
}
