/**
 * The prototype's demo set (docs/design/companion-mobile/DutyGraph_Companion_2.dc.html, `HF_Q`),
 * copied for the hands-free tests: questions, chips, nudges and the scripted utterances with the
 * chip each sentence covers. Fictional data only (Cobalt, Noah Reed, Alex Rivera).
 */
export type ScriptedSentence = [text: string, chip: number | null, skip?: "dontknow"];

export const HF_Q: {
  short: string;
  q: string;
  chips: string[];
  nudges: string[];
  /** Attempts; each a list of sentences. */
  utt: ScriptedSentence[][];
  full?: string;
}[] = [
  {
    short: "How a new order reaches you",
    q: "Walk me through how a new order reaches you.",
    chips: ["Where it comes from", "What you do first", "Who gets it next"],
    nudges: ["…and where does it usually come from?", "…and what do you do with it first?", "…and who picks it up after you?"],
    utt: [
      [
        ["Most orders come in through the customer portal, and a few still arrive by email.", 0],
        ["First I check stock and enter it into the order system.", 1],
      ],
      [["Then it goes to the warehouse team. Usually Priya picks it up.", 2]],
    ],
  },
  {
    short: "Your tools",
    q: "Which tools do you use for that, and for which step?",
    chips: ["The tools", "Which step each one is for"],
    nudges: ["…which tools are they?", "…and which step is each one for?"],
    utt: [
      [
        ["Mostly the order system, plus Outlook and one Excel sheet.", 0],
        ["Outlook for the emailed orders, the order system for entry, and Excel to track anything on hold.", 1],
      ],
    ],
  },
  {
    short: "Where work waits",
    q: "Where does work usually wait or get stuck?",
    chips: ["Where it waits", "Why", "How long"],
    nudges: ["…where does it usually wait?", "…and why does it wait there?", "…and roughly how long does it sit?"],
    utt: [
      [
        ["Orders wait when they need a credit check.", 0],
        ["Finance has to approve anything over the customer limit.", 1],
        ["That can take a day, sometimes two.", 2],
      ],
    ],
  },
  {
    short: "What you check and decide",
    q: "What do you check or decide yourself before passing it on?",
    chips: ["What you check", "What you decide"],
    nudges: ["…what do you check?", "…and is there anything you decide yourself?"],
    utt: [
      [
        ["I check the delivery address and the requested date.", 0],
        ["And I decide whether it ships in one go or gets split when stock is short.", 1],
      ],
    ],
  },
  {
    short: "Who you go to",
    q: "Who do you go to when something is unclear?",
    chips: ["Who", "For what kind of problem"],
    nudges: ["…who do you usually ask?", "…and for what kind of problem?"],
    utt: [[["Hmm. I don't know yet, honestly. It changes week to week.", null, "dontknow"]]],
    full: "For stock questions I ask Priya in the warehouse, and for pricing I go to Sam in Finance.",
  },
  {
    short: "What would make it easier",
    q: "What would make this part of your week easier?",
    chips: ["The change", "What it would save"],
    nudges: ["…what would you change?", "…and what would that save you?"],
    utt: [
      [
        ["If portal orders went straight into the order system without me retyping them.", 0],
        ["That would save me about an hour a day.", 1],
      ],
    ],
  },
];

export const HF_ELSE_SAY = "Only that Fridays are the busiest. About half the week's orders come in that day.";
export const ADVISOR = "Alex Rivera";
