> **North star, not current state.** Added on 2026-09-29 at Matt's request as the product vision for the DutyGraph Companion (participant mobile app), DutyGraph Pulse, and meeting orchestration. It describes where the product is going. It does not describe what is built today. For today's state read [START-HERE](../../START-HERE.md), [NEXT-STEPS](../NEXT-STEPS.md) and [Companion connection](../companion-connection.md). The related voice spec is [voice walkie-talkie](../specs/voice-walkie-talkie.md). When this document and the repository's engineering rules disagree (for example tenant isolation, evidence lineage, the restricted runtime role, or "AI proposals are not canonical truth"), the engineering rules win and this document should be updated.
>
> The text below is the owner's document as supplied, unchanged. Example people and companies in it are fictional.
>
> **Engineering notes added at review (they bind any implementation of this vision):**
> 1. *Participant confirmation is not graph approval.* When a participant confirms "here's what we understood", that confirms their own submission only. A `GraphDelta` (section 16.11) becomes canonical only after a separate, authorized advisor (or delegated authority) approval, recorded as its own state and record. Model them separately, for example `participantConfirmedAt` on the submission and `PROPOSED → APPROVED | REJECTED` with an approver on the delta. Never let the participant's `CONFIRMED` mutate canonical task, responsibility or workflow state.
> 2. *Offline cache lifecycle.* Cached Today, commitment and draft data (section 27) is scoped to one participant session and device. It is purged (or locked behind re-authentication) on logout, re-enrollment, a different participant signing in, or any server response that says the session or device is revoked. Encryption at rest is not enough on a shared or lost phone.

---

# DutyGraph Companion Mobile App
## Product Requirements, Build Specification, and Technical Architecture

**Document status:** Canonical implementation handoff for Claude Code  
**Audience:** Claude Code, DutyGraph engineering, product, design  
**Primary platform:** React Native mobile application  
**Product relationship:** Participant-facing companion to the main DutyGraph platform  

---

# 1. Executive Summary

DutyGraph Companion is the participant-facing mobile application for the living DutyGraph.

The app began as a lightweight way for employees to answer discovery questions by voice or text. That foundation remains correct, but the product has evolved substantially.

The mobile app is now the primary employee interface for:

- DutyGraph Pulses, which replace many recurring status meetings with short async voice interactions;
- discovery interviews and clarifications;
- meeting preparation and meeting follow-up;
- action and commitment confirmation;
- notifying DutyGraph when responsibilities, workflows, software, or ownership change;
- seeing whether required team inputs are complete;
- participating in live meetings only when synchronous interaction is actually required.

The app must not become a mobile clone of the desktop DutyGraph application. It is a focused participant companion.

The core user promise is:

> DutyGraph asks me only what it needs to know, saves me from unnecessary meetings, remembers what I committed to, and gets me out of live meetings as quickly as possible.

The core system promise is:

> Every meaningful participant interaction can improve the DutyGraph while preserving user review, evidence lineage, authority, and organizational accountability.

---

# 2. Product Vision

DutyGraph should replace the assumption that coordination requires a synchronous meeting.

A traditional recurring meeting often looks like:

**Calendar invite -> 8 to 15 people -> 30 to 60 minutes -> status updates -> vague actions -> incomplete follow-up**

DutyGraph should instead run:

**Business state -> targeted async questions -> structured synthesis -> live discussion only if required -> explicit decisions/actions -> updated DutyGraph**

A meeting is therefore a workflow primitive, not a video call.

The same underlying system may choose among:

- async voice Pulse;
- async text response;
- clarification request;
- approval request;
- decision request;
- short live exception meeting;
- traditional live meeting when genuinely needed.

The application should optimize for the minimum amount of human coordination time required to achieve the intended business outcome.

---

# 3. Product Principles

## 3.1 Participant-first, not advisor-first

The mobile app is for the person doing the work.

Do not expose:

- advisor tools;
- company-wide graph administration;
- solution marketplace administration;
- raw Jev scores;
- evidence-state terminology;
- graph confidence percentages;
- internal AI orchestration terminology;
- unrestricted company directory browsing.

A limited team roster is allowed where required for a specific shared Pulse or meeting and where permissions allow it.

## 3.2 Voice-first, not voice-only

Voice should be the fastest default for rich responses.

Every critical voice interaction must have a text alternative.

## 3.3 Conversational, not form-driven

Avoid long forms and generic questionnaires.

The desired loop is:

**Agent asks -> participant answers naturally -> agent interprets -> Jev judges whether another question is needed -> agent follows up or advances**

## 3.4 Context before questions

The system should never ask a participant for information DutyGraph already knows unless it is confirming a suspected change or resolving a conflict.

Questions should reference prior commitments, known work, open blockers, and relevant company state.

## 3.5 Interpretation is not canonical truth

Speech transcription, AI interpretation, and canonical DutyGraph state are different things.

The system may process a response in real time, but it must not silently convert a participant statement into canonical organizational truth.

Where the user is providing a personal statement or async Pulse response, the participant should be able to review the structured interpretation before it is committed as their confirmed submission.

## 3.6 Meeting time should be earned

A live meeting should happen only when synchronous interaction materially improves the outcome.

## 3.7 No shame mechanics

Visible completion is allowed.

Use factual states:

- Not started
- In progress
- Complete
- Due
- Overdue

Do not add:

- rankings;
- streaks;
- public performance scores;
- "worst responder" views;
- punitive gamification.

## 3.8 The transcript is evidence, not the product

The valuable output is structured organizational state:

- statements;
- decisions;
- actions;
- commitments;
- contradictions;
- Task Card deltas;
- responsibility deltas;
- open questions;
- workflow discoveries.

---

# 4. Primary Users and Jobs To Be Done

## 4.1 Employee / Participant

Primary jobs:

- Tell DutyGraph what changed without scheduling a meeting.
- Complete a recurring Pulse quickly.
- Answer discovery or clarification questions.
- Understand why I am needed in a live meeting.
- Confirm what DutyGraph understood from me.
- See what I committed to.
- See what I am waiting on from others.
- Confirm or correct a meeting outcome.
- Know when a meeting was eliminated or shortened.

## 4.2 Manager / Meeting Owner

The mobile app is not the primary management surface, but a manager may also be a participant.

Primary participant-side jobs:

- Complete the same inputs as everyone else.
- Confirm assigned decisions or actions.
- Join live exception meetings when needed.

Broader meeting analytics and financial cost analysis belong on desktop.

## 4.3 DutyGraph AI Facilitator

System jobs:

- Determine what information is needed next.
- Ask precise, low-friction questions.
- Avoid asking unnecessary questions.
- Keep conversations aligned with a defined purpose.
- Detect incomplete answers, contradictions, blockers, actions, ownership, and changes.
- Close loops before ending a meeting or Pulse.

---

# 5. Scope

## 5.1 MVP scope

The first production-capable mobile release should include:

1. Authentication / invitation / identity confirmation
2. Today screen
3. Request inbox
4. DutyGraph Pulse
5. Voice and text response modes
6. Dynamic AI follow-up questions
7. Review: "Here's what we understood"
8. Participant correction and confirmation
9. Pulse completion
10. Team Pulse completion status where authorized
11. Meeting avoided / meeting shortened / meeting required cards
12. Pre-meeting brief
13. Meeting outcome confirmation
14. My Work / commitments
15. Commitment detail
16. Clarification request
17. Something Changed flow
18. Discovery request flow
19. Notifications
20. Profile, privacy, voice, and appearance settings

## 5.2 Post-MVP scope

Later phases may add:

- real-time live meeting companion;
- AI facilitator presence during live meetings;
- meeting time remaining and current-question UI;
- join/deep-link integrations for Google Meet, Teams, Zoom, or other providers;
- live meeting transcription ingestion;
- live meeting active voice facilitation;
- richer continuous-discovery graph-delta review;
- approvals and formal decision authority workflows;
- personal time-saved analytics;
- configurable communication preferences learned from interaction history.

## 5.3 Non-goals

Do not build in this mobile app:

- native video conferencing;
- full DutyGraph admin;
- full org-chart browsing;
- FDE marketplace management;
- Solution Graph administration;
- advisor workflow;
- company-wide evidence review;
- raw model/Jev debugging surfaces;
- financial meeting-cost dashboards for ordinary employees.

---

# 6. Canonical Information Architecture

Recommended bottom navigation:

## Today

What DutyGraph needs from the participant now.

Includes:

- due requests;
- Pulse cards;
- clarification requests;
- meeting changes;
- pending confirmations;
- short "done today" history.

## Work

Participant-specific work state.

Includes:

- commitments I own;
- items waiting on someone else;
- due dates;
- definition of done;
- source meeting/Pulse.

## Meetings

Includes:

- upcoming live meetings;
- meetings replaced by async collection;
- shortened meetings;
- pre-meeting briefs;
- recent meeting outcomes.

## Me

Includes:

- profile;
- notification preferences;
- microphone / voice settings;
- privacy information;
- appearance;
- optional communication preferences.

---

# 7. Required Screens and Routes

Claude Code should map the Claude Design frontend to the following canonical routes. Reuse existing visual components where possible.

## 7.1 Onboarding and identity

- `/invite`
- `/identity`
- `/permissions/microphone`
- `/permissions/notifications`

Requirements:

- preserve the participant-only framing;
- clearly disclose microphone behavior;
- provide "Type instead" everywhere voice is optional;
- do not require unnecessary profile setup before first useful action.

## 7.2 Today

- `/today`

Card types:

- Pulse
- Discovery
- Confirmation
- Decision
- Approval
- Clarification
- Meeting

Each card must expose:

- what DutyGraph needs;
- estimated time;
- due time/date if applicable;
- primary CTA;
- enough context to understand why the request exists.

## 7.3 Pulse

- `/pulse/:pulseId`
- `/pulse/:pulseId/conversation`
- `/pulse/:pulseId/review`
- `/pulse/:pulseId/complete`
- `/pulse/:pulseId/team-status`

## 7.4 Meetings

- `/meetings`
- `/meetings/:meetingId/avoided`
- `/meetings/:meetingId/shortened`
- `/meetings/:meetingId/required`
- `/meetings/:meetingId/brief`
- `/meetings/:meetingId/live` (post-MVP active companion)
- `/meetings/:meetingId/wrap-up`

## 7.5 Work

- `/work`
- `/work/commitments/:commitmentId`
- `/work/waiting/:dependencyId`

## 7.6 Continuous discovery

- `/clarifications/:clarificationId`
- `/something-changed`
- `/discovery/:requestId`

## 7.7 Me

- `/me`
- `/me/notifications`
- `/me/privacy`
- `/me/voice`
- `/me/appearance`

---

# 8. DutyGraph Pulse Product Requirements

DutyGraph Pulse is a first-class product, not a generic survey.

## 8.1 Pulse definition

A Pulse is an async, context-aware coordination session created to replace or reduce a recurring meeting or operational check-in.

A Pulse contains:

- purpose;
- target outcome;
- participant set;
- response deadline;
- estimated duration;
- participant-specific question plan;
- linked company/project context;
- live-follow-up policy;
- post-collection synthesis rules.

## 8.2 Participant experience

A Pulse should usually take 2 to 5 minutes.

Opening example:

> I'll ask a few questions based on your current work. Answer naturally. I'll ask follow-ups only when something needs clarification.

The app should then run a real conversation.

Example:

AI:
> Last Monday you said the carrier API was blocking the rollout. Is that still unresolved?

Participant:
> Finance cleared it, but now we're waiting on IT.

AI:
> What specifically do you need from IT?

Participant answers.

AI:
> Who owns getting that to you?

Participant answers.

AI:
> Does this change Friday's delivery date?

The system then advances when enough information has been captured.

## 8.3 Pulse completion logic

A Pulse is complete when:

- required participant inputs are captured;
- required clarifications are resolved or explicitly marked unresolved;
- the participant has reviewed/confirmed their structured interpretation;
- server acknowledges final submission.

Do not mark complete simply because audio was recorded.

## 8.4 Team status

Authorized participants may see shared completion state for the relevant Pulse.

Status values:

- Not started
- In progress
- Complete
- Due soon
- Overdue

The mobile app should not expose private answers from other participants in this view.

---

# 9. Carson Tate Meeting Framework as Voice-Agent Doctrine

The meeting and Pulse voice agent should be explicitly grounded in the facilitation principles derived from Carson Tate's *Work Simply*, Chapter 14.

This is not UI copy. It is runtime behavior.

The AI facilitator should continuously reason about:

## Purpose

Why is this interaction happening?

## Outcomes

What must be true when it ends?

## Who

Who is required to contribute, decide, execute, or know?

## Execution

What happens next?

## Responsibility

Who owns the result?

DutyGraph extends this with:

## Evidence

What supports the statement or decision?

## Coverage

Do we sufficiently understand:

- What
- How
- Who
- Why

The agent should use these as an internal checklist and conversational doctrine. It should not mechanically recite the framework to users.

---

# 10. Jev Judgment Layer

Jev is a separate judgment service from the conversational voice model.

The architecture must preserve this distinction:

**Jev judges. The voice agent facilitates. Deterministic services enforce facts and rules.**

## 10.1 Jev use cases

Jev should be used for typed judgments such as:

- Does this require synchronous interaction?
- What meeting type is this?
- Is a participant necessary?
- Is another follow-up question justified?
- Is the answer sufficiently complete?
- What important variable is missing?
- Is the current topic relevant to the stated outcome?
- Is a new statement meaningfully contradictory to current DutyGraph context?
- Is the meeting ready to close?
- Is a commitment sufficiently specified?
- Is a decision ready, blocked, or unsupported?

## 10.2 Jev should not perform deterministic work

Do not use Jev for:

- timers;
- arithmetic;
- due-date calculation;
- participant presence;
- permissions;
- authentication;
- known IDs;
- version checks;
- explicit approval state;
- database truth.

## 10.3 Recommended typed outputs

Implement Jev judgments behind a server interface such as:

```ts
interface MeetingJudgmentService {
  classifyMeetingMode(input: MeetingModeInput): Promise<MeetingModeJudgment>;
  classifyMeetingType(input: MeetingTypeInput): Promise<MeetingTypeJudgment>;
  assessFollowUpNeed(input: FollowUpInput): Promise<FollowUpJudgment>;
  assessTopicRelevance(input: TopicInput): Promise<TopicJudgment>;
  assessEvidenceSufficiency(input: EvidenceInput): Promise<EvidenceJudgment>;
  assessDecisionReadiness(input: DecisionInput): Promise<DecisionReadinessJudgment>;
  assessContradiction(input: ContradictionInput): Promise<ContradictionJudgment>;
  assessCloseReadiness(input: CloseInput): Promise<CloseReadinessJudgment>;
}
```

Representative enums:

```ts
type MeetingMode = 'ASYNC' | 'LIVE' | 'HYBRID' | 'NO_MEETING' | 'INSUFFICIENT_INFO';

type MeetingType =
  | 'INFORMATIONAL'
  | 'DECISION'
  | 'PROBLEM_SOLVING'
  | 'BRAINSTORMING'
  | 'TEAM_BUILDING'
  | 'INSTRUCTIONAL';
```

Never expose raw Jev scores directly to ordinary mobile participants.

---

# 11. Voice Agent Architecture

The facilitator prompt is a first-class product asset.

Do not implement the voice behavior as a small hardcoded system prompt in a route handler.

## 11.1 Prompt composition

Every conversational turn should be assembled from versioned layers:

1. Core DutyGraph facilitator personality
2. Carson Tate meeting doctrine
3. Interaction mode module
   - Pulse
   - Discovery
   - Clarification
   - Decision
   - Problem-solving
   - Instructional
   - Meeting wrap-up
4. Voice UX rules
5. Anti-overquestioning policy
6. Participant context
7. Relevant DutyGraph context
8. Current interaction purpose/outcome
9. Current state-machine state
10. Latest Jev judgments
11. Previously confirmed participant statements
12. Current transcript/turn window

Every runtime conversation should log a `prompt_version` or prompt-pack version for reproducibility.

## 11.2 Facilitator personality requirements

The agent should feel like a highly competent human facilitator.

It should:

- be concise;
- sound natural aloud;
- ask one question at a time;
- remember prior answers;
- use known context;
- ask precise follow-ups;
- challenge ambiguity without sounding accusatory;
- distinguish assumptions from facts;
- notice missing ownership;
- identify deadline impact;
- redirect topic drift;
- stop probing once the information value becomes low;
- know when to advance;
- know when to close;
- avoid lectures;
- avoid reading structured metadata aloud;
- avoid repeating the user's answer back unless confirmation is required.

## 11.3 Spoken response style

Bad:

> Thank you, Dana. Based on your previous response, I would like to explore the issue in greater detail. Could you elaborate on which individual within the information technology department is responsible for supplying the credentials?

Good:

> Got it. Who in IT owns the credentials?

The intelligence should be sophisticated internally. Spoken language should remain simple.

## 11.4 Anti-overquestioning policy

A critical failure mode is turning every interaction into an interrogation.

Before asking another follow-up, the system should consider:

- relevance to the current outcome;
- expected information value;
- whether the information is already available;
- whether the question can wait;
- whether the participant is the right person to answer it;
- whether the answer materially changes a decision, action, responsibility, or DutyGraph state.

Use Jev to support this judgment.

---

# 12. Conversation State Machine

The server should own conversation state. The mobile app renders that state and sends participant input.

## 12.1 Generic async state machine

```text
CREATED
  -> READY
  -> ACTIVE
  -> PROCESSING_TURN
  -> FOLLOW_UP or NEXT_TOPIC
  -> REVIEW_READY
  -> REVIEWING
  -> SUBMITTING
  -> SUBMITTED
```

Failure branches:

```text
ACTIVE -> MIC_ERROR
ACTIVE -> OFFLINE_DRAFT
PROCESSING_TURN -> PROVIDER_ERROR
SUBMITTING -> SUBMISSION_FAILED
```

## 12.2 Meeting facilitator state machine

```text
PREPARE
OPEN
ESTABLISH_PURPOSE
CONFIRM_OUTCOME
COLLECT
PROBE
RESOLVE_CONTRADICTIONS
DECIDE
ASSIGN_EXECUTION
CONFIRM_RESPONSIBILITY
CLOSE
COMPLETE
```

Different meeting types can omit or specialize states.

Examples:

- Brainstorming should protect divergence before convergence.
- Informational sessions may skip decision states.
- Instructional sessions should extract process sequence and Task Card candidates.
- Team-building should use lighter intervention.

---

# 13. Important Privacy Correction From the Original Prototype

The original design copy said, in effect, that nothing leaves the screen until the participant presses Send.

That cannot remain literally true if DutyGraph is performing cloud transcription, Jev classification, or dynamic AI follow-up during the conversation.

The correct product distinction is:

> Your response may be securely processed while you speak so DutyGraph can transcribe it and ask follow-up questions. It is not committed as your confirmed organizational submission until you review and send it.

Claude Code must update any frontend copy that promises zero network processing before Send unless the final architecture actually performs all transcription and reasoning on-device.

For MVP, assume server-side processing.

This distinction must be reflected in:

- microphone consent;
- privacy copy;
- voice-session status;
- retention policy;
- audit logs.

---

# 14. Recommended Mobile Technology Stack

Use the existing project stack if it is already established and compatible. Do not rewrite the frontend simply to match these recommendations.

For a new or incomplete implementation, the recommended stack is:

## Client

- React Native
- TypeScript
- Expo where it does not block required native capabilities
- Expo Router or existing navigation solution
- TanStack Query for server state
- Zustand for lightweight ephemeral session/UI state
- React Hook Form only where actual forms exist
- SecureStore / native keychain for auth secrets
- encrypted local storage for drafts and cached participant state
- WebSocket or equivalent bidirectional session transport for conversational turns
- push notifications through Expo Notifications or direct APNs/FCM abstraction

## Backend

Do not create a separate duplicate business-logic backend if the existing DutyGraph backend can be extended.

Add a mobile-facing API/BFF layer only where mobile-specific shaping is useful.

Recommended qualities:

- TypeScript
- server-side Jev access only
- server-side LLM/voice orchestration
- explicit authorization checks on every company-scoped request
- event-driven updates for Pulse completion and meeting-state changes

## Provider abstraction

Do not couple the domain layer to a single speech, TTS, LLM, or meeting provider.

Create interfaces such as:

```ts
interface SpeechToTextProvider {
  startSession(config: SttSessionConfig): Promise<SttSession>;
}

interface TextToSpeechProvider {
  synthesize(input: TtsInput): Promise<TtsOutput>;
}

interface ConversationModelProvider {
  generateTurn(input: ConversationTurnInput): Promise<ConversationTurnOutput>;
}

interface MeetingProvider {
  getJoinTarget(meetingId: string): Promise<MeetingJoinTarget>;
}
```

The app should be able to change providers without changing core product logic.

---

# 15. Voice Session Technical Flow

Recommended async voice pipeline:

```text
Participant starts session
        ↓
Mobile obtains microphone permission
        ↓
Authenticated voice session created on backend
        ↓
Audio streams in bounded chunks
        ↓
STT produces partial/final transcript
        ↓
Transcript appended to interaction state
        ↓
Structured extraction updates candidate interpretation
        ↓
Jev judges whether follow-up is required
        ↓
Conversation model generates concise next utterance
        ↓
TTS returns spoken question or app displays text
        ↓
Participant answers
        ↓
Repeat until interaction is complete
        ↓
Review screen generated
        ↓
Participant edits/confirms
        ↓
Final structured submission committed
```

Important rules:

- the server owns canonical turn order;
- mobile may optimistically render local transcript, but server acknowledgments are authoritative;
- every utterance must have a stable ID;
- final transcript segments must be distinguishable from partial segments;
- retries must not duplicate utterances;
- final submit must be idempotent.

---

# 16. Data Model

This is a logical model. Map it into the existing DutyGraph schema where equivalent entities already exist.

## 16.1 Participant

```ts
Participant {
  id
  companyId
  userId
  displayName
  roleId?
  status
  timezone
  notificationPreferences
  voicePreferences
}
```

## 16.2 ParticipationRequest

Unified mobile request object.

```ts
ParticipationRequest {
  id
  companyId
  participantId
  type: 'PULSE' | 'DISCOVERY' | 'CONFIRMATION' | 'DECISION' | 'APPROVAL' | 'CLARIFICATION' | 'MEETING'
  title
  summary
  reason
  estimatedMinutes
  dueAt?
  status
  sourceEntityType?
  sourceEntityId?
  createdAt
  completedAt?
}
```

## 16.3 Pulse

```ts
Pulse {
  id
  companyId
  title
  purpose
  desiredOutcome
  dueAt
  status
  meetingReplacementId?
  liveFollowupPolicy
  createdBy
}
```

## 16.4 PulseParticipant

```ts
PulseParticipant {
  pulseId
  participantId
  status
  startedAt?
  submittedAt?
  estimatedMinutes
}
```

## 16.5 ConversationSession

```ts
ConversationSession {
  id
  companyId
  participantId
  requestId
  mode
  state
  promptVersion
  startedAt
  endedAt?
  providerMetadata?
}
```

## 16.6 Utterance

```ts
Utterance {
  id
  sessionId
  speaker: 'PARTICIPANT' | 'DUTYGRAPH'
  text
  sequence
  startedAt?
  endedAt?
  final: boolean
  source: 'VOICE' | 'TEXT' | 'SYSTEM'
}
```

## 16.7 InterpretationItem

Used by "Here's what we understood."

```ts
InterpretationItem {
  id
  sessionId
  category
  label
  proposedText
  participantEditedText?
  status: 'PENDING' | 'CONFIRMED' | 'CHANGED' | 'REJECTED'
  sourceUtteranceIds[]
}
```

## 16.8 Commitment

```ts
Commitment {
  id
  companyId
  ownerParticipantId
  title
  outcome
  dueAt?
  authority?
  constraints?
  definitionOfDone?
  status
  sourceType
  sourceId
  waitingOnParticipantId?
}
```

## 16.9 Decision

```ts
Decision {
  id
  companyId
  title
  decision
  authorityParticipantId?
  rationale?
  status
  sourceMeetingId?
  sourceSessionId?
}
```

## 16.10 Clarification

```ts
Clarification {
  id
  companyId
  participantId
  prompt
  existingStatement?
  conflictingStatement?
  status
  sourceIds[]
}
```

## 16.11 GraphDelta

A proposed DutyGraph change, not automatically canonical.

```ts
GraphDelta {
  id
  companyId
  type: 'TASK' | 'RESPONSIBILITY' | 'SYSTEM' | 'WORKFLOW' | 'ROLE' | 'OTHER'
  proposedChange
  sourceIds[]
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'REQUIRES_REVIEW'
}
```

---

# 17. API Surface

Use the existing API style where one exists. The following is a functional contract, not a requirement to use REST specifically.

## Today

- `GET /mobile/today`

Returns user-scoped request cards, upcoming meetings, due commitments, and recently completed items.

## Requests

- `GET /mobile/requests/:id`
- `POST /mobile/requests/:id/start`

## Conversation

- `POST /mobile/conversations`
- `GET /mobile/conversations/:id`
- `POST /mobile/conversations/:id/text-turn`
- WebSocket or streaming endpoint for voice turns
- `POST /mobile/conversations/:id/stop`
- `GET /mobile/conversations/:id/review`
- `PATCH /mobile/conversations/:id/review-items/:itemId`
- `POST /mobile/conversations/:id/submit`

## Pulse

- `GET /mobile/pulses/:id`
- `GET /mobile/pulses/:id/team-status`

## Meetings

- `GET /mobile/meetings`
- `GET /mobile/meetings/:id`
- `GET /mobile/meetings/:id/brief`
- `GET /mobile/meetings/:id/wrap-up`
- `POST /mobile/meetings/:id/wrap-up/confirm`

## Work

- `GET /mobile/commitments`
- `GET /mobile/commitments/:id`
- `POST /mobile/commitments/:id/complete`

## Clarifications

- `GET /mobile/clarifications/:id`
- `POST /mobile/clarifications/:id/respond`

## Something Changed

- `POST /mobile/change-reports`

## Profile

- `GET /mobile/me`
- `PATCH /mobile/me/preferences`

---

# 18. Example Today Response

```json
{
  "participant": {
    "id": "p_123",
    "displayName": "Dana Okafor"
  },
  "dueNow": [
    {
      "id": "req_1",
      "type": "PULSE",
      "title": "Monday Operations Pulse",
      "summary": "4 questions about your current work",
      "estimatedMinutes": 4,
      "dueAt": "2026-09-29T10:30:00-04:00",
      "status": "NOT_STARTED",
      "cta": "Start Pulse"
    }
  ],
  "later": [],
  "doneToday": []
}
```

---

# 19. Meeting Necessity and Async-to-Live Routing

This logic belongs on the server and desktop orchestration layer, but the mobile app must render its outcomes.

## Possible meeting-mode results

- `NO_MEETING`
- `ASYNC`
- `HYBRID`
- `LIVE`
- `INSUFFICIENT_INFO`

## Mobile experiences

### Meeting avoided

Show:

> You don't need to join the 10:00 meeting.

Include:

- brief reason;
- time returned;
- optional summary CTA.

### Meeting shortened

Show:

- new time window;
- exact issue requiring the user;
- expected outcome;
- reason the participant is needed.

### Meeting required

Show:

- purpose;
- outcome;
- participant's role;
- estimated duration;
- join CTA;
- pre-meeting brief CTA.

Do not expose internal Jev output.

---

# 20. Pre-Meeting Brief Requirements

Before a live meeting, the participant should be able to see:

- purpose;
- expected outcome;
- why they are needed;
- what DutyGraph already knows;
- unresolved questions;
- what DutyGraph may ask them;
- decision authority if relevant;
- estimated meeting duration.

This should reduce meeting setup time and prevent participants from entering without context.

---

# 21. Meeting Wrap-Up Requirements

After a meeting, the participant may receive a wrap-up requiring confirmation.

Possible items:

- decision;
- participant commitment;
- due date;
- open question;
- proposed wording of a responsibility change;
- proposed Task Card change.

The participant should be able to:

- confirm;
- correct;
- reject where appropriate.

The app should not let a user edit decisions or responsibilities they do not have authority to alter. Permission checks must come from the backend.

---

# 22. Something Changed Flow

This is a first-class continuous-discovery entry point.

Participant chooses or says what changed.

Examples:

- My responsibilities changed.
- This process changed.
- Someone else owns this now.
- We started using new software.
- We stopped doing a task.
- An approval step changed.
- Something else changed.

The agent should then conduct a focused conversation and produce reviewable structured items.

Do not ask the user to manually navigate the graph.

---

# 23. Discovery vs Pulse

These are related but distinct interaction types.

## Discovery

Goal:

- understand work deeply;
- fill graph coverage gaps;
- capture tasks, responsibilities, tools, exceptions, dependencies.

Usually longer and broader.

## Pulse

Goal:

- coordinate current work;
- check commitments;
- expose blockers;
- identify meaningful changes;
- replace recurring status meetings.

Usually short and operational.

The same voice engine may power both, but prompts, time budgets, and probing policies should differ.

---

# 24. Notifications

Notification system should support:

## Pulse ready

> Your Monday Operations Pulse is ready. About 4 minutes. Due 10:30 AM.

## Meeting avoided

> You're no longer needed at the 10:00 meeting. Your Pulse covered everything the team needed.

## Meeting shortened

> You're needed for 15 minutes at 10:15. One decision remains unresolved.

## Clarification

> DutyGraph found conflicting information. Can you help clarify who owns invoice exceptions?

## Commitment reminder

> Due in 2 hours: Validate fallback procedure.

## Follow-up

> Did this get finished? DutyGraph has not seen confirmation yet.

Notification payloads should deep-link to the exact in-app route.

---

# 25. Authentication and Authorization

## Authentication

Prefer the existing DutyGraph identity system.

Do not create an unrelated mobile credential store if web identity already exists.

Recommended mobile patterns:

- signed invitation link;
- magic link or OTP where needed;
- short-lived access token;
- rotating refresh token in native secure storage.

## Authorization

All company-scoped reads and writes must be server-authorized.

The client must never determine authorization based only on hidden UI.

Examples:

- team Pulse status only if permitted;
- meeting brief only if participant is entitled;
- meeting wrap-up only if relevant;
- commitment edit only for authorized fields;
- no broad company roster endpoint for ordinary participants.

---

# 26. Security and Privacy Requirements

## 26.1 Microphone behavior

- microphone activation must always be user initiated;
- show visible recording/listening state;
- no background listening;
- no silent microphone activation;
- pause/stop controls must work immediately.

## 26.2 Audio

Recommended MVP default:

- stream audio only during an explicit active session;
- encrypt in transit;
- avoid retaining raw async audio longer than necessary unless organization policy requires retention;
- retain confirmed transcript/structured submission as the primary record.

Final retention duration should be configurable and documented.

## 26.3 Auditability

Log:

- request created;
- session started;
- participant submitted;
- interpretation item edited;
- commitment confirmed;
- graph delta proposed;
- graph delta approved/rejected;
- prompt version;
- provider/model version where available;
- user/device timestamps.

Do not log secrets, auth tokens, or raw audio into application logs.

## 26.4 Privacy UX

Use plain language.

Do not show participants internal inference terminology.

---

# 27. Offline and Failure Behavior

The app should fail gracefully.

## Offline

MVP requirements:

- cached Today screen may remain viewable;
- existing commitment details may remain viewable if previously cached;
- new AI voice conversation requires network unless an on-device provider is intentionally implemented;
- text draft may be stored locally and submitted when online;
- do not pretend a Pulse is complete until server confirms submission.

## Microphone blocked

Show:

- concise explanation;
- direct route to device permission settings if supported;
- "Type instead" option.

## Voice provider error

Offer:

- Retry
- Continue by typing
- Save and finish later

## Send failure

Never discard confirmed review edits.

Persist a local encrypted pending submission until acknowledged or explicitly discarded.

## Idempotency

Every final submission and commitment-confirmation endpoint should accept an idempotency key.

---

# 28. Accessibility

Must support:

- Dynamic Type / system font scaling;
- screen readers;
- sufficient contrast in dark and light themes;
- clear recording state beyond color alone;
- captions/transcript for spoken AI prompts;
- text alternative for every voice interaction;
- large touch targets;
- reduced-motion preferences where relevant.

---

# 29. Analytics and Product Metrics

Track product events, not private content, unless explicitly required.

Key events:

- request_viewed
- pulse_started
- pulse_completed
- voice_started
- voice_switched_to_text
- follow_up_asked
- review_item_changed
- review_submitted
- meeting_avoided_viewed
- meeting_shortened_viewed
- premeeting_brief_viewed
- commitment_confirmed
- clarification_completed
- something_changed_submitted
- send_failed

Key metrics:

- Pulse completion rate;
- median Pulse completion time;
- percentage of Pulses requiring follow-up;
- average follow-up count;
- meeting-hours avoided;
- live participant-hours avoided;
- meetings eliminated;
- meetings shortened;
- actions with clear owner;
- actions completed by due date;
- participant correction rate on AI interpretations;
- failed-session rate;
- voice-to-text fallback rate.

Manager-level financial meeting-cost analytics remain outside the participant mobile surface.

---

# 30. Design-System Implementation Requirements

The Claude Design output is the visual source of truth.

Engineering should extract reusable primitives rather than hand-coding every screen independently.

Recommended component families:

- `ScreenShell`
- `TopBar`
- `BottomNav`
- `RequestCard`
- `StatusChip`
- `PrimaryButton`
- `SecondaryButton`
- `VoiceRecorder`
- `Waveform`
- `LiveTranscript`
- `AgentPromptBubble`
- `InterpretationCard`
- `ConfirmationRow`
- `CommitmentCard`
- `MeetingStateCard`
- `EmptyState`
- `ErrorState`
- `LoadingState`
- `BottomActionBar`

Centralize tokens:

- spacing;
- radius;
- typography;
- background layers;
- border colors;
- violet unsent-understanding state;
- sage confirmed/sent state;
- warning/error state;
- dark/light theme.

Do not use hardcoded screen-specific colors unless present in the design system.

---

# 31. Build Architecture and Folder Structure

Adapt to the existing repo. If a clean structure is needed, use something similar to:

```text
app/
  (auth)/
  (tabs)/
    today/
    work/
    meetings/
    me/
  pulse/
  discovery/
  clarifications/
  meetings/

src/
  components/
    common/
    voice/
    requests/
    meetings/
    work/
  features/
    auth/
    today/
    pulse/
    conversation/
    meetings/
    commitments/
    discovery/
    clarifications/
    notifications/
    profile/
  api/
  hooks/
  state/
  storage/
  analytics/
  theme/
  types/
  utils/
```

Server-side modules should mirror domain concepts rather than mobile screens.

Example:

```text
meeting-orchestration/
conversation/
jev/
prompts/
transcription/
tts/
participation-requests/
commitments/
graph-deltas/
notifications/
```

---

# 32. Prompt Asset Management

Prompts are product code.

Store them as versioned assets, not scattered strings.

Recommended structure:

```text
prompts/
  facilitator/
    core.md
    voice-style.md
    anti-overquestioning.md
    closing.md
  modes/
    pulse.md
    discovery.md
    clarification.md
    informational.md
    decision.md
    problem-solving.md
    brainstorming.md
    team-building.md
    instructional.md
```

Every session should record:

- prompt pack version;
- mode;
- meeting type where relevant.

Prompt changes should be testable and reviewable like application code.

---

# 33. Testing Strategy

## 33.1 Unit tests

Test:

- request state transitions;
- conversation state transitions;
- interpretation review behavior;
- due/overdue calculations;
- auth token handling;
- offline draft persistence;
- idempotent submission;
- component state rendering.

## 33.2 Contract tests

Mock provider adapters and verify:

- STT partial/final transcript behavior;
- Jev typed-output parsing;
- conversation-model output schema;
- TTS errors;
- notification payloads;
- meeting provider deep links.

## 33.3 Conversation simulation tests

Create fixtures for:

- clear answer;
- vague answer;
- contradiction;
- refusal;
- participant does not know;
- participant names another owner;
- deadline changed;
- new blocker;
- irrelevant tangent;
- multiple facts in one response;
- participant corrects the AI;
- system already knows the answer;
- follow-up would be low value.

Measure:

- unnecessary-question rate;
- missed-critical-follow-up rate;
- incorrect-owner extraction rate;
- interpretation correction rate.

## 33.4 End-to-end flows

Automate at least:

### Scenario A: Monday Pulse

Invite -> Start -> Voice -> Follow-up -> Review -> Edit -> Submit -> Team status.

### Scenario B: Meeting eliminated

Today card -> Meeting avoided -> Team summary.

### Scenario C: Meeting shortened

Meeting shortened -> Pre-meeting brief -> Join target.

### Scenario D: Meeting wrap-up

Wrap-up -> Confirm commitment -> Commitment appears in Work.

### Scenario E: Something Changed

Start -> Voice -> Follow-up -> Review -> Submit -> Graph delta proposed.

### Scenario F: Failure recovery

Record -> network failure -> local pending state -> reconnect -> successful idempotent submit.

---

# 34. Acceptance Criteria

The MVP is not complete until all of the following are true.

## Core navigation

- Participant can open app and immediately see required actions.
- Bottom navigation works across Today, Work, Meetings, Me.
- Deep links from notifications open the correct item.

## Voice

- Participant can explicitly start and stop microphone capture.
- Live transcript is visible.
- AI can ask at least one dynamic follow-up based on the answer.
- Participant can switch to typing without losing session context.
- Microphone-denied and provider-failure states are handled.

## Review

- Participant can see structured "Here's what we understood" items.
- Participant can confirm, change, or reject supported items.
- Final submission uses the reviewed version, not the original AI interpretation.

## Pulse

- Pulse status moves correctly through not started, in progress, review, complete.
- Team status shows only authorized completion metadata.
- User sees completion only after server acknowledgment.

## Meetings

- App can render avoided, shortened, and required meeting states.
- Required meetings include purpose, outcome, why the participant is needed, and estimated time.
- Pre-meeting brief works from real backend data.

## Work

- Confirmed commitment appears in Work.
- Commitment detail shows outcome, due date, source, and definition of done where present.
- Mark-complete behavior is server-authorized.

## Continuous discovery

- Clarification flow can resolve a conflict.
- Something Changed can create a reviewable structured submission.
- Submission can generate a proposed graph delta without silently changing canonical graph state.

## Privacy/security

- Tokens are stored in secure native storage.
- No background microphone activation.
- All mobile APIs enforce participant/company authorization.
- User-facing privacy language accurately describes server-side processing.

---

# 35. Recommended Build Sequence for Claude Code

Claude Code should not attempt to wire every AI/provider integration on day one.

## Phase 0: Repo and design audit

1. Inspect current React Native project.
2. Identify whether it uses Expo, navigation library, state-management library, and theme system.
3. Identify Claude Design artifacts and reusable components.
4. Map every existing screen to canonical routes.
5. Do not redesign approved UI.
6. Produce a short implementation plan before changing architecture.

## Phase 1: App shell and static flows

Build:

- route structure;
- bottom navigation;
- design tokens;
- Today;
- Work;
- Meetings;
- Me;
- static versions of all primary states.

Use typed mock data behind a repository/service abstraction.

## Phase 2: Domain models and API client

Implement:

- typed models;
- auth/session handling;
- API client;
- TanStack Query hooks;
- error handling;
- request lifecycle.

Replace mock data route by route.

## Phase 3: Pulse without voice

Implement complete Pulse using typed text responses first:

- start;
- agent question;
- participant answer;
- dynamic server follow-up;
- review;
- edit;
- submit;
- team status.

This proves orchestration and state before audio complexity.

## Phase 4: Voice transport

Add:

- microphone permissions;
- audio session;
- streaming upload;
- transcript rendering;
- TTS playback where configured;
- pause/stop;
- retry;
- switch-to-text.

## Phase 5: Jev and facilitator prompt pack

Wire:

- context builder;
- Jev judgment adapter;
- conversation state machine;
- versioned facilitator prompts;
- follow-up policy;
- review-item extraction.

## Phase 6: Meetings and commitments

Wire:

- meeting-mode outcomes;
- pre-meeting brief;
- meeting wrap-up;
- commitments;
- Work screen;
- notifications.

## Phase 7: Continuous discovery

Wire:

- Clarification;
- Something Changed;
- graph-delta proposals;
- source lineage.

## Phase 8: Hardening

Complete:

- offline behavior;
- retries/idempotency;
- accessibility;
- analytics;
- E2E tests;
- security review;
- performance profiling;
- crash reporting;
- release configuration.

---

# 36. Claude Code Implementation Rules

1. **Do not redesign the Claude Design frontend.** Treat approved visuals as source of truth.
2. **Do not turn mobile into the desktop app.** Keep participant scope narrow.
3. **Do not expose Jev or internal confidence terminology.** Translate judgment into plain-language product behavior.
4. **Do not silently update canonical DutyGraph state from an unconfirmed participant statement.** Create proposed deltas and preserve evidence lineage.
5. **Do not hardcode provider-specific logic into domain components.** Use adapters.
6. **Do not bury the facilitator prompt in route code.** Prompt packs are versioned first-class assets.
7. **Do not use one generic meeting prompt.** Use core personality plus mode-specific modules.
8. **Do not ask a human for information already known unless confirming a change or resolving a conflict.**
9. **Do not over-question.** Optimize for information value per unit of human time.
10. **Do not fake completion while offline.** Server acknowledgment is authoritative.
11. **Do not promise "nothing leaves the device before Send" if server-side transcription or AI processing is active.** Use accurate privacy copy.
12. **Do not add native video conferencing to MVP.** Use existing meeting-provider join paths.
13. **Do not put company financial meeting-cost analytics into ordinary employee mobile UI.** Show personal time returned instead.
14. **Preserve participant ability to review DutyGraph's interpretation before confirming an async submission.**
15. **Keep deterministic logic deterministic.** Use Jev for judgment, not arithmetic or authority enforcement.

---

# 37. Definition of Done for the First Production Pilot

A real pilot team must be able to run the following without mock data:

1. An admin creates a Monday Operations Pulse from the main DutyGraph system.
2. Five or more employees receive mobile notifications.
3. Each employee completes a personalized async voice or text conversation.
4. DutyGraph asks dynamic follow-up questions when appropriate.
5. Each participant reviews and confirms the structured interpretation.
6. Team completion status updates in near real time.
7. The backend synthesizes the completed Pulse.
8. Meeting orchestration determines whether a live follow-up is needed.
9. Participants receive one of:
   - meeting eliminated;
   - meeting shortened;
   - live meeting required.
10. Required participants receive a pre-meeting brief.
11. A resulting commitment can be confirmed and appears in My Work.
12. A participant can report "Something Changed" and produce a proposed DutyGraph delta.
13. No unconfirmed statement silently overwrites canonical DutyGraph state.
14. The system has a complete audit trail from source interaction to structured output.

If this loop works reliably, the app has proven the core thesis:

> DutyGraph can replace significant amounts of recurring meeting time with short, context-aware async conversations while continuously improving the organization's operating map.

---

# 38. Open Technical Decisions

These should be resolved during implementation planning rather than guessed silently.

## Voice providers

Select STT and TTS providers based on:

- latency;
- interruption support;
- accuracy;
- cost;
- enterprise privacy;
- streaming API quality;
- mobile network resilience.

Keep the provider abstraction regardless of initial choice.

## Conversational model

Select the runtime model based on:

- turn latency;
- instruction following;
- structured-output reliability;
- context-window needs;
- cost;
- enterprise data handling.

The coding agent used to build the product is not automatically the runtime model.

## Live meeting integration

Potential approaches include:

- meeting API integration;
- meeting bot;
- transcript ingestion;
- real-time media integration;
- companion-device capture.

Do not block the async mobile MVP on this decision.

## Raw audio retention

Define enterprise policy before production launch.

Recommended default is minimal retention, but the exact policy must be approved.

## Team-status visibility

The concept is settled. The precise permissions model needs company-role rules.

## Communication preference learning

Do not ship inferred long-term participant profiling until the data model, UX, privacy approach, and confidence behavior are explicitly approved.

---

# 39. Final Product Mental Model

DutyGraph Companion should not feel like an AI audit application installed by an employer.

It should feel like this:

> Instead of going to another meeting, DutyGraph asks me exactly what it needs to know. It remembers the context, asks smart follow-ups, lets me correct what it understood, keeps track of what I committed to, and only pulls me into a live meeting when I actually need to be there.

Underneath that simple experience is a much deeper architecture:

```text
DutyGraph business context
        ↓
Participation request
        ↓
Jev judgment
        ↓
Versioned facilitator prompt + interaction state
        ↓
Natural voice/text conversation
        ↓
Structured interpretation
        ↓
Participant confirmation
        ↓
Statements / actions / decisions / deltas
        ↓
Updated operational state
        ↓
Meeting necessity re-evaluated
```

The mobile application is the human interface to that loop.

That is the product Claude Code should build.
