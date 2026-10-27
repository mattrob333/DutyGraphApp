/**
 * "Try to cover" chips for each question (docs/specs/COMPANION-HANDS-FREE.md §3). Hand-written,
 * deterministic, no AI: every question shared/team-question-templates.ts can produce has its own
 * short title and 1–3 hints; other questions (advisor-written gaps, edited wording) use keyword
 * rules and then a generic pair. Nudges are the only follow-up text a card ever shows.
 *
 * Keep this table in step with shared/team-question-templates.ts (tests/hands-free-hints.test.ts
 * fails when a template question has no entry).
 */
import type { HandsFreeQuestion, QuestionHint, QuestionKey } from "./types";

/** A hint before it gets its id (`h0`, `h1`, …, in order). */
type HintDraft = { label: string; nudge: string; cues: string[] };
type Entry = { short: string; hints: HintDraft[] };

export type HintSource = "table" | "pattern" | "keyword" | "generic";
export type QuestionHints = { short: string; hints: QuestionHint[]; source: HintSource };

/**
 * Hints an advisor stored on the request (`request.data.questionHints`), keyed like the answers.
 * `text` is the question the chips were written for: when the question's wording changes, the
 * stored chips no longer apply and the defaults come back (October 16).
 */
export type StoredQuestionHints = Partial<Record<QuestionKey, { text?: string; short?: string; hints: QuestionHint[] }>>;

export const MAX_HINTS = 3;
export const MAX_HINT_LABEL = 40;
const MAX_SHORT = 40;

/* ------------------------------------------------------------------ cue sets */

const WHO = ["@name", "ask", "go to", "goes to", "manager", "supervisor", "team lead", "my lead", "colleague", "boss", "owner", "someone in", "the team", "department", "finance", "sales", "warehouse", "customer service", "accounting", "dispatch"];
const HOW_LONG = ["minute*", "hour", "day", "week", "month", "overnight", "same day", "how long", "takes", "take", "a while", "ages", "quick", "right away", "straight away"];
const HOW_OFTEN = ["every", "daily", "weekly", "monthly", "each day", "each week", "times a", "once", "twice", "always", "usually", "often", "sometimes", "rarely", "most days"];
const TOOLS = ["system", "excel", "spreadsheet*", "sheet", "outlook", "email", "teams", "slack", "portal", "app", "software", "tool", "erp", "crm", "netsuite", "quickbooks", "sap", "paper", "whiteboard", "phone", "report", "dashboard", "database", "website"];
const WHY = ["because", "since", "has to", "have to", "had to", "so that", "reason", "due to", "waiting for", "waiting on", "until", "missing", "depends on"];
const STARTS = ["start", "starts", "kick off", "kicks off", "trigger", "comes in", "come in", "came in", "request", "asks", "asked", "email", "call", "ticket", "order", "when a", "when the", "when someone", "each time", "every time"];
const DONE = ["done", "finish", "finished", "complete", "completed", "closed", "close it", "signed off", "sign off", "approved", "delivered", "shipped", "sent", "filed", "result", "ends", "end up", "wrap up", "wrapped up", "nothing left"];
const NEXT_PERSON = ["goes to", "go to", "send it", "sent to", "pass it", "passes it", "hand it", "hand off", "hands off", "handed", "picks it up", "pick it up", "takes over", "after me", "next person", "forward", "share it", "drop it"];
const DECIDE = ["decide", "decision", "choose", "my call", "up to me", "on my own", "myself", "i can", "without asking", "whether", "i approve", "sign off"];
const NEED_OTHERS = ["need", "ask", "check with", "approval", "approve", "sign off", "manager", "boss", "escalate", "above", "over", "more than", "anything over", "go to", "someone else"];
const PROBLEMS = ["problem", "issue", "wrong", "error", "mistake", "late", "missing", "broken", "complaint", "stuck", "conflict", "question", "short", "fail"];
const EXAMPLE = ["last week", "last month", "yesterday", "last time", "recently", "for example", "for instance", "the other day", "this week", "this morning", "one time", "monday", "tuesday", "wednesday", "thursday", "friday", "an order", "a customer", "one customer"];
const STEPS = ["first", "then", "next", "after that", "after", "finally", "once", "start by", "step"];
const WAIT = ["wait", "stuck", "sit", "sits", "held", "hold", "queue", "backlog", "pile up", "piles up", "blocked", "pending", "delay", "slow", "behind"];
const SENT_BACK = ["sent back", "send back", "back to", "bounce", "bounced", "rejected", "reject", "redo", "rework", "again", "fix", "correct", "returned", "kicked back"];
const WORKAROUND = ["workaround", "work around", "instead", "manually", "by hand", "spreadsheet*", "excel", "side", "my own", "trick", "just", "call", "chase", "walk over"];
const RECORDS = ["record", "file", "files", "folder", "log", "logs", "form", "forms", "contract", "certificate*", "license*", "timesheet*", "document*", "copy", "copies", "keep", "store", "archive", "paperwork", "minutes"];
const CHECKED_BY = ["@name", "audit*", "check", "checks", "review", "reviews", "manager", "finance", "hr", "compliance", "inspector", "auditor", "nobody", "no one", "every year", "each year", "quarter*"];
const MISSING = ["missing", "without", "forget", "forgot", "never", "no one", "nobody", "incomplete", "wrong", "not there", "chase", "dont have", "dont send", "dont tell", "detail", "details", "information", "number", "date", "name"];
const ACCESS = ["access", "permission", "password", "login", "account", "admin", "rights", "role", "change", "changes", "install", "new user", "firewall", "production", "settings", "data"];
const APPROVER = ["@name", "manager", "boss", "director", "approve", "approves", "approval", "sign off", "signs off", "security", "it team", "the it", "head of", "owner", "cto", "cio", "finance"];

/* ------------------------------------------------------------ the hint table */

/**
 * Every fixed question text, exactly as written in shared/team-question-templates.ts or the
 * prototype's demo set (docs/design/companion-mobile, `HF_Q`). Looked up by normalized text.
 */
const TABLE: Record<string, Entry> = {
  /* The prototype's six Cobalt questions: shorts, chips and nudges exactly as designed. */
  "Walk me through how a new order reaches you.": {
    short: "How a new order reaches you",
    hints: [
      { label: "Where it comes from", nudge: "…and where does it usually come from?", cues: ["come in", "comes in", "comes from", "come from", "arrive", "portal", "email", "phone", "fax", "website", "web shop", "edi", "sent to me", "from the customer", "from customers"] },
      { label: "What you do first", nudge: "…and what do you do with it first?", cues: ["first", "start by", "check", "enter", "log it", "look at", "open it", "review", "key it"] },
      { label: "Who gets it next", nudge: "…and who picks it up after you?", cues: ["goes to", "go to", "send it to", "pass it", "passes it", "hand it", "hand off", "picks it up", "pick it up", "takes over", "after me", "next person", "forward", "handed"] },
    ],
  },
  "Which tools do you use for that, and for which step?": {
    short: "Your tools",
    hints: [
      { label: "The tools", nudge: "…which tools are they?", cues: TOOLS },
      { label: "Which step each one is for", nudge: "…and which step is each one for?", cues: ["for the", "for entry", "for each", "to track", "to enter", "to check", "to send", "to keep", "used for", "use it for", "use that for", "for that step", "when i"] },
    ],
  },
  "Where does work usually wait or get stuck?": {
    short: "Where work waits",
    hints: [
      { label: "Where it waits", nudge: "…where does it usually wait?", cues: WAIT },
      { label: "Why", nudge: "…and why does it wait there?", cues: WHY },
      { label: "How long", nudge: "…and roughly how long does it sit?", cues: HOW_LONG },
    ],
  },
  "What do you check or decide yourself before passing it on?": {
    short: "What you check and decide",
    hints: [
      { label: "What you check", nudge: "…what do you check?", cues: ["check", "look at", "make sure", "verify", "confirm", "review", "double check"] },
      { label: "What you decide", nudge: "…and is there anything you decide yourself?", cues: ["decide", "decision", "choose", "my call", "up to me", "whether", "i approve", "i pick"] },
    ],
  },
  "Who do you go to when something is unclear?": {
    short: "Who you go to",
    hints: [
      { label: "Who", nudge: "…who do you usually ask?", cues: WHO },
      { label: "For what kind of problem", nudge: "…and for what kind of problem?", cues: ["question", "problem", "issue", "pricing", "price", "stock", "about", "when something", "if something", "whenever", "anything to do with"] },
    ],
  },
  "What would make this part of your week easier?": {
    short: "What would make it easier",
    hints: [
      { label: "The change", nudge: "…what would you change?", cues: ["if", "would", "wish", "could", "change", "instead", "automatic*", "straight into", "without", "stop", "fix", "better", "no more", "one place"] },
      { label: "What it would save", nudge: "…and what would that save you?", cues: ["save", "saves", "time", "hour", "minute*", "faster", "quicker", "fewer", "mistake", "error", "less", "free up"] },
    ],
  },

  /* shared/team-question-templates.ts: the fixed questions every person gets. */
  "What are you responsible for, and what does a good week look like?": {
    short: "Your role",
    hints: [
      { label: "What you're responsible for", nudge: "…and what are you responsible for?", cues: ["responsible", "in charge", "my job", "i own", "i look after", "i handle", "i run", "i manage", "take care of", "i make sure", "my role", "i do the", "i deal with"] },
      { label: "What a good week looks like", nudge: "…and what does a good week look like?", cues: ["good week", "great week", "smooth", "on time", "no surprises", "caught up", "nothing", "everything", "all done", "hit", "quiet", "no fires", "goes out", "out the door"] },
    ],
  },
  "Walk through one recent piece of work, from what started it to the finished result.": {
    short: "A recent piece of work",
    hints: [
      { label: "What started it", nudge: "…what started it?", cues: [...STARTS, "last week", "yesterday", "recently", "the other day"] },
      { label: "What you did", nudge: "…and what did you do?", cues: ["i did", "i checked", "i called", "i sent", "i made", "i set up", "i wrote", "i fixed", "i put", "i built", "i talked", "then i", "so i", "first i"] },
      { label: "How it finished", nudge: "…and how did it finish?", cues: DONE },
    ],
  },
  "Who gives you work, and who receives what you finish?": {
    short: "Who you work with",
    hints: [
      { label: "Who gives you work", nudge: "…who usually gives you work?", cues: ["gives me", "give me", "get it from", "comes from", "sends me", "send me", "assigns", "assigned", "asks me", "from my", "from the", "@name"] },
      { label: "Who gets what you finish", nudge: "…and who gets what you finish?", cues: NEXT_PERSON },
    ],
  },
  "Where does work wait, get sent back, or need a workaround?": {
    short: "Where work waits",
    hints: [
      { label: "Where it waits", nudge: "…where does it usually wait?", cues: WAIT },
      { label: "What gets sent back", nudge: "…and what gets sent back?", cues: SENT_BACK },
      { label: "The workaround", nudge: "…and how do you work around it?", cues: WORKAROUND },
    ],
  },
  "What can you decide yourself, and when do you need someone else?": {
    short: "What you decide",
    hints: [
      { label: "What you decide yourself", nudge: "…what can you decide on your own?", cues: DECIDE },
      { label: "When you need someone else", nudge: "…and when do you need someone else?", cues: NEED_OTHERS },
    ],
  },
  // HOURS_QUESTION (shared/team-question-templates.ts), placed third in a template's question set.
  "About how many hours a week does this take?": {
    short: "Hours a week",
    hints: [
      { label: "About how many hours", nudge: "…about how many hours in a usual week?", cues: ["hour", "hours", "minutes", "a day", "a week", "per week", "half", "full time", "most of", "part of"] },
      { label: "When it takes longer", nudge: "…and when does it take longer?", cues: ["month end", "month-end", "quarter", "busy", "peak", "season", "more", "longer", "depends", "varies", "spike"] },
    ],
  },

  /* Role families (roleFamilies in shared/team-question-templates.ts). */
  // leadership
  "Which decisions reach you, how often, and what do you need to make them?": {
    short: "Decisions that reach you",
    hints: [
      { label: "Which decisions", nudge: "…which decisions reach you?", cues: ["decide", "decision", "approve", "approval", "sign off", "hiring", "pricing", "budget", "spend", "contract", "exception", "whether"] },
      { label: "How often", nudge: "…and how often do they come?", cues: HOW_OFTEN },
      { label: "What you need to decide", nudge: "…and what do you need to make them?", cues: ["need", "numbers", "report", "data", "summary", "options", "the facts", "recommendation", "cost", "context", "background", "from"] },
    ],
  },
  "Which measures tell you the work is going well or badly?": {
    short: "How you know it's going well",
    hints: [
      { label: "The measures you watch", nudge: "…which numbers or signs do you watch?", cues: ["number", "numbers", "measure", "metric", "kpi", "margin", "revenue", "cash", "on time", "late", "backlog", "complaint", "churn", "report", "dashboard", "percent", "rate", "count"] },
      { label: "What going badly looks like", nudge: "…and what tells you it's going badly?", cues: ["badly", "bad", "wrong", "worse", "drop", "drops", "slip", "slips", "late", "behind", "complaint", "miss", "missed", "red flag", "warning", "when"] },
    ],
  },
  // manager
  "How is work assigned to your team, and how do you know it is done?": {
    short: "Assigning work",
    hints: [
      { label: "How work is assigned", nudge: "…how is work assigned?", cues: ["assign", "assigned", "give it", "hand out", "split", "board", "list", "schedule", "rota", "roster", "ticket", "morning", "meeting", "standup", "whoever", "i tell"] },
      { label: "How you know it's done", nudge: "…and how do you know it is done?", cues: [...DONE, "tell me", "let me know", "mark", "marked", "tick", "update", "check"] },
    ],
  },
  "Which problems does your team bring to you, and what do you do with them?": {
    short: "Problems your team brings",
    hints: [
      { label: "The problems", nudge: "…which problems come to you?", cues: PROBLEMS },
      { label: "What you do with them", nudge: "…and what do you do with them?", cues: ["i fix", "i sort", "i call", "i talk", "i decide", "i escalate", "escalate", "i ask", "i check", "i send", "i handle", "i deal", "pass it", "sort it", "fix it", "take it to"] },
    ],
  },
  // finance
  "Which checks or approvals happen before money moves, and who gives them?": {
    short: "Checks before money moves",
    hints: [
      { label: "The checks or approvals", nudge: "…which checks or approvals happen?", cues: ["check", "approve", "approval", "sign off", "match", "three way", "po", "purchase order", "invoice", "review", "verify", "limit", "budget", "receipt"] },
      { label: "Who gives them", nudge: "…and who gives them?", cues: [...WHO, "controller", "cfo", "director", "owner", "i do", "i approve"] },
    ],
  },
  "Which systems, spreadsheets or reports do you use, and where does the data come from?": {
    short: "Your systems and reports",
    hints: [
      { label: "The systems or reports", nudge: "…which systems or reports do you use?", cues: TOOLS },
      { label: "Where the data comes from", nudge: "…and where does the data come from?", cues: ["comes from", "come from", "pull", "pulls", "export", "exported", "import", "download", "bank", "feed", "entered", "typed in", "sends me", "from the", "out of"] },
    ],
  },
  // operations
  "What has to be ready before you can start, and what happens when it is not?": {
    short: "What has to be ready",
    hints: [
      { label: "What has to be ready", nudge: "…what has to be ready first?", cues: ["ready", "need", "parts", "material*", "stock", "paperwork", "order", "schedule", "truck", "approval", "drawing", "the job", "in place", "before"] },
      { label: "What happens when it isn't", nudge: "…and what happens when it isn't ready?", cues: ["wait", "if not", "when it isnt", "isnt", "not ready", "missing", "late", "call", "chase", "stop", "stuck", "delay", "skip", "move on", "something else", "instead"] },
    ],
  },
  "How do you hand finished work to the next person, and how do they know it is ready?": {
    short: "Handing work on",
    hints: [
      { label: "How you hand it on", nudge: "…how do you hand it on?", cues: [...NEXT_PERSON, "put it", "leave it", "drop off", "shelf", "bay", "dock", "system", "email", "message"] },
      { label: "How they know it's ready", nudge: "…and how do they know it is ready?", cues: ["tell them", "let them know", "message", "text", "call", "email", "status", "mark", "marked", "tag", "label", "sign", "board", "they see", "notification", "update"] },
    ],
  },
  // customer
  "What do customers most often ask for, and what do you need from others to answer?": {
    short: "What customers ask for",
    hints: [
      { label: "What they ask for", nudge: "…what do customers ask for most?", cues: ["ask", "asks", "want", "wants", "status", "where", "price", "pricing", "quote", "delivery", "refund", "return", "change", "order", "invoice", "help"] },
      { label: "What you need from others", nudge: "…and what do you need from others to answer?", cues: ["need", "from", "check with", "ask", "warehouse", "finance", "sales", "dispatch", "approval", "confirm", "wait for"] },
    ],
  },
  "Where do customer requests get stuck, and who can unblock them?": {
    short: "Where requests get stuck",
    hints: [
      { label: "Where they get stuck", nudge: "…where do requests get stuck?", cues: [...WAIT, "approval", "credit", "back order", "out of stock", "waiting"] },
      { label: "Who can unblock them", nudge: "…and who can unblock them?", cues: [...WHO, "approve", "unblock", "sort it", "release"] },
    ],
  },
  // people
  "Which requests come to you from other teams, and what information is usually missing?": {
    short: "Requests from other teams",
    hints: [
      { label: "The requests", nudge: "…which requests come to you?", cues: ["request", "ask", "asks", "hire", "hiring", "new starter", "leaver", "leave", "holiday", "payroll", "contract", "training", "letter", "change", "vacancy", "job"] },
      { label: "What's usually missing", nudge: "…and what information is usually missing?", cues: MISSING },
    ],
  },
  "Which records must be kept, and who checks them?": {
    short: "Records you keep",
    hints: [
      { label: "The records", nudge: "…which records must be kept?", cues: RECORDS },
      { label: "Who checks them", nudge: "…and who checks them?", cues: CHECKED_BY },
    ],
  },
  // technology
  "Which systems do other people depend on you for, and how do requests reach you?": {
    short: "Systems people rely on",
    hints: [
      { label: "The systems", nudge: "…which systems do people depend on you for?", cues: [...TOOLS, "server", "network", "laptop*", "printer*", "wifi", "account", "integration"] },
      { label: "How requests reach you", nudge: "…and how do requests reach you?", cues: ["ticket", "email", "teams", "slack", "message", "call", "phone", "walk up", "desk", "helpdesk", "help desk", "form", "portal", "chat", "text"] },
    ],
  },
  "What access or changes need someone else's approval?": {
    short: "What needs approval",
    hints: [
      { label: "What needs approval", nudge: "…what needs someone else's approval?", cues: ACCESS },
      { label: "Who approves it", nudge: "…and who approves it?", cues: APPROVER },
    ],
  },
};

/* ----------------------------------------------------------- pattern rules */

const ROLE_QUESTION = /^what are you responsible for as (.+), and what does a good week look like\?$/i;
// Duty questions are clipped at 200 characters by the template, so only the start is reliable.
const DUTY_QUESTION = /^how do you handle "(.+?)("|…|$)/i;

function patternEntry(text: string): Entry | null {
  if (ROLE_QUESTION.test(text)) return lookup("What are you responsible for, and what does a good week look like?");
  const duty = DUTY_QUESTION.exec(text);
  if (duty) {
    const name = duty[1].trim();
    return {
      short: clip(capitalise(name), MAX_SHORT),
      hints: [
        { label: "What starts it", nudge: "…what starts it?", cues: STARTS },
        { label: "How you handle it", nudge: "…and how do you handle it?", cues: [...STEPS, "i check", "i call", "i send", "i enter", "i make", "i update", "i do"] },
        { label: "What done looks like", nudge: "…and what does done look like?", cues: DONE },
      ],
    };
  }
  return null;
}

/* ----------------------------------------------------------- keyword rules */

type KeywordRule = { match: RegExp; hint: HintDraft };

/** For questions nobody wrote hints for. Order matters: the first three that match are used. */
const KEYWORD_RULES: KeywordRule[] = [
  { match: /\bwho\b|\bwhom\b/i, hint: { label: "Who", nudge: "…and who is that?", cues: WHO } },
  { match: /\bhow long\b|\bhow quickly\b|\bhow fast\b/i, hint: { label: "How long", nudge: "…and roughly how long does it take?", cues: HOW_LONG } },
  { match: /\bhow often\b|\bfrequen/i, hint: { label: "How often", nudge: "…and how often does it happen?", cues: HOW_OFTEN } },
  { match: /\btools?\b|\bsystems?\b|\bsoftware\b|\bspreadsheets?\b|\breports?\b|\bapps?\b/i, hint: { label: "The tools", nudge: "…which tools do you use?", cues: TOOLS } },
  { match: /\bdecid|\bdecision|\bapprov/i, hint: { label: "Who decides", nudge: "…and who decides?", cues: [...DECIDE, ...APPROVER] } },
  { match: /\bwait|\bstuck\b|\bdelay|\bblock|\bbottleneck|\bslow/i, hint: { label: "Where it waits", nudge: "…where does it usually wait?", cues: WAIT } },
  { match: /\bwhy\b|\breason/i, hint: { label: "Why", nudge: "…and why is that?", cues: WHY } },
  { match: /\bproblem|\bissue|\bwrong\b|\berror|\bmistake|\bfail/i, hint: { label: "What goes wrong", nudge: "…what usually goes wrong?", cues: PROBLEMS } },
  { match: /\bstart|\btrigger|\bbegin|\bkick/i, hint: { label: "What starts it", nudge: "…what starts it?", cues: STARTS } },
  { match: /\bdone\b|\bfinish|\bcomplet|\bresult/i, hint: { label: "What done looks like", nudge: "…and what does done look like?", cues: DONE } },
  { match: /\bhand\b|\bhand off|\bhandoff|\bnext person|\bpass/i, hint: { label: "Who gets it next", nudge: "…and who gets it next?", cues: NEXT_PERSON } },
  { match: /\brecord|\bwritten\b|\bdocument|\bsop\b|\bprocess\b/i, hint: { label: "Where it's written down", nudge: "…and is it written down anywhere?", cues: ["written", "write", "document*", "sop", "wiki", "notes", "checklist", "manual", "binder", "shared drive", "in my head", "nowhere", "folder", "file"] } },
  { match: /\bcustomer|\bclient/i, hint: { label: "What customers need", nudge: "…and what do customers need from it?", cues: ["customer", "client", "they want", "they need", "ask", "asks", "order", "delivery", "quote", "price"] } },
  { match: /\bwalk (me )?through|\bsteps?\b|\bhow do you\b/i, hint: { label: "The steps", nudge: "…and what happens after that?", cues: STEPS } },
];

const GENERIC: HintDraft[] = [
  { label: "What happens", nudge: "…what usually happens?", cues: ["usually", "normally", "typically", "then", "first", "happens", "every", "always", "most of the time"] },
  { label: "A recent example", nudge: "…can you give a recent example?", cues: EXAMPLE },
];

/* ------------------------------------------------------------------ helpers */

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const TABLE_BY_TEXT = new Map(Object.entries(TABLE).map(([q, e]) => [normalize(q), e]));
const lookup = (text: string) => TABLE_BY_TEXT.get(normalize(text)) || null;

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "") + "…";
}

const capitalise = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function withIds(drafts: HintDraft[]): QuestionHint[] {
  return drafts.slice(0, MAX_HINTS).map((d, i) => ({ id: `h${i}`, label: clip(d.label, MAX_HINT_LABEL), nudge: d.nudge, cues: [...d.cues] }));
}

/** A short title for a question nobody wrote one for: the question itself, trimmed. */
function shortFromText(text: string) {
  const plain = text.trim().replace(/[?.!]+$/, "");
  return clip(capitalise(plain), MAX_SHORT);
}

/* ------------------------------------------------------------------- public */

/** The short title and hints for one question. Deterministic; no AI. */
export function hintsForQuestion(text: string): QuestionHints {
  const exact = lookup(text);
  if (exact) return { short: exact.short, hints: withIds(exact.hints), source: "table" };
  const pattern = patternEntry(text.trim());
  if (pattern) return { short: pattern.short, hints: withIds(pattern.hints), source: "pattern" };
  const matched = KEYWORD_RULES.filter((r) => r.match.test(text)).map((r) => r.hint);
  if (matched.length) {
    const drafts = matched.slice(0, MAX_HINTS);
    // One keyword alone is a thin card; a recent example is always a good second chip.
    if (drafts.length === 1) drafts.push(GENERIC[1]);
    return { short: shortFromText(text), hints: withIds(drafts), source: "keyword" };
  }
  return { short: shortFromText(text), hints: withIds(GENERIC), source: "generic" };
}

/** Stored hints are advisor-written: keep them only when they are well formed, and trim to the limits. */
function cleanStored(stored: { text?: string; short?: string; hints: QuestionHint[] } | undefined, question: string): { short?: string; hints: QuestionHint[] } | null {
  if (!stored || !Array.isArray(stored.hints)) return null;
  // Written for other wording: the question changed since, so its own defaults apply.
  if (typeof stored.text === "string" && normalize(stored.text) !== normalize(question)) return null;
  const hints = stored.hints
    .filter((h) => h && typeof h.label === "string" && h.label.trim() && typeof h.nudge === "string" && Array.isArray(h.cues))
    .slice(0, MAX_HINTS)
    .map((h, i) => ({
      id: typeof h.id === "string" && h.id.trim() ? h.id.trim() : `h${i}`,
      label: clip(h.label.trim(), MAX_HINT_LABEL),
      nudge: h.nudge.trim(),
      cues: h.cues.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toLowerCase()),
    }));
  if (!hints.length) return null;
  return { short: typeof stored.short === "string" && stored.short.trim() ? clip(stored.short.trim(), MAX_SHORT) : undefined, hints };
}

/** "Anything else Alex should know about your work?"; "your advisor" when there is no name. */
export function elseQuestionText(advisorName?: string | null) {
  const first = (advisorName || "").trim().split(/\s+/)[0];
  return `Anything else ${first || "your advisor"} should know about your work?`;
}

/**
 * The deck's cards for one request: the advisor's questions with keys `question.0`, `question.1`, …
 * (the web page's keys), stored hints first, then this table, then the "Anything else?" card last.
 */
export function buildQuestions(
  questions: readonly string[],
  opts: { advisorName?: string | null; stored?: StoredQuestionHints | null } = {},
): HandsFreeQuestion[] {
  const cards: HandsFreeQuestion[] = questions.map((text, index) => {
    const key = `question.${index}` as QuestionKey;
    const own = hintsForQuestion(text);
    const stored = cleanStored(opts.stored?.[key], text);
    return { key, index, text, short: stored?.short || own.short, hints: stored ? stored.hints : own.hints };
  });
  const n = questions.length;
  cards.push({ key: `question.${n}` as QuestionKey, index: n, text: elseQuestionText(opts.advisorName), short: "Anything else", hints: [], isElse: true });
  return cards;
}

/**
 * "About N minutes" for N questions on the hands-free cards: about 30 seconds a question, rounded
 * up, at least 1 (Matt, October 10: "about 3 minutes" for 6 questions). Talking through a card takes
 * well under a minute; the web page's form estimate (flow-model's minutesFor) assumes typing.
 */
export function minutesFor(count: number) {
  return Math.max(1, Math.ceil(count / 2));
}

/* --------------------------------------------------------- advisor chips */

const LABEL_STOP = new Set(["the", "and", "you", "your", "what", "when", "where", "which", "with", "that", "this", "from", "they", "them", "does", "how", "who", "for", "are", "into", "about", "their", "there", "have", "been"]);

/**
 * A "Try to cover" chip an advisor wrote: the label as written, a nudge made from it, and cues from
 * its own words plus the keyword rules it matches (so "Who signs off" also listens for names and
 * managers). Deterministic; no AI.
 */
export function advisorHint(label: string, index: number): QuestionHint {
  const text = clip(label.trim().replace(/\s+/g, " "), MAX_HINT_LABEL);
  const own = normalize(text)
    .replace(/[^a-z0-9']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !LABEL_STOP.has(w));
  const ruled = KEYWORD_RULES.filter((r) => r.match.test(text)).flatMap((r) => r.hint.cues);
  const cues = [...new Set([...own, ...ruled])].slice(0, 60);
  const lower = text.charAt(0).toLowerCase() + text.slice(1);
  return { id: `a${index}`, label: text, nudge: `…and ${lower.replace(/[?.!…]+$/, "")}?`, cues: cues.length ? cues : [normalize(text)] };
}

/**
 * The composer's chips (one entry per question: the advisor's labels, or null for the defaults) as
 * `request.data.questionHints`, each with the question it was written for. Undefined when every
 * question uses its defaults.
 */
export function questionHintsFromChips(questions: readonly string[], chips: readonly (readonly string[] | null | undefined)[]): StoredQuestionHints | undefined {
  const out: StoredQuestionHints = {};
  questions.forEach((text, i) => {
    const labels = (chips[i] || []).map((l) => l.trim()).filter(Boolean).slice(0, MAX_HINTS);
    if (!chips[i] || !labels.length) return;
    // A suggested chip the advisor kept as it was keeps its hand-written cues and nudge.
    const suggested = hintsForQuestion(text).hints;
    const hints = labels.map((label, j) => {
      const same = suggested.find((h) => normalize(h.label) === normalize(label));
      return same ? { ...same, id: `a${j}`, cues: [...same.cues] } : advisorHint(label, j);
    });
    out[`question.${i}` as QuestionKey] = { text: text.trim(), hints };
  });
  return Object.keys(out).length ? out : undefined;
}

/** The other way: the advisor's chip labels per question, null where the defaults apply (none stored, or the wording changed). */
export function chipsFromStored(questions: readonly string[], stored: StoredQuestionHints | null | undefined): (string[] | null)[] {
  return questions.map((text, i) => {
    const entry = cleanStored(stored?.[`question.${i}` as QuestionKey], text);
    return entry ? entry.hints.map((h) => h.label) : null;
  });
}
