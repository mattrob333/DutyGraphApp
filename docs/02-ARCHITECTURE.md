# 02 · Architecture

## 1. Repository layout (after Phase 1)

```text
dutygraph-mobile/
  package.json, tsconfig.json   root: shared logic tests and typecheck (tsx --test)
  shared/
    hands-free/                 pure deck logic shared with DutyGraph's web and server (deck, coverage, hints, recorded, submission, types)
    meetings/                   NEW pure logic: meeting types, gate rules, closing checklist, time boxes, Pulse completion
    companion-judgment.ts       judgment enums, zod schemas, parseJudgment, toParticipantFacing, conversation + meeting state machines
    mobile-contracts.ts, answer-sources.ts, participant-understand.ts   zod contracts used by tests and the dev server
  server/companion/             facilitator prompt pack (prompt-pack.ts + prompts/**.md); used by the dev server
  contracts/
    companion-mobile.openapi.json   the real participant API, v1.3 (do not change its meaning; copy of DutyGraph's file)
    meeting-mobile.openapi.json     NEW: the proposed API this build adds
    design-tokens.json              the web app's tokens (reference)
  tests/                        root node:test tests for shared/ and server/companion/
  mobile/                       the Expo app (from the seed)
  dev-server/                   NEW: Express 5 stand-in for DutyGraph's future endpoints
  docs/                         PRD, these docs, reference/, screens/, PORTING-TO-DUTYGRAPH.md, REDTEAM.md
  PROGRESS.md, DECISIONS-LOG.md, README.md
```

## 2. App layers (keep the seed's architecture)

```text
src/app/          Expo Router routes, one file per screen; (tabs)/, (auth)/, questions/, pulse/, meetings/, advisor/ (new), dev/ (new)
src/features/     flow logic: handsfree/ (useHandsFreeDeck), conversation/, voice/ (live/, out/ new, record/ new), meetings/ (new: builder, live, closing, results), advisor/ (new), notifications/, auth/
src/components/   common/, handsfree/, voice/, review/, meetings/, work/, me/, advisor/ (new)
src/api/          repository.ts (the only data boundary) → mock/ and http/; generated/ (contract types)
src/hooks/        TanStack Query hooks for every operation
src/state/        Zustand: preferences (persisted), session, role (new), ui, simulation
src/storage/      expo-secure-store wrappers: tokens (per role), pending submissions, drafts, meeting notes (new), upload queue (new)
src/theme/        tokens and ThemeProvider
```

Rules (from `mobile/AGENTS.md`):
- **Screens never call `fetch`.** Repository → hook → screen.
- **Server is authoritative.** Never show completion before the server acknowledges. Commands carry an idempotency key; pending work is stored before sending.
- **Participant-only screens never show** advisor tools, raw judgments, scores or others' answers. Advisor screens live under `src/app/advisor/` and only render with an advisor session.
- **Proposals are not truth.**
- **Design tokens only.**

### Repository growth

Split the interface by role to keep it readable:

```ts
interface CompanionRepository { … }          // existing participant operations (seed)
interface ParticipantExtrasRepository { … }  // v1x: voice lines, live transcription grant, task-card decision, pulses, wrap-up confirmations, config
interface AdvisorRepository { … }            // meetings/v1: pair, people, meetings, plan, route, pulse, sessions, consent, segments, transcript, coach, park, facilitator, finish, speakers, proposals, export, kickoff, setup
```

Each has `mock` and `http` implementations. `http` rejects with `CompanionApiError('NOT_AVAILABLE')` when its base URL is unset or the server answers 404/501.

## 3. State machines (who owns what)

| Machine | Owner | Where |
| --- | --- | --- |
| Hands-free deck (cards, chips, speaking, listening, checking, nudges, holds) | Pure reducer | `shared/hands-free/deck.ts` |
| Conversation view state (Pulse and session screens) | Pure reducer | `mobile/src/features/conversation/machine.ts` |
| Canonical conversation state | Server | `shared/companion-judgment.ts` `CONVERSATION_TRANSITIONS` (dev server) |
| Meeting lifecycle (REQUESTED … COMPLETE) | Server (dev server) | `shared/meetings/lifecycle.ts` (new, pure) |
| In-session facilitator state (OPEN … CLOSE) | Server, validated by `nextMeetingState` | `shared/companion-judgment.ts` |
| Live meeting view (recording, topic timer, coach refresh, AI speaking) | Pure reducer in the app | `mobile/src/features/meetings/liveMachine.ts` (new) |
| Recording segments and upload queue | App, persisted | `mobile/src/features/voice/record/` (new) |

Every hook that drives a reducer follows the seed pattern in `useHandsFreeDeck.ts`: the reducer returns effects (one timer, mic on/off, a server check, a voice line); the hook schedules exactly what the effects say and sends events back. Timers, microphones and audio are events, never hidden state.

## 4. Data flow: a spoken interview card

```text
GET /requests/{id} ──► buildQuestions (hints) ──► createDeck({ speak: true })
POST /v1x/voice/lines (all lines) ──► download to cache
card shows ─► phase speaking ─► VoiceOut.play(question) ─► speechOutEnd ─► listening
mic (one session) ─► LiveSpeech.onText ─► deck speech event ─► coverLocally ─► chips light
pause 900 ms ─► checking ─► POST coverage (≤ 2.5 s) ─► merge ─► nudge? ─► (silent?) speak nudge ─► listening
all chips heard ─► Next lit ─► tap Next (or autoAdvance) ─► Got it hold ─► next card
… ─► review ─► POST understand ─► AnswerCards ─► Send ─► store pending ─► POST submit (Idempotency-Key) ─► Sent
```

## 5. Data flow: a facilitated meeting

```text
Builder (POWER cards on the deck) ─► POST /meetings ─► POST /meetings/{id}/plan ─► gate card ─► leader's choice
  └─ hybrid ─► POST /meetings/{id}/pulse ─► participants answer on their phones ─► second gate ─► shorter live part
Start ─► consent (all attendees) ─► POST /sessions ─► recording (segments → upload queue) + live transcript (committed segments → server)
  Copilot: POST /coach every ~20 s of committed speech or on topic change ─► CoachPanel
  Facilitator: trigger (opening | timebox_end | silence | leader_next | slot_empty | closing) ─► POST /facilitator/turn ─► VoiceOut.speak (after 1.2 s silence)
Closing ritual ─► owners confirm ─► POST /finish ─► batch transcript + diarization + extraction ─► speaker map ─► proposals review ─► export
```

## 6. Offline and failure

- Recording never depends on the network. Segments are written to app storage and uploaded later; the upload queue is persisted and resumable (per-chunk checksums).
- Notes, drafts and pending submissions are stored before any request and retried with the same idempotency key on launch, on foreground and every 60 s (the seed's `usePendingSubmissionSync`).
- When the coach or facilitator cannot reach the server: "Coach paused. Recording continues." / the AI stops speaking; the leader can continue by hand.
- Provider down at finish: keep the recording, retry the job; the leader can still type notes.
- Budget reached: live voice stops, recording continues.

## 7. Security boundaries

- No provider keys, database URLs or advisor web cookies in the app. Short-lived client secrets only (live transcription, realtime), minted per session by the server, never logged.
- Token storage per role in the Keychain/Keystore; biometric lock for the advisor role; logout removes drafts, notes, pending work and cached audio for that role.
- Deep links: allow-listed routes only (`useNotificationRouting` pattern).
- Prompt injection: all transcript and participant text goes to models inside data blocks; model output is parsed and validated (zod) and never executed as an action without the policy layer's check.
- Logs and analytics: ids, counts and durations only. No words, names of meeting topics, or audio.
