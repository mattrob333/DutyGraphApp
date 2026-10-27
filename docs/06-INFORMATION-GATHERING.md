# 06 · The information-gathering tool

How DutyGraph collects knowledge from people, and which parts this app owns.

## 1. The discovery chain (built in the web app)

Each step feeds the next. Read `reference/docs/kickoff-capture.md` and `leadership-meeting-workspace.md`.

```text
1. Research (outside-in only)      website, LinkedIn, news, job posts → a Company Snapshot with labelled facts
2. Sponsor packet (first touch)    the main contact corrects the facts ("Is this right?"), answers a few
                                   targeted questions, uploads or types the team list, talks about the team
3. Executive kickoff               the leadership meeting: 8 topics, attributed notes ("who said what"),
                                   answers to research gaps become proposed fact updates
4. Team interviews                 each employee answers personal questions on the hands-free cards
5. Task Cards                      answers become proposed Task Cards; the employee checks them;
                                   the advisor accepts; then Opportunities and agents
```

Rules that hold across the chain:
- **Outside-in research never lists insider facts as "not found".** Goals, approvers, team lists and wait times are asked, not searched.
- **Every answer is a proposal** until a person accepts it. A participant's approval records their understanding, not company authority or agent permission.
- **Unknown is a valid answer.** "I don't know yet" and "Someone else should answer this" are first-class skip reasons, routed as open questions.
- **Contradictions are kept**, both sides with their sources, until resolved.

## 2. What this app owns

| Step | In this app | Today |
| --- | --- | --- |
| Sponsor packet | No (web link only, decision D16: `/invite/<token>` and `/account-link/…` open in the browser; the app must not claim those paths) | Web |
| Executive kickoff | **Yes, for the advisor**: the kickoff guide with attributed notes and optional Capture/Copilot recording (Phase 12) | Web guide exists (`KickoffCallGuide`, `KickoffPlanPanel`); notes are not autosaved there |
| Team interviews | **Yes, for the participant**: the hands-free cards, now voice-to-voice (Phases 3 to 5) | Built in the seed app and on the web |
| Task Card check | **Yes, for the participant** (Phase 5) | Attest built; the other three choices are proposed |
| Setup by voice ("walkie-talkie") | **Yes, for the advisor or owner** (Phase 12) | Not built |
| Pulse, clarifications, Something changed | **Yes** (Phase 8; the seed has screens on mock data) | Server not built |

## 3. Team interview questions (the cards)

- Questions come from the advisor's request (`GET /requests/{id}`): each has `key` (`question.N`), `short` (≤ 40 characters), and `hints` (1 to 3 chips: `id`, `label`, `nudge`, `cues`). The app adds the "Anything else?" card.
- Without server hints, `buildQuestions` in `shared/hands-free/hints.ts` builds them from a hand-written table (every role-family question in `team-question-templates.ts` has a short title and hints), then keyword rules, then a generic pair ("What happens" / "A recent example"). **No AI writes chips.**
- The interview moves through: Responsibility → Duty → Task → Trigger → Inputs → Actions → Decisions → Exceptions → Outputs → Handoffs. Prefer a **recent real example** over a hypothetical ("Tell me about the last time you…").
- **Measurement (owner's rule, October 24 to 26):** every task-level question set asks for the **unit of work** (what one unit is: an order, an invoice, a call), **how often** (a usual week, and a busy week if it differs), and **how long one takes** ("About how long do you think one takes?"). No comparison anchors or estimate buttons (the owner rejected them on October 26). The role templates already ask "About how many hours a week does this take?" as ranges; keep that question where it exists.
- Time estimate for the intro: `minutesFor(count)` (about 30 seconds a question).

Example card set (fictional, Cobalt, Noah Reed, from the seed's mock data): see `seed/mobile/src/api/mock/handsFree.ts` and the prototype's `HF_Q`.

## 4. "Here's what we heard" and submit

- `POST /requests/{id}/understand` returns polished text per answer (the same as the web team page's `/team/understand`, shared limit 8 per request and 120 per company in 24 hours). A refusal is `200 { available: false, reason }`: show the person's own words.
- Submit (`POST /requests/{id}/submit`, the "words path"): `understanding: null`, `understandingUnavailable: true`, `attestation` without `understandingHash`, plus `questionAnswers`, `questionUnderstood`, `questionSuggestions`, `questionResponses` (`unknown` | `wrong_role`), `responseText` (the else card), `questionAnswerSources`; limits 4000 characters per answer, 400 per suggestion, 30000 for `responseText`, at most 12 keys. Build it with `toSubmission`. `Idempotency-Key`, `expectedVersion`, `contentHash`. Result `reviewState: "words_unreviewed"`: "Your answer is saved. Your advisor will review it."
- Pending submissions go to secure storage before the request and are retried with the same key until acknowledged. Sent shows only after the server acknowledges.

## 5. Task Cards

- The record (web schema, `shared/domain.ts` `task`): title, duty, ownerId, performerId, purpose, trigger, inputs, instructions, output, destination, systems, humanGate, valueStage (receive, prepare, check, decide, deliver, unmapped), mode (human_only, ai_assist, ai_draft, ai_recommend, ai_execute_with_approval, ai_execute_bounded, prohibited), classification (Known, Inferred, Assumed, …), conflict, reviewDue.
- The participant sees `TaskCardView.data`: duty, purpose, trigger, inputs, instructions, output, systems, humanGate, destination, mode. **Never show `mode` or classification to a participant** as a technical term; the advisor decides those.
- A card is "confirmed" in DutyGraph only when the advisor reviewed it and the owner and performer confirmed it. The app's attest records the participant's confirmation of that exact version (`recordVersion`, `contentHash`).

## 6. Executive kickoff guide (advisor, Phase 12)

The eight topics, in order (from `reference/shared-reference/kickoff-guide.ts`; the web version is longer and advisor-facing; on the phone, show a short spoken form and the full text behind "Show the full question"):

| # | Topic | Phone question (short) |
| --- | --- | --- |
| 1 | Business model and value flows | "What do you provide, to whom, and what result do they value? Walk me through one recent order from request to delivery." |
| 2 | Goals and evidence of success | "What should change in 1 month, 6 months and 1 year? Who owns each goal, and how do you measure it?" |
| 3 | Departments, people and reporting | "Name each department, its purpose and its leader. Who is in scope?" |
| 4 | Responsibilities under each role | "For each role, what ongoing duties does it keep? Who is accountable, and who does the work?" |
| 5 | One concrete task walkthrough | "Choose a typical task. What starts it, what comes in, what are the steps, and who gets the result?" |
| 6 | Dependencies and delays | "Where does work wait for another team? Give me a recent example." |
| 7 | Software, information and decision boundaries | "Which systems hold the source of truth? Which steps need a named person to approve?" |
| 8 | Agree the discovery follow-up | "Who should we interview next, and who sends the missing names and documents, by when?" |

Behaviour:
- Speaker picker (attendees) above the note field; each note is `{ speakerPersonId, topicId, text, at }`. Up to 80 notes of 6000 characters each per meeting (the web server's limit).
- Notes autosave to secure storage every 2 s and on background; restored after a restart. ("Notes typed during a call survive app switching, a phone call and a restart.")
- Answers to research gaps become **claim proposals**: `{ fieldPath, value, quote, speakerPersonId }`, up to 30 per save (web limit). The advisor accepts or rejects each one later in the web app.
- Optional: run the kickoff as a Meeting with Capture or Copilot mode; the eight topics are its agenda; the coach's "still needed" list uses the executive rubric: operating model and value delivery; goals with owners, measures, baselines, targets and dates; departments, people, reporting and duties; one real work example; handoffs and exceptions; systems and human decision boundaries; follow-up owners and dates.
- The Meeting OS north star's kickoff topics (business model, sources of value, outcomes over 6/12/18 months, growth vs profit vs acquisition, key departments, friction, initiatives, who has knowledge or authority) are discussion objectives, not a script.

## 7. Setup by voice ("walkie-talkie", Phase 12)

From `reference/docs/voice-walkie-talkie.md` §4. The advisor or the owner answers setup topics on the card deck: business type, value-chain stages, departments, roles, people and reporting lines, goals, systems, one real work example. Answers go to `POST /api/mobile/meetings/v1/setup/:id/understand` and return setup proposals `{ fieldPath, value, quote, missingFields }` the speaker confirms on the phone. Owner answers stay labelled "owner-supplied", never "verified".

## 8. Continuous refresh

Later triggers (new employee, owner change, software replaced, new approval step, a KPI drop) create a small question request for only the affected part. In this build: a "Something changed" report from a participant creates a **proposed** change, never a fact (the seed has the screens).
