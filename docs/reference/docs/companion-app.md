# DutyGraph Companion app

The participant-facing phone app for DutyGraph. It is the better version of the emailed "answer the questions" link: the same participant, the same server write path (`/api/mobile/v1`), plus Pulses, meeting outcomes, commitments and continuous discovery from the [Companion PRD](#product-scope).

- Source: [`mobile/`](../mobile/) (Expo SDK 57, React Native 0.86, Expo Router, TypeScript).
- How to run it: [mobile/README.md](../mobile/README.md).
- Visual source of truth: [design/companion-mobile](design/companion-mobile/README.md) (Claude Design prototype and per-screen screenshots).
- Server contract it consumes: [companion-mobile-api.md](companion-mobile-api.md) and [contracts/companion-mobile.openapi.json](../contracts/companion-mobile.openapi.json) (v1.2 on branch `matt/companion-hands-free`; v1.1 on `matt/dev`).
- Hands-free question cards (the default scope on branch `matt/companion-hands-free`): [specs/COMPANION-HANDS-FREE.md](specs/COMPANION-HANDS-FREE.md) and [below](#hands-free-question-cards).
- Facilitator prompt pack and judgment types (server side, not wired yet): [server/companion/](../server/companion/), [shared/companion-judgment.ts](../shared/companion-judgment.ts). See [Server-side facilitator foundations](#server-side-facilitator-foundations).

## What a participant can do

With `EXPO_PUBLIC_COMPANION_SCOPE=questions` (the default) the app shows only the question cards, Today (question requests and task checks) and Me; the Notifications screen lists question items only. The other rows below need `full`, which restores PR #48's app.

| Area | What they see | Route |
| --- | --- | --- |
| Question cards (default scope) | Intro ("6 quick questions about your work") → one card per question: the person talks, chips turn sage as the card's topics are heard, Next lights up and the person taps it (a card never moves on by itself, October 18), Got it and the next slides in → "Anything else?" → "Here's what we heard" (each answer editable) → one Send → Sent. Pause, Skip (three reasons), Type instead, Previous / Add more, Keep talking. | `/questions/:id`, `/questions/:id/{deck,review,sent}`; `/discovery/:id` redirects there |
| Onboarding | Invitation → "Is this you?" → notifications permission. Voice consent is asked the first time they choose voice, not up front. | `/invite`, `/identity`, `/permissions/notifications`, `/permissions/microphone`, App Link `/mobile/enroll?t=` |
| Today | What DutyGraph needs now: Pulse, confirmation and clarification cards with estimated time and due chip; "Later"; "Done today"; a banner when a meeting was avoided. | `/today` |
| Pulse | Intro (topics, why asked) → voice or text conversation with follow-ups → "Here's what we understood" review → submitted → team completion status. | `/pulse/:id`, `/conversation`, `/review`, `/complete`, `/team-status` |
| Meetings | Upcoming, replaced-by-async, shortened and recent meetings; avoided / shortened / required outcome screens; pre-meeting brief; live companion (post-MVP, read-only); wrap-up confirmation. | `/meetings`, `/meetings/:id/{avoided,shortened,required,brief,live,wrap-up}` |
| Work | Commitments due today / this week, things they are waiting on, completed; commitment detail with definition of done; server-authorized "Mark complete". | `/work`, `/work/commitments/:id`, `/work/waiting/:id` |
| Continuous discovery | Clarification (one tap, or a short conversation for "It's more complicated"); Something Changed; discovery interviews. | `/clarifications/:id`, `/something-changed`, `/discovery/:id` |
| Confirmation | Review items DutyGraph took from a meeting before they count as the participant's. | `/confirmations/:requestId` |
| Me | Profile, personal time returned, notification and voice preferences, privacy, appearance, sign out; a Developer panel with condition toggles in demo mode. | `/me`, `/me/{notifications,voice,privacy,appearance}` |

Every conversation that is not a Pulse uses `/session/:sessionId` → `/review` → `/done`. Notification payloads carry one of these routes; `useNotificationRouting` only follows allow-listed prefixes.

## Architecture

```text
src/app/            Expo Router routes (one file per screen, canonical PRD paths)
src/features/       Flow logic: conversation (state machine, screens, pending-submission sync),
                    voice (capture abstraction), notifications, pulse, meetings, commitments, …
src/components/     common/ (ScreenShell, TopBar, Card, StatusChip, buttons, states, overlays),
                    navigation/, voice/, review/, requests/, meetings/, work/, me/
src/api/            repository.ts (the only data boundary), mock/ (fictional data + scripted engine),
                    http/ (the /api/mobile/v1 adapter), generated/ (types from the OpenAPI file)
src/hooks/          TanStack Query hooks (caching, polling, invalidation)
src/state/          Zustand stores: preferences (persisted), session, UI (toast/sheet/offline), simulation
src/storage/        SecureStore wrappers: tokens, pending submissions, text drafts
src/theme/          Tokens from the design (dark/light), ThemeProvider
src/utils/          Deterministic time/due logic, ids
```

Hands-free code: `shared/hands-free/` (hint table, local coverage, the deck reducer, the submission builder; shared with the server and web), `src/features/handsfree/` (screens, the `useHandsFreeDeck` hook, drafts), `src/components/handsfree/` (cards, chips, deck, caption, bar, sheets) and `src/features/voice/live/` (live speech).

**One data boundary.** Screens call hooks in `src/hooks/queries.ts`, which call `CompanionRepository`. `EXPO_PUBLIC_DATA_SOURCE` picks the implementation:

- `mock` (default): `MockCompanionRepository`. With the `questions` scope: fictional Noah Reed at Cobalt, answering Alex Rivera's 6 questions (and a second, 2-question request). With `full`: fictional Dana Okafor at a fictional logistics company, ported from the prototype. It behaves like the server where it matters: it owns turn order, dedupes turns by utterance id, asks a dynamic follow-up when an answer is too short, makes submits idempotent, and never exposes other people's answers in team status.
- `http`: `HttpCompanionRepository` against the pinned contract (1.2 on this branch). See [what works against the real server today](#what-works-against-the-real-server-today).

**Server-owned conversation, client view state.** The server owns canonical conversation state (PRD §12). The phone keeps a small pure view-state machine (`src/features/conversation/machine.ts`: prompting → answering → sending → prompting | closing, with paused, micError, providerError and offlineDraft branches) and sends each answer with a client-generated utterance id, so a retry cannot duplicate a turn.

**Review before commit.** The review screen edits a local copy of "Here's what we understood". Submitting sends the reviewed version (changed wording; items left unchecked are sent as they are for the server to judge) with an idempotency key. The pending submission is written to secure storage *before* the request and removed only when the server acknowledges it or answers with a terminal error. "Try again" reuses the same key; `usePendingSubmissionSync` retries on launch, on return to the foreground and every 60 seconds. "Finish later" does not queue anything, so nothing is sent without the participant's tap. Completion screens appear only after the server responds; if one is opened without a stored result it asks the server and otherwise offers "Go to review".

**Voice.** `src/features/voice` defines a capture interface with two implementations: a simulated capture for demo data (streams a sample answer as a live transcript) and a recorded-clip capture for the real server (expo-audio records; on "Done answering" the clip goes to `POST /requests/{id}/transcriptions`, and the transcript appears in an editable box, "Here's what we heard", with "Record again", before the turn is sent). The server's live streaming endpoint returns 501 today, so there is no live partial transcript against the real server yet. The microphone opens only after the participant chooses voice and consents on this device, shows a visible listening state with text (not just color), and is released on pause, "Type instead", leaving the screen or backgrounding the app (resuming needs a tap). A turn that fails offline or at the provider offers Retry (same utterance id), Continue by typing, or Save and finish later.

**Privacy copy (PRD §13).** The consent screen and `/me/privacy` say that answers may be processed securely while the participant speaks so DutyGraph can transcribe and ask follow-ups, and that nothing is recorded as their confirmed answer until they review and send it. The app never promises that nothing leaves the device.

**Auth.** Enrollment exchanges the invitation token from the App Link for a participant mobile session (bearer access + rotating refresh token), stored only in the Keychain/Keystore via `expo-secure-store`. The HTTP client refreshes once, single-flight, and ends the session on refresh replay. Only `/mobile/enroll` is an App Link (decision D16); `409 USE_WEB_LINK` opens the original link in the browser.

## Hands-free question cards

Built on branch `matt/companion-hands-free` from the Claude Design screens (`docs/design/companion-mobile/screens/hf-*.png`). The spec is [specs/COMPANION-HANDS-FREE.md](specs/COMPANION-HANDS-FREE.md).

- **The deck is a pure reducer** (`shared/hands-free/deck.ts`) with the prototype's timings. Timers, speech and server answers are events; the hook `useHandsFreeDeck` schedules the one timer the reducer asks for, turns the microphone on and off as `deckMic` says, and runs the server check. Pause, leaving the screen and backgrounding the app pause the deck and turn the microphone off; a server answer that arrives then waits until the person resumes.
- **Chips are the only progress signal.** Each card has 1 to 3 "Try to cover" hints from a hand-written table (`shared/hands-free/hints.ts`), or `request.data.questionHints`. The words are matched locally as the person talks; with an approved AI connection the server check (`POST /requests/{id}/coverage`) may add hint ids, never text. Nudges come from the table. At most 2 nudges, then the card is Saved. No scores or AI terms on screen.
- **Live speech** (`src/features/voice/live/`): `native` uses `expo-speech-recognition` (on-device where the phone supports it, interim results); `simulated` plays the prototype's sample answers for demo data; `unavailable` starts the cards in typing.
- **Drafts and sending.** The answers, "Here's what we heard" and review edits are kept per request in secure storage, so a restart resumes at the first unanswered card. Send builds the same per-question record as the web team page (`toSubmission`), saves it with its idempotency key before the request, and shows Sent only after the server acknowledges it. Logout removes the drafts and any unsent answers from the phone.
- **Notifications.** A push for a work request reads "<Advisor> has N questions for you · about M minutes" under the company name, never question text, and a tap opens `/questions/<id>` (task checks open `/confirmations/<id>`).

## What works against the real server today

Contract 1.1 was built for the web answer link, so the adapter maps what exists and reports the rest honestly:

| App feature | Server today | Adapter behavior |
| --- | --- | --- |
| Enroll, refresh, logout, profile | `/enroll`, `/session/*`, `/me` | Full |
| Question cards (1.2, this branch) | `/requests/{id}` with `key`, `short`, `hints`, `advisorName` | Full; a 1.1 server gets hints from the local table |
| Coverage check (1.2) | `/requests/{id}/coverage` | Merged with the local check; unavailable (no AI connection, sample company, limits, errors) means the local check stands. Not rehearsed with a real provider |
| Here's what we heard (1.2) | `/requests/{id}/understand` | Polished, editable text; unavailable means the person's own words |
| Hands-free send (1.2) | `/requests/{id}/submit` words path with per-question fields | Same record shape as a web team answer (integration-tested), idempotency key, pending retry |
| Today | `/requests` (work questions, task checks) | Work questions become Discovery cards, task checks become Confirmation cards |
| Discovery conversation | `/requests/{id}` questions | Walks the advisor's questions in order; no dynamic follow-ups (no server facilitator yet) |
| Voice answers | `/requests/{id}/transcriptions` | Recorded clip upload |
| Review | `/requests/{id}/understanding` | Proposed tasks become review items; if understanding is unavailable (429/503/504) the participant sends their own words for advisor review |
| Submit | `/requests/{id}/submit` | Reviewed wording, `participantConfirmed`, proposal hash, idempotency key |
| Task checks | `/task-cards/{id}`, `/attest` | Each confirmed card attested with its exact version and hash |
| Pulses, team status, meetings, briefs, wrap-up, commitments, clarifications, Something Changed, notifications feed, preferences | not built | Tabs show empty states; detail screens say "not available on your account yet" |

The server work needed for the rest is listed in [Next steps](#next-steps).

## Server-side facilitator foundations

Nothing here runs yet; it is the base for the conversation endpoints.

- **Prompt pack** (`server/companion/prompts/`, version in `pack.json`): core facilitator, Carson Tate *Work Simply* meeting doctrine (purpose, outcomes, who, execution, responsibility, plus evidence and coverage) as an internal checklist, voice style, anti-overquestioning, closing, and eleven modes (Pulse, discovery, clarification, change report, decision, problem-solving, brainstorming, team-building, instructional, informational, meeting wrap-up). Edit these like code; every change changes the content hash.
- **Composer** (`server/companion/prompt-pack.ts`): `composeFacilitatorPrompt()` assembles the twelve PRD §11.1 layers in order and returns `promptVersion` (e.g. `companion-prompts@2026-09-29.1/pulse`), a content hash and per-layer hashes to record on each session. Participant text, context and prior judgments go into delimited data blocks that cannot close themselves, so an answer like "ignore previous instructions" stays data.
- **Judgments** (`shared/companion-judgment.ts`): the `MeetingJudgmentService` interface (meeting mode and type, follow-up need, topic relevance, evidence sufficiency, decision readiness, contradiction, close readiness), zod schemas, a never-throwing `parseJudgment`, fail-safe defaults (no follow-up, not ready to close), and `toParticipantFacing()` which strips scores, confidence and rationale before anything reaches a participant. It also holds the provider interfaces (speech-to-text, text-to-speech, conversation model, meeting provider) and the pure conversation and meeting state machines. Jev judges; deterministic code handles time, permissions, ids and records.
- Tests: `tests/companion-prompt-pack.test.ts`, `tests/companion-judgment.test.ts` (including the PRD §33.3 conversation-simulation scenarios as fixtures for future model evaluations).
- When it is wired for hosting, add `server/companion/prompts/**` to `includeFiles` for `api/index.ts` in `vercel.json`, or the pack will not load on Vercel.

## Testing

| What | Command | Covers |
| --- | --- | --- |
| App unit and screen tests | `cd mobile && npm test` | 29 suites, 309 tests (October 9, 2026, branch `matt/companion-hands-free`), including the hands-free deck, intro, review and sent screens, live speech, drafts, the HTTP 1.2 adapter and the scope switch. The original 21 suites cover: view-state machine, review logic, pending submissions, mock repository behavior (idempotent turns and submits, dynamic follow-up, team status without answers), both voice captures, HTTP adapter (auth refresh, error mapping, request bodies validated against `shared/mobile-contracts.ts`), and the Today, Work, conversation, review and done screens |
| App typecheck | `cd mobile && npm run typecheck` | Strict TypeScript, typed routes |
| Bundle | `cd mobile && npm run export:web` | The app builds without a device |
| Visual review | `node scripts/screenshot-web.mjs …` | Compare with `docs/design/companion-mobile/screens/` |
| Server foundations | `npx tsx --test tests/companion-prompt-pack.test.ts tests/companion-judgment.test.ts` | Prompt composition and judgment contracts |
| Hands-free shared logic and server | `npx tsx --test tests/hands-free-*.test.ts tests/mobile-hands-free.test.ts` (DB env loaded) | Hints, local coverage, the deck reducer (pause, Add more, server answers), submission parity with the web page; coverage gate, understand, submit parity and push copy against local PostgreSQL with fake providers |

Not tested on a phone yet: native speech recognition (`expo-speech-recognition`), microphone release on background, VoiceOver and TalkBack on the cards and sheets, Dynamic Type on the cards (the deck grows with the text size, estimated rather than measured), push delivery and taps. The coverage and understand calls have not been run against a real AI provider.

## Product scope

The PRD this build follows is summarized here; the design prototype is authoritative for visuals.

- **Participant-first.** No advisor tools, company-wide graph admin, raw Jev scores, confidence percentages, evidence-state terms, unrestricted directory, or company meeting-cost analytics (personal time returned only).
- **Voice-first, not voice-only.** Every voice step has "Type instead".
- **Interpretation is not truth.** Participant confirmation is their understanding, not company authority; Something Changed creates proposed graph deltas.
- **No shame mechanics.** Not started, In progress, Complete, Due, Overdue — no streaks, rankings or scores. Team status shows completion only, never answers.
- **Meeting time is earned.** The app renders the server's meeting-mode outcome (avoided, shortened, required) in plain language.

## Next steps

Server (in this repository), in the PRD's build order:

1. **Pulse and conversation endpoints** (`/mobile/today`, `/pulses/:id`, `/pulses/:id/team-status`, `/conversations`, `text-turn`, `review`, `review-items`, `submit`) behind a contract 1.2 revision. Claim a migration number for pulses, pulse participants, conversation sessions, utterances and interpretation items (forced RLS, runtime grants).
2. **Wire the facilitator**: `server/companion/prompt-pack.ts` composes the versioned prompt layers and records `promptVersion`; `shared/companion-judgment.ts` defines the Jev judgments (follow-up need, close readiness, contradiction). Add `server/companion/prompts/**` to `includeFiles` in `vercel.json` when it runs hosted.
3. **Meetings and commitments**: meeting-mode outcomes, briefs, wrap-up confirmation, commitments with server-authorized completion.
4. **Continuous discovery**: clarifications, change reports producing proposed graph deltas, notifications feed and `PUT /me/push-token` (deferred in 1.1).
5. **Streaming voice** (the 501 stream-ticket path) for live partial transcripts.

Fields and endpoints the screens already expect (found while building against contract 1.1):

- `/requests`: a completion timestamp (for "Done today"), and a "requested by" line for discovery.
- Submit: more than one `transcriptJobId` (a multi-clip answer links only the last), structured edit fields for a changed review item (free text goes into `instructions` today), and a way to answer a task check with "not mine" or a correction (cards are confirm-only in the app).
- Profile: personal time returned this month and its counts (the Me card shows demo numbers only), company/team name, server-stored notification and voice preferences, `PUT /me/push-token`.
- Live meeting state: participant count and provider, the "still needed" line and a hand-raise endpoint (raise hand is local only).
- Review: a notice for the `gaps` the understanding step names, and an explicit "words unreviewed" flag on the submit result.
- iOS Universal Links: an `apple-app-site-association` file on `respond.dutygraph.com` and `dutygraph.com`.

App:

- Swap each mock-only screen to the HTTP adapter as its endpoint lands (the adapter already rejects with `NOT_AVAILABLE`, so it is one method at a time).
- Device QA on iOS and Android development builds: microphone, App Links on `respond.dutygraph.com` (see [HOSTING](HOSTING.md)), push delivery, font scaling, VoiceOver/TalkBack.
- E2E flows A–F from the PRD (§33.4) with Maestro or Detox on a development build.
