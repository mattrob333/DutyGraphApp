/**
 * Fictional conversation scripts and interpretations, ported from the Claude
 * Design prototype. The mock engine plays these back but also demonstrates
 * a dynamic follow-up: if an answer is very short and the script has no
 * follow-up planned, it asks one clarifying question before moving on
 * (the server's facilitator + Jev decide this in production).
 */
import type { ConversationMode, InterpretationItem, ReviewCopy } from '@/types/domain';

export interface ScriptTurn {
  /** 1-based topic index for "Question n of N". */
  q: number;
  agent: string;
  follow?: boolean;
  /** Sample answer used by the mock voice recorder's simulated transcript. */
  sampleAnswer: string;
  ack?: string;
}

export interface ConversationScript {
  title: string;
  total: number;
  opening: string;
  turns: ScriptTurn[];
}

export const SCRIPTS: Record<Exclude<ConversationMode, 'CONFIRMATION' | 'MEETING_WRAP_UP'>, ConversationScript> = {
  PULSE: {
    title: 'Monday Operations Pulse',
    total: 4,
    opening:
      "I'll ask a few questions based on your current work. Answer naturally — I'll only follow up when something needs clarifying.",
    turns: [
      {
        q: 1,
        agent: 'Last Monday you committed to sending the revised dock schedule to Jesse. Did that happen?',
        sampleAnswer: "Yes, I sent it Wednesday and he's already using it for the late-shift bays.",
        ack: "Got it. I'll mark that commitment complete.",
      },
      {
        q: 2,
        agent: 'You said the carrier API was blocking the NetSuite rollout. Is that still unresolved?',
        sampleAnswer: "Sort of. Finance signed off Thursday, so that part is done. Now we're stuck on production credentials.",
      },
      {
        q: 2,
        follow: true,
        agent: 'What exactly are you waiting on, and who owns getting it to you?',
        sampleAnswer: 'The production API credentials. Samir in IT owns that, he said maybe Wednesday.',
      },
      {
        q: 2,
        follow: true,
        agent: "Does that change Friday's migration date?",
        sampleAnswer: "Probably by a day, if Samir's Wednesday estimate holds.",
        ack: "Understood. I'll flag that the date may move.",
      },
      {
        q: 3,
        agent: 'Anything new on the inbound freight delays you raised two weeks ago?',
        sampleAnswer: "It's better. Two of the three carriers are hitting their windows now. Northline is still late most mornings.",
        ack: 'Got it.',
      },
      {
        q: 4,
        agent: 'Last one. Is there anything the team should know this week?',
        sampleAnswer: "No, that's everything from me.",
        ack: "Thanks, Dana. That's all I needed.",
      },
    ],
  },
  DISCOVERY: {
    title: 'Discovery · north dock',
    total: 3,
    opening: "I'll ask about what actually happens, not the written process. Short answers are fine.",
    turns: [
      {
        q: 1,
        agent: "When an inbound load is running late, what's the first thing you do?",
        sampleAnswer: 'I call the carrier first. Not email, because you never get an answer back in time.',
        ack: 'Got it.',
      },
      {
        q: 2,
        agent: 'Once you know the real delay, who do you need to tell?',
        sampleAnswer: 'The dock leads, so they can re-sequence the bays. And billing, if the paperwork is going to land late.',
      },
      {
        q: 2,
        follow: true,
        agent: 'How do you usually reach billing? A message, a call, something in a system?',
        sampleAnswer: "Usually a message in Teams. There's no system for it.",
        ack: "That's helpful.",
      },
      {
        q: 3,
        agent: 'Is any of this written down, or does it mostly live in people\'s heads?',
        sampleAnswer: "Mostly in my head, honestly. There's an old SOP but nobody follows it.",
        ack: "Thanks. That's everything for now.",
      },
    ],
  },
  CHANGE_REPORT: {
    title: 'Something changed',
    total: 1,
    opening: "A sentence or two is plenty. I'll ask if I need more.",
    turns: [
      {
        q: 1,
        agent: "What's different now?",
        sampleAnswer: 'Dispatch owns carrier appointment scheduling now. It used to be warehouse operations, which is us.',
      },
      {
        q: 1,
        follow: true,
        agent: 'When does that start, and who in dispatch owns it?',
        sampleAnswer: 'Starting next Monday. Priya Shah runs it.',
      },
      {
        q: 1,
        follow: true,
        agent: 'Is there any part of that process you still do?',
        sampleAnswer: 'I still confirm the dock bay once dispatch books the slot.',
        ack: "Got it. I'll structure that for you to check.",
      },
    ],
  },
  CLARIFICATION: {
    title: 'Invoice exceptions',
    total: 1,
    opening: 'Tell me how it actually works today.',
    turns: [
      {
        q: 1,
        agent: 'What makes it more complicated?',
        sampleAnswer: 'Finance owns the exception itself, but Operations has to flag it first and attach the delivery proof.',
      },
      {
        q: 1,
        follow: true,
        agent: 'So who makes the final call on whether an exception is approved?',
        sampleAnswer: 'Finance. Always Finance.',
        ack: 'Thanks, that clears it up.',
      },
    ],
  },
};

/** Generic clarifying follow-up used when an answer is too short to act on. */
export const VAGUE_FOLLOW_UP = 'Could you say a little more about that?';
export const VAGUE_WORD_THRESHOLD = 3;

type CardSeed = Pick<InterpretationItem, 'label' | 'proposedText' | 'category'> &
  Partial<Pick<InterpretationItem, 'allowedActions' | 'confirmLabel' | 'confirmedLabel'>>;

const c = (category: string, label: string, proposedText: string, extra: Partial<CardSeed> = {}): CardSeed => ({
  category,
  label,
  proposedText,
  ...extra,
});

export const INTERPRETATIONS: Record<ConversationMode, CardSeed[]> = {
  PULSE: [
    c('COMMITMENT', 'Commitment', "You sent the revised dock schedule to Jesse on Wednesday. It's in use for the late-shift bays."),
    c('STATUS', 'Project status', 'The NetSuite migration is no longer blocked by Finance.'),
    c('BLOCKER', 'New blocker', 'Production credentials are now waiting on IT.'),
    c('OWNER', 'Owner', 'Samir in IT owns providing the credentials, expected Wednesday.'),
    c('IMPACT', 'Impact', "Friday's migration date may slip by one business day."),
    c('STATUS', 'Inbound freight', 'Two of three carriers now hit their delivery windows. Northline is still late most mornings.'),
  ],
  CONFIRMATION: [
    c('STATEMENT', 'What you said', "Northline's morning deliveries arrive late about four days in five."),
    c('COMMITMENT', 'What you agreed', 'You will confirm carrier cutoff times with dispatch by 4:00 PM today.'),
  ],
  DISCOVERY: [
    c('TASK', 'First step', 'When an inbound load is late, you call the carrier directly. Email is too slow to be useful on the day.'),
    c('HANDOFF', 'Who you tell', 'You tell the dock leads so they can re-sequence the bays, and message billing in Teams if paperwork will land late.'),
    c('SYSTEM', 'Where it lives', "The process is mostly in your head. An older SOP exists but isn't followed."),
  ],
  CHANGE_REPORT: [
    c('RESPONSIBILITY', 'What changed', 'Carrier appointment scheduling moved from warehouse operations to dispatch.'),
    c('DATE', 'Starts', 'Monday, 5 October.'),
    c('OWNER', 'New owner', 'Priya Shah in dispatch.'),
    c('TASK', 'Your part now', 'You confirm the dock bay after dispatch books the slot.'),
  ],
  CLARIFICATION: [
    c('RESPONSIBILITY', 'Who flags it', 'Operations flags invoice exceptions and attaches the delivery proof.'),
    c('RESPONSIBILITY', 'Who decides', 'Finance approves or rejects every invoice exception.'),
  ],
  MEETING_WRAP_UP: [
    c('DECISION', 'Decision', "Use Option B for Friday's rollout.", {
      allowedActions: ['CONFIRM'],
      confirmLabel: 'Confirm',
      confirmedLabel: 'Confirmed',
    }),
    c('COMMITMENT', 'Your commitment', 'Validate the fallback procedure by Thursday at 3:00 PM.', {
      allowedActions: ['CONFIRM', 'CHANGE'],
      confirmLabel: 'Accept',
      confirmedLabel: 'Accepted',
    }),
    c('OPEN_QUESTION', 'Open question', 'The delivery date for production credentials is still unknown.', {
      allowedActions: ['CONFIRM'],
      confirmLabel: 'Noted',
      confirmedLabel: 'Noted',
    }),
  ],
};

export const REVIEW_COPY: Record<ConversationMode, ReviewCopy> = {
  PULSE: {
    chip: 'Our understanding · not submitted',
    title: "Here's what we understood",
    subtitle: "From your Monday Pulse. Fix anything that isn't right before it's submitted.",
    submitLabel: 'Submit Pulse',
  },
  CONFIRMATION: {
    chip: 'Our understanding · not confirmed',
    title: "Here's what we understood",
    subtitle: "Two things DutyGraph took from Friday's Operations Review. Neither is recorded as yours until you confirm.",
    submitLabel: 'Confirm',
  },
  DISCOVERY: {
    chip: 'Our understanding · not sent',
    title: "Here's what we understood",
    subtitle: "Your words, tidied up. Fix anything that isn't right — it's your account, not ours.",
    submitLabel: 'Save and send',
  },
  CHANGE_REPORT: {
    chip: 'Our understanding · not sent',
    title: "Here's what we understood",
    subtitle: "Here's the change as DutyGraph would record it.",
    submitLabel: 'Send this update',
  },
  CLARIFICATION: {
    chip: 'Our understanding · not sent',
    title: "Here's what we understood",
    subtitle: 'Check this settles who owns invoice exceptions.',
    submitLabel: 'Send',
  },
  MEETING_WRAP_UP: {
    chip: 'Captured in the meeting · not confirmed',
    title: 'Before we close this out',
    subtitle: 'DutyGraph captured these from the NetSuite rollout decision.',
    submitLabel: 'Confirm meeting outcome',
  },
};

export const DONE_COPY: Record<ConversationMode, { headline: string; body: string }> = {
  PULSE: { headline: 'Pulse submitted', body: "Thanks, Dana. We'll let you know if the 11:00 meeting still needs you." },
  CONFIRMATION: { headline: 'Sent. Thank you.', body: "Friday's review is confirmed. Your cutoff-times commitment is in My Work." },
  DISCOVERY: { headline: 'Sent. Thank you.', body: 'Your account of the north dock is on its way to the discovery team.' },
  CHANGE_REPORT: {
    headline: 'Sent. Thank you.',
    body: 'DutyGraph will propose the workflow update for review and let the people affected know once it is confirmed.',
  },
  CLARIFICATION: {
    headline: 'Sent. Thank you.',
    body: "Invoice exceptions are settled. DutyGraph won't ask again unless something changes.",
  },
  MEETING_WRAP_UP: { headline: 'Meeting outcome confirmed', body: 'Your commitment is in My Work.' },
};
