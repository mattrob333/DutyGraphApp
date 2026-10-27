/**
 * Demo data for the hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md §5), taken from
 * the Claude Design prototype (docs/design/companion-mobile/DutyGraph_Companion_2.dc.html, `HF_Q`).
 * Fictional: Noah Reed at Cobalt answers Alex Rivera's questions.
 *
 * The question texts are the prototype's, so `buildQuestions` gives the designed chips and nudges.
 * `scripts` are what the simulated microphone "hears" (src/features/voice/live): per question, per
 * attempt (the first answer, then after each "A bit more"), a list of sentences.
 */
import type { QuestionKey } from "@/types/handsfree";
import { INTERPRETATIONS, SCRIPTS } from "./scripts";

export type ScriptedAnswers = string[][][];

export interface MockQuestionRequest {
  requestId: string;
  title: string;
  /** Empty: screens say "your advisor". */
  advisorName: string;
  companyName: string;
  whyAsked: string[];
  questions: string[];
  /** "Here's what we heard" for the scripted answers, by question index. */
  polished: Record<number, string>;
  /** A suggestion for later, by question index (the prototype's `note`). */
  suggestions: Record<number, string>;
  scripts: ScriptedAnswers;
  /** Extra sentences a scripted answer may use (the prototype's Simulate "full" and "part"). */
  extra: Record<number, string[]>;
  /** Days from now to the due date; null = the coming Friday. */
  dueInDays: number | null;
  /** Today shows it under Later instead of Due now. */
  later: boolean;
}

export const HF_IDS = {
  cobalt: "req-hf-cobalt",
  cobaltRecords: "req-hf-cobalt-records",
  /** PR #48's north dock discovery request, now answered on the cards too. */
  northDock: "req-disc-north-dock",
} as const;

export const MOCK_ADVISOR = "Alex Rivera";
export const MOCK_HF_COMPANY = "Cobalt";

/** The prototype's "Why am I being asked this?" sheet for the hands-free cards (SHEETS.hfWhy). */
const COBALT_WHY = [
  "Cobalt is working with Alex Rivera to understand how work really moves between people and tools.",
  "Alex sends each person a few questions about their own work. There are no right or wrong answers.",
  "Your words are processed securely while you speak so DutyGraph can follow along. Nothing goes to Alex until you review it and tap Send.",
];
const discovery = SCRIPTS.DISCOVERY.turns;

/** The prototype's "Simulate full" words for the "Anything else?" card (HF_ELSE_SAY). */
export const ELSE_SAMPLE =
  "Only that Fridays are the busiest. About half the week's orders come in that day.";

export const MOCK_QUESTION_REQUESTS: MockQuestionRequest[] = [
  {
    requestId: HF_IDS.cobalt,
    title: "Questions about your work",
    advisorName: MOCK_ADVISOR,
    companyName: MOCK_HF_COMPANY,
    whyAsked: COBALT_WHY,
    questions: [
      "Walk me through how a new order reaches you.",
      "Which tools do you use for that, and for which step?",
      "Where does work usually wait or get stuck?",
      "What do you check or decide yourself before passing it on?",
      "Who do you go to when something is unclear?",
      "What would make this part of your week easier?",
    ],
    polished: {
      0: "Most orders arrive through the customer portal; a few still come by email. You check stock first and enter the order into the order system. Then it goes to the warehouse team, usually Priya.",
      1: "Outlook for emailed orders, the order system to enter each order, and one Excel sheet to track anything on hold.",
      2: "Orders wait when they need a credit check, because Finance must approve anything over the customer's limit. That usually takes one to two days.",
      3: "You check the delivery address and requested date, and you decide whether an order ships at once or is split when stock is short.",
      4: "For stock questions you ask Priya in the warehouse; for pricing you go to Sam in Finance.",
      5: "Portal orders going straight into the order system, without retyping. That would save you about an hour a day.",
    },
    suggestions: {
      2: "Small overages might be pre-approved, so fewer orders wait on Finance.",
    },
    scripts: [
      [
        [
          "Most orders come in through the customer portal, and a few still arrive by email.",
          "First I check stock and enter it into the order system.",
        ],
        ["Then it goes to the warehouse team. Usually Priya picks it up."],
      ],
      [
        [
          "Mostly the order system, plus Outlook and one Excel sheet.",
          "Outlook for the emailed orders, the order system for entry, and Excel to track anything on hold.",
        ],
      ],
      [
        [
          "Orders wait when they need a credit check.",
          "Finance has to approve anything over the customer limit.",
          "That can take a day, sometimes two.",
        ],
      ],
      [
        [
          "I check the delivery address and the requested date.",
          "And I decide whether it ships in one go or gets split when stock is short.",
        ],
      ],
      [["Hmm. I don't know yet, honestly. It changes week to week."]],
      [
        [
          "If portal orders went straight into the order system without me retyping them.",
          "That would save me about an hour a day.",
        ],
      ],
    ],
    extra: {
      4: [
        "For stock questions I ask Priya in the warehouse, and for pricing I go to Sam in Finance.",
        "For stock questions I usually ask Priya in the warehouse.",
      ],
    },
    dueInDays: null,
    later: false,
  },
  {
    requestId: HF_IDS.cobaltRecords,
    title: "Two follow-up questions",
    advisorName: MOCK_ADVISOR,
    companyName: MOCK_HF_COMPANY,
    whyAsked: COBALT_WHY,
    questions: [
      "How do you hand finished work to the next person, and how do they know it is ready?",
      "Which records must be kept, and who checks them?",
    ],
    polished: {
      0: "When an order is packed, you put it in the dispatch bay and mark it ready in the order system so the drivers see it.",
      1: "You keep a signed delivery note for every order, filed in a folder. Finance checks them at the end of each quarter.",
    },
    suggestions: {},
    scripts: [
      [
        [
          "When an order is packed I put it in the dispatch bay.",
          "Then I mark it ready in the order system so the drivers see it.",
        ],
      ],
      [
        [
          "We keep a signed delivery note for every order, filed in a folder.",
          "Finance checks them at the end of each quarter.",
        ],
      ],
    ],
    extra: {},
    dueInDays: 7,
    later: true,
  },
  {
    requestId: HF_IDS.northDock,
    title: "DutyGraph wants to understand your work",
    advisorName: "",
    companyName: "Northwind Logistics (fictional)",
    whyAsked: [
      "Operations is mapping how late inbound freight is really handled, so the written process can match what people actually do.",
      "Your words are processed securely while you speak so DutyGraph can follow along. Nothing goes to your advisor until you review it and tap Send.",
    ],
    questions: [discovery[0].agent, discovery[1].agent, discovery[3].agent],
    polished: Object.fromEntries(
      INTERPRETATIONS.DISCOVERY.map((c, i) => [i, c.proposedText]),
    ),
    suggestions: {},
    scripts: [
      [[discovery[0].sampleAnswer]],
      [[discovery[1].sampleAnswer], [discovery[2].sampleAnswer]],
      [[discovery[3].sampleAnswer]],
    ],
    extra: {},
    dueInDays: 2,
    later: true,
  },
];

export const mockQuestionRequest = (requestId: string) =>
  MOCK_QUESTION_REQUESTS.find((r) => r.requestId === requestId);

/** Scripted sentences for one request's question and attempt; [] when the script has none. */
export function scriptedSentences(
  requestId: string | undefined,
  questionIndex: number,
  attempt: number,
): string[] {
  if (requestId?.startsWith("pulse:"))
    return attempt > 0
      ? []
      : ([
          [
            "The carrier API is still blocked. I am waiting for Priya to confirm the credentials on Tuesday.",
          ],
          [
            "I now check the carrier portal every morning before I book pickups.",
          ],
          [
            "I will confirm the pickup window with the dock team by Tuesday afternoon.",
          ],
          ["There is nothing else to add today."],
        ][questionIndex] ?? []);
  const r = requestId
    ? mockQuestionRequest(requestId)
    : MOCK_QUESTION_REQUESTS[0];
  return r?.scripts[questionIndex]?.[attempt] ?? [];
}

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * The prototype's polished text only fits the scripted answer. When the person said or typed
 * something else, the mock gives back their own words, tidied, so the review never shows words
 * they did not say.
 */
export function mockUnderstood(
  r: MockQuestionRequest,
  key: QuestionKey,
  text: string,
): { understood: string; suggestion: string | null } {
  const index = Number(key.split(".")[1]);
  const polished = r.polished[index];
  const said = new Set(words(text));
  const candidates = [
    (r.scripts[index] ?? []).flat().join(" "),
    ...(r.extra[index] ?? []),
  ];
  const overlap = Math.max(
    0,
    ...candidates.map((c) => {
      const known = new Set(words(c));
      return known.size
        ? [...known].filter((w) => said.has(w)).length / known.size
        : 0;
    }),
  );
  if (polished && overlap >= 0.6)
    return { understood: polished, suggestion: r.suggestions[index] ?? null };
  const tidy = text.trim().replace(/\s+/g, " ");
  const capital = tidy.charAt(0).toUpperCase() + tidy.slice(1);
  return {
    understood: /[.!?]$/.test(capital) ? capital : `${capital}.`,
    suggestion: null,
  };
}

/** The coming Friday (today when it is Friday), as YYYY-MM-DD on the device clock. */
export function dueDateFor(r: MockQuestionRequest, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + (r.dueInDays ?? (5 - d.getDay() + 7) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
