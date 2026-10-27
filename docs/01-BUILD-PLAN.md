# 01 · Build plan: phases Codex runs without stopping

This is the order of work. Each phase lists its goal, the tasks, the files, the checks that must pass, and what to do when something blocks you. Finish a phase, commit, then start the next. Do not wait for a person between phases.

## Working rules for the whole run

1. **Never stop to ask.** When a choice is open, use [11-DECISIONS-AND-DEFAULTS.md](11-DECISIONS-AND-DEFAULTS.md). When it does not cover the case, pick the option that is safest for privacy, smallest to undo, and closest to the existing code. Write it in `DECISIONS-LOG.md` (date, phase, choice, reason) and continue.
2. **Keep it green.** After every phase: `npm run verify` in `mobile/`, `npm test` and `npm run typecheck` in `dev-server/`, and `npm run test:shared && npm run typecheck:shared` at the root. Fix a failure before you move on. Never skip, delete or weaken a test to get green. If an existing seed test fails because you changed behaviour on purpose, update the test and say why in the commit message.
3. **Commit per phase** (or smaller): `phase N: <what>`. Update `PROGRESS.md` in the same commit: the phase, what is done, what is not, the check results.
4. **Expo has changed since your training data.** The seed pins Expo SDK 57 and React Native 0.86. Before you use an Expo or React Native API, read `mobile/AGENTS.md` and the versioned docs (`https://docs.expo.dev/versions/v57.0.0/`, index at `https://docs.expo.dev/llms.txt`). Add packages with `npx expo install <pkg>`, never `npm install`, inside `mobile/`.
5. **No network in tests.** Every provider is faked in tests. No test needs `OPENAI_API_KEY`.
6. **No secrets anywhere** in the repo, the app bundle, logs or fixtures. Env var names only.
7. **Fictional data only.** Reuse the seed's people (Cobalt: Noah Reed, Alex Rivera; the logistics demo: Dana Okafor) and add more fictional ones as needed (for example Larkspur Supply: Dana Whitlock, COO; advisor Alex Moreno; Priya Shah, Marcus Lee).
8. **Screens use the repository, never `fetch`.** Add each operation to `mobile/src/api/repository.ts`, implement it in `mock/` and `http/`, add a hook in `mobile/src/hooks/queries.ts`. The `http` adapter rejects with `NOT_AVAILABLE` for anything the target server lacks.
9. **Shared logic stays pure.** `shared/hands-free/` imports nothing outside itself: no zod, no Node, no DOM, no React Native. Add tests in `tests/` for every reducer change.
10. **If a native capability cannot be verified in this environment** (real microphone, WebRTC, push, App Links), build it behind its interface, cover the logic with fakes in Jest, and record "not run on a device" in `PROGRESS.md`. Do not claim it works on a phone.
11. **If you are blocked for more than about 30 minutes on one problem**, write the problem and what you tried in `PROGRESS.md` under "Blocked", build the rest of the phase around it (a stub behind the interface), and continue with the next task.
12. **Budget is not a constraint.** Prefer thorough tests, full states and polish over speed. When all phases are done, run the "Extra passes" at the end of this file.

---

## Phase 0 · Workspace

**Goal:** a new repository that installs and passes every seed check.

Tasks:
1. Create the repository `dutygraph-mobile`. Copy everything in `seed/` to its root, keeping the layout: `mobile/`, `shared/`, `contracts/`, `server/companion/`, `tests/`, `package.json`, `tsconfig.json`. The app imports `../shared/hands-free` and generates types from `../contracts/companion-mobile.openapi.json`, so the layout must stay as it is.
2. Copy `reference/` into `docs/reference/` (read-only source material) and this package's `PRD.md` and `docs/*.md` into `docs/`.
3. Root: `npm install`, `npm run test:shared` (48 tests pass in the seed), `npm run typecheck:shared`.
4. `cd mobile && npm ci && npm run verify` (29 suites, 312 tests pass in the seed; a "worker process has failed to exit gracefully" note at the end is known and harmless).
5. Add `.github/workflows/ci.yml`: Node 24, root tests and typecheck, `mobile` verify and `npx expo export --platform web`, and later `dev-server` tests.
6. Create `PROGRESS.md`, `DECISIONS-LOG.md`, and a root `README.md` (what the repo is, how to run each part, the env vars by name).
7. Rename the app's display name to "DutyGraph" in `mobile/app.json` only if [11-DECISIONS](11-DECISIONS-AND-DEFAULTS.md) says so (it says: keep "DutyGraph Companion" and the bundle id `com.dutygraph.companion`).

Checks: all of the above pass. CI file is valid YAML.

If `npm ci` fails on a native postinstall download behind a proxy, retry once, then use `npm ci --ignore-scripts` and note it.

## Phase 1 · Dev server skeleton

**Goal:** a local server that stands in for DutyGraph's future endpoints, with fake providers.

Read: [07-BACKEND-AND-API.md](07-BACKEND-AND-API.md), `docs/reference/server-reference/mobile-participant.ts` and `mobile-auth.ts` (the real handler style), `seed/contracts/companion-mobile.openapi.json`.

Tasks:
1. `dev-server/` with its own `package.json` (Node 22+, `"type": "module"`, Express 5, zod 4, tsx, `node:test`). Port `4417` by default (`PORT`).
2. Error shape `{ code, message, retryable, requestId }` with the same codes as the contract. Idempotency middleware: same key and same body returns the saved result; a different body for that key is `409 IDEMPOTENCY_CONFLICT`; missing key on a command is `400 IDEMPOTENCY_REQUIRED`.
3. **Participant API, fake mode** at `/api/mobile/v1`: implement enough of the pinned contract from fixtures (enroll with a dev invitation token, refresh, logout, me, requests, request detail with hints, coverage, understand, submit, transcriptions, task cards, attest) that the app's `http` adapter runs end to end against it. Validate request bodies with zod schemas matching the contract (reuse `shared/mobile-contracts.ts` where it fits).
4. **Proxy mode**: when `DUTYGRAPH_ORIGIN` is set, forward `/api/mobile/v1/*` to it unchanged (headers, body, status), and serve only the new endpoints locally.
5. **Provider interfaces** (`dev-server/src/providers/`): `TextToSpeechProvider`, `LiveTranscriptionGrantProvider`, `TranscriptionProvider`, `ConversationModelProvider`, `JudgmentProvider`, `RealtimeSessionProvider`, each with a `fake` implementation (deterministic) and an `openai` implementation used only when `OPENAI_API_KEY` is set. Match the interfaces in `shared/companion-judgment.ts` where they exist.
6. Store: in memory, with optional persistence to `DEV_SERVER_DATA_FILE` (JSON). Seed it with the fictional companies and people.
7. `GET /health` returns `{ ok, mode: "fake" | "proxy", providers: { tts: "fake" | "openai", … } }`. No secret in it.
8. Tests (`node:test` with `supertest` or `fetch` against an ephemeral port): error shape, idempotency, enroll/refresh rotation and replay (`401 REFRESH_REPLAY`), request detail hints, submit idempotency.

Checks: `cd dev-server && npm test && npm run typecheck`. The app with `EXPO_PUBLIC_DATA_SOURCE=http` and `EXPO_PUBLIC_API_BASE_URL=http://localhost:4417` runs the hands-free flow on the web export against the fake server (write a small Playwright script, `mobile/scripts/e2e-web.mjs`, that opens `/questions/<id>`, types answers on every card, reviews and sends).

## Phase 2 · Design system pass

**Goal:** every component the new screens need, built from the tokens, and a gallery to review them.

Read: [03-DESIGN-SYSTEM.md](03-DESIGN-SYSTEM.md), `docs/reference/design/companion-mobile/screens/*.png`, `mobile/src/theme/tokens.ts`, `mobile/src/components/common/`.

Tasks:
1. Audit `mobile/src/components/common` against the captures. Fix any drift from the tokens.
2. Add the new primitives listed in 03 (Section "New components"): `Row`, `SectionHeader`, `SegmentedControl`, `PersonChip`, `TimerRing`, `RecordingIndicator`, `SpeakingIndicator`, `ConsentRow`, `ProposalCard`, `TaskCardView`, `AnswerCard`, `CoachPanel`, `ParkedList`, `EmptyState`.
3. A dev-only route `/dev/gallery` (shown only with mock data) that renders every component in every state, dark and light.
4. Screenshot script: extend `mobile/scripts/screenshot-web.mjs` so `--all` captures every route listed in 03 into `docs/screens/` (dark and light).

Checks: Jest render tests for each new component (labels, roles, 44 pt targets); screenshots exist.

## Phase 3 · Voice out on the cards (voice-to-voice, part 1)

**Goal:** each card reads its question aloud; nudges are spoken; the microphone opens when the voice ends; the person can talk over it.

Read: [04-VOICE.md](04-VOICE.md) Sections 3 and 4, `shared/hands-free/deck.ts`, `mobile/src/features/handsfree/useHandsFreeDeck.ts`, `docs/reference/docs/COMPANION-HANDS-FREE.md` §2 and §3.

Tasks:
1. **Reducer** (`shared/hands-free/deck.ts`): add the option `speak: boolean` to `createDeck`. Add phase `speaking`, events `speechOutStart { lineId }`, `speechOutEnd { lineId }`, `speechOutError { lineId }`, `bargeIn`. Add effect `deckVoice(state) → { lineId, text, kind: "question" | "nudge" | "line" } | null`. Rules: on a new card with `speak`, go to `speaking`; on `speechOutEnd` go to `listening` (no fixed 1300 ms wait); words heard during `speaking` are ignored unless the caller sends `bargeIn`, which stops speech and moves to `listening` keeping no words from the speaking window; a nudge due while words are coming is not spoken; with `speak: false` the deck behaves exactly as today (all existing tests stay green unchanged). Add `DECK_TIMING.speakFallback` (if `speechOutEnd` never arrives, listen after the line's estimated duration plus 1500 ms).
2. Tests in `tests/hands-free-deck-voice.test.ts`: question spoken then listening; barge-in; nudge suppressed while talking; speech error falls back to listening; pause during speaking stops speech and resumes by replaying the question; Previous and Add more do not replay; the else card is spoken; review line is spoken once.
3. **Dev server**: `POST /api/mobile/v1x/voice/lines` (participant or advisor bearer) with `{ requestId?, lines: [{ id, text }] , voice? }` returns `{ lines: [{ id, url, hash, durationMs }] }`. Cache by `sha256(voice + text)` on disk under `DEV_SERVER_AUDIO_DIR`. `GET /api/mobile/v1x/voice/audio/:hash.mp3` serves it. The fake provider returns a short silent MP3 with a duration estimated from word count (150 words per minute). The OpenAI provider calls the speech endpoint with `TTS_MODEL` (default `gpt-4o-mini-tts`) and `TTS_VOICE` (default `marin`). Rate limit per request and per tenant. Never log the text.
4. **App**: `mobile/src/features/voice/out/` with a `VoiceOut` interface (`prepare(lines)`, `play(lineId)`, `stop()`, events `start`, `end`, `error`), implementations `server` (download and cache with `expo-file-system`, play with `expo-audio`), `device` (`expo-speech`), `silent` (for tests and when off). `createVoiceOut()` picks server, then device, then silent.
5. **Audio session**: set the audio mode for play-and-record with voice processing where the platform supports it; duck others; respect the iOS silent switch rule chosen in 11-DECISIONS (default: play even in silent mode while the deck is open, because the person chose voice).
6. **Hook**: `useHandsFreeDeck` drives `deckVoice`: prepares all lines when the deck starts, plays the current line, sends `speechOutEnd`, sends `bargeIn` when the live speech source reports speech while speaking (any interim result with at least 2 words, or a level above the threshold for 300 ms).
7. **UI**: Speaking label and glyph on the card and caption box; tap the question to replay; **Me › Voice** gets "Read questions aloud" (default on) and "Voice speed" (0.9, 1.0, 1.1).
8. Mock repository: return voice lines with the fake silent audio and the simulated speech that waits for the line to end.

Checks: reducer tests; hook tests with fake timers, a fake VoiceOut and the simulated speech; web export runs the deck with spoken lines (device voice in the browser).

## Phase 4 · Speech in upgrades

**Goal:** the best available live transcript, with a backup recording and honest fallbacks.

Read: [04-VOICE.md](04-VOICE.md) Section 2, `docs/reference/web-reference/handsfree/speech/` (the web OpenAI WebSocket source, PCM conversion, item-id merging), `docs/reference/server-reference/live-transcription.ts`, `shared/hands-free/recorded.ts`.

Tasks:
1. **Dev server**: `POST /api/mobile/v1x/requests/:id/live-transcription` (namespace in 07) mints a client secret exactly as `live-transcription.ts` does (`POST {OPENAI_API_BASE_URL}/realtime/client_secrets`, transcription session, PCM 24 kHz, keywords from the hints and company name, fixed prompt, `delay: low`, `noise_reduction: near_field`); fake provider returns `{ available: false, reason: "NOT_CONFIGURED" }` or, with `FAKE_LIVE_TRANSCRIPTION=1`, a grant for the local fake realtime WebSocket server (`dev-server/src/fake-realtime.ts`) that streams scripted deltas and completions.
2. **App source** `mobile/src/features/voice/live/openai.ts`: opens the WebSocket with subprotocols `["realtime", "openai-insecure-api-key." + secret]`, sends `input_audio_buffer.append` with base64 PCM16 mono 24 kHz chunks every ~100 ms, `commit` on the deck's pause, reads `…input_audio_transcription.delta` and `.completed` merged by `item_id`. Microphone PCM capture: use a maintained Expo-compatible module that streams PCM frames (check with `npx expo install`; if none works in SDK 57, write a small Expo module or fall back and record the decision). The source label is `voice_openai`.
3. Order of sources per 04 Section 2, with the web's fallback rules: socket fails to open (twice) → device recognizer; device recognizer missing → recorded clip; no microphone → typing.
4. **One microphone across cards** with `reset()`; **watchdog** (sound for 6 s and no words → restart, at most 3 times a card).
5. **Backup recording** while a spoken card listens; on live-word failure with speech, keep the clip in app storage and transcribe it on reconnect (`POST /requests/:id/transcriptions`), then apply `recorded` to the deck.
6. Consent and Why sheet name the service in use.

Checks: unit tests for PCM conversion, message builders, delta/completed merging, fallback order, watchdog, backup queue; the fake realtime server test.

## Phase 5 · Transcribed cards and Task Cards

**Goal:** the review shows proper answer cards; Task Card checks use the four choices.

Read: [03-DESIGN-SYSTEM.md](03-DESIGN-SYSTEM.md) Sections "Answer card" and "Task Card", `docs/reference/web-reference/TaskCheckLink.tsx`, `TaskReviewCard.tsx`.

Tasks:
1. `AnswerCard` on "Here's what we heard": short title, polished text (editable), Show what I said, source line, skipped reason, edited mark. Edits are word-level marks if cheap; otherwise an "Edited" label.
2. `TaskCardView` and the check flow at `/confirmations/[requestId]`: one card per screen on phones, swipe or Next, four choices, a note, review, one Send. "This is right" calls the real attest; the other three call the dev server's proposed `POST /api/mobile/v1x/task-cards/:id/decision` (with the real server, they are kept in the pending queue and the screen says "Your advisor will see this when your app is updated." — record this as a known gap).
3. Read Task Cards aloud (voice-out) when Read questions aloud is on: title, then each row label and value, at the person's tap only.

Checks: screen tests for every state; attest body still matches the contract test in the seed.

## Phase 6 · Advisor session and Meeting Center

**Goal:** an advisor can sign in on the phone, scoped to one company, and see the Meeting Center.

Read: [07-BACKEND-AND-API.md](07-BACKEND-AND-API.md) "Advisor session", `docs/reference/docs/advisor-react-native-app.md` (platform rules), `docs/reference/docs/voice-walkie-talkie.md` §4.2.

Tasks:
1. Dev server: `POST /api/mobile/meetings/v1/advisor/pair` (the web shows a QR with a one-time pairing code; in dev, `GET /dev/pairing-code?company=<id>` prints one), returns a company-scoped advisor session (15-minute access, rotating refresh, role `advisor_mobile`), `POST …/advisor/session/refresh`, `POST …/advisor/session/logout`, `GET …/advisor/me`.
2. App: a role switch at start ("I was invited to answer questions" → existing enroll; "I run meetings for a company" → scan QR with `expo-camera`, or paste the code). Separate secure-store keys per role. The tabs change by role (advisor: Meetings, Capture, Me; participant: Today, Work, Meetings, Me, per scope).
3. Meeting Center screen (advisor): sections Needs planning, Upcoming, Live now, Needs review, Recent. Rows, not cards.
4. Biometric app lock option for the advisor role (`expo-local-authentication`), default on when available.

Checks: auth tests (pair, refresh rotation, replay, logout revokes), screen tests.

## Phase 7 · Meeting Builder (POWER) and Meeting Gate

**Goal:** plan a meeting on cards, get a type, an agenda and a gate result.

Read: [05-MEETING-OS.md](05-MEETING-OS.md) Sections 1 to 4, `server/companion/prompts/facilitator/meeting-doctrine.md`, `shared/companion-judgment.ts` (`MeetingMode`, `MeetingType`, judgment schemas).

Tasks:
1. Builder flow `/meetings/new`: title and time, then five POWER cards on the hands-free deck (each card has its own chips, for example Purpose → "Why now", "What decision or result"; Outcomes → "Decision made", "Status known", "Owner named"), answered by voice or text. Then attendees from the company roster with one or more roles each (Decision maker, Influencer, Resource person, Executor, Needs to know).
2. Dev server `POST /api/mobile/meetings/v1/meetings` (create from POWER), `POST …/meetings/:id/plan` returns `{ meetingType, agenda: [{ topic, minutes, forPersonIds, questions }], gate: { mode, reason, requiredPersonIds, releasedPersonIds, liveMinutes } }`. The fake judgment uses deterministic rules (05 Section 4); the OpenAI judgment uses a strict JSON schema from `shared/companion-judgment.ts` and is validated with `parseJudgment`, falling back to the safe default.
3. Plan screen: type with a one-line reason, agenda rows with editable minutes (deterministic sum shown, never computed by a model), gate card with the recommendation and three buttons (Send a Pulse instead, Hold a shorter meeting, Hold it as planned). The leader's choice is recorded.
4. Participant side: the existing avoided / shortened / required screens read the dev server's gate result; "time returned" = minutes not spent (deterministic).

Checks: rule tests for the fake gate; schema tests; screen tests.

## Phase 8 · Pulse

**Goal:** an async Pulse replaces a status meeting.

Read: [05-MEETING-OS.md](05-MEETING-OS.md) Section 5, `docs/reference/docs/companion-mobile-north-star.md` §8, `server/companion/prompts/modes/pulse.md`.

Tasks:
1. Dev server: `POST …/meetings/:id/pulse` creates a Pulse for the attendees with questions built from each person's earlier commitments and open items (deterministic templates first; with `followUps: ai`, the conversation model may rephrase within the voice-style rules). participant routes `GET /api/mobile/v1x/pulses/:id`, `POST /api/mobile/v1x/pulses/:id/responses` (idempotent), `GET /api/mobile/v1x/pulses/:id/team-status` (completion only).
2. App: the Pulse runs on the hands-free deck with spoken questions (Phase 3), then "Here's what we understood" review, submit, team status. Reuse the seed's Pulse screens in `full` scope where they fit.
3. After all responses: the dev server computes which items need live discussion and who is needed (deterministic rules plus the judgment), and the leader gets "Live discussion required: 14 minutes. Required: …" or "No meeting needed".

Checks: Pulse completion logic tests; team status never contains answer text (test it).

## Phase 9 · Live meeting: Capture and Copilot

**Goal:** record an in-person meeting on one phone with consent, a live transcript and a silent coach.

Read: [05-MEETING-OS.md](05-MEETING-OS.md) Sections 6 to 8, `docs/reference/docs/voice-walkie-talkie.md` §5.

Tasks:
1. Start screen: attendees (from the plan; add a guest by name and role, who becomes a proposed person), mode (Capture, Copilot, Facilitator), budget estimate.
2. Consent screen: the consent statement to read aloud (from 05), one row per attendee with a consent tap; "Declined" excludes the person. Recording cannot start until every attendee is consented or excluded. Store consent time, app version, notice version.
3. Recording: `expo-audio` at 32 kbps mono AAC, rolling 5-minute segments, each with a SHA-256 checksum, queued for chunked upload (`POST …/sessions/:id/segments`, 512 KB chunks, resumable). Survives app background (iOS background audio mode while recording only; Android foreground service with a persistent notification, configured through config plugins in `app.json`). Visible red indicator and timer. Pause and resume.
4. Live transcript: the live speech source (Phase 4) streams words to the screen; committed segments go to the dev server (`POST …/sessions/:id/transcript`) with ids and revisions. The full recording is the evidence of record; the dev server's fake batch transcription returns scripted segments with diarized speaker clusters S1, S2…
5. Copilot panel (leader's screen): current topic and its timer ring (warn at 80 %, offer "2 more minutes / Park it / Next topic" at 100 %), the prominent next question for a named person, a "still needed" list from the outcomes, flags for missing owner, missing decision authority, drift and contradictions (from `POST …/sessions/:id/coach`, called every ~20 s of committed speech or on topic change; never shown while someone is mid-sentence for less than 4 s of silence). **Park it** adds the current item with speaker and time.
6. Offline: recording continues; the coach shows "Coach paused. Recording continues."

Checks: consent gate tests; segment rotation and checksum tests; upload resume tests; coach timing tests with fake clocks.

## Phase 10 · Facilitator mode

**Goal:** the AI runs a short meeting by voice at set moments only.

Read: [05-MEETING-OS.md](05-MEETING-OS.md) Section 9, [04-VOICE.md](04-VOICE.md) Section 5, `server/companion/prompt-pack.ts` and every file in `server/companion/prompts/`.

Tasks:
1. Dev server: move `server/companion/prompt-pack.ts` into the dev server's use (import it; keep it pure). `POST …/sessions/:id/facilitator/turn` with the trigger (`opening`, `timebox_end`, `silence`, `leader_next`, `slot_empty`, `closing`) composes the twelve layers with `composeFacilitatorPrompt()` (mode from the meeting type), calls the conversation model (fake: scripted lines), records `promptVersion`, and returns `{ text, addressedToPersonId?, action }` where `action` is one of the facilitator action vocabulary in 05.
2. App: the facilitator speaks the returned text with VoiceOut (default provider `tts_lines`). Big controls: **Mute AI**, **Skip**, **Next topic**, **Stop AI**. Stopping the AI never stops the recording. The AI never speaks while speech is being detected; it waits for 1.2 s of silence, and gives up after 8 s and shows the line on screen instead.
3. Optional provider `realtime` (flag): `POST …/sessions/:id/realtime` mints an OpenAI Realtime WebRTC session (`gpt-realtime-2.1`, `create_response: false`, voice from `TTS_VOICE`, instructions from the prompt pack) and the app uses `react-native-webrtc` (development build only; record "not run on a device"). Responses are created only on the trigger events.
4. Opening statement (05 Section 9) and the introductions round ("Please each say your name and your role"), used later for speaker mapping.

Checks: trigger tests (the AI never speaks outside the six triggers in a scripted run); mute/stop tests; prompt composition records version and hash.

## Phase 11 · Closing ritual and Meeting Results

**Goal:** the meeting ends with clear decisions, actions and owners, and the leader reviews proposals.

Read: [05-MEETING-OS.md](05-MEETING-OS.md) Sections 10 and 11, `server/companion/prompts/modes/meeting-wrap-up.md`, `prompts/facilitator/closing.md`.

Tasks:
1. Closing ritual screen (and spoken in Facilitator mode): decisions, actions (owner, date), open questions, parked items, contradictions, proposed changes. Each owner confirms their item ("Confirm" / "Change" / "Not mine") on the leader's phone or later on their own app.
2. Dev server `POST …/sessions/:id/finish` runs extraction (fake: from scripted segments) into `MeetingProposal` records with source segment ids, quotes and speaker clusters.
3. Results screen: speaker mapping (suggested from the introductions round, the leader confirms; unmapped stays "Unknown speaker" and cannot supply attributed claims), then proposals grouped by kind, each on a `ProposalCard` with Accept / Reject / Edit; parked items → "Send as follow-up question to <person>" (creates a proposed question request).
4. Participant wrap-up: each attendee gets a confirmation request in Today for the items about them.
5. Export: `GET …/sessions/:id/export` returns a Markdown summary and JSON (for the team to import into DutyGraph later).

Checks: proposals always carry at least one segment id; an unmapped speaker cannot be the source of an accepted attributed claim (test); edits to a transcript segment mark dependent proposals stale (test).

## Phase 12 · Kickoff guide and walkie-talkie setup

**Goal:** advisor information-gathering on the phone.

Read: [06-INFORMATION-GATHERING.md](06-INFORMATION-GATHERING.md), `docs/reference/shared-reference/kickoff-guide.ts`, `docs/reference/docs/leadership-meeting-workspace.md`, `kickoff-capture.md`, `voice-walkie-talkie.md` §3 and §4.

Tasks:
1. Kickoff guide: a meeting of type `executive_kickoff` whose agenda is the eight topics with their questions (ported from `kickoff-guide.ts`, generic version without the business-template probes, plus the probes for the company's business type when known). Attributed notes: a speaker picker (attendees), a note field per topic, autosave to secure storage every 2 s and on background, restore after restart. Answers to research gaps become claim proposals (`fieldPath`, value, quote, speaker).
2. Walkie-talkie setup: a request type `setup` with setup topics (business type, value-chain stages, departments, roles, people and reporting lines, goals, systems, one real work example) on the deck; answers go to `POST …/setup/:id/understand` and return setup proposals (`fieldPath`, value, quote, missingFields) for review on the phone.
3. Measurement questions on every task-level card: unit of work, how often (usual week), how long one takes "about how long do you think it takes?" (no comparison buttons). Chips: "What one unit is", "How many a week", "Minutes for one".

Checks: notes survive restart (test with mocked storage); proposals carry speaker and quote.

## Phase 13 · AI follow-ups and auto-advance (flags)

**Goal:** the two open product rules can be switched on safely.

Tasks:
1. `followUps: "ai"`: the coverage response may include `followUp: { text, hintId }` (dev server: the conversation model with voice-style and anti-overquestioning layers, at most 20 words, must ask only about `hintId`, rejected if it contains a question already answered). The deck speaks it instead of the table nudge for that hint; it counts as a nudge.
2. `autoAdvance: true`: the careful version in [04-VOICE.md](04-VOICE.md) Section 3.6.
3. Both flags in Me › Developer (mock) and in the dev server config (`GET /api/mobile/v1x/config`).

Checks: reducer tests for auto-advance (cancels on any word; never fires while speaking or with chips missing); follow-up length and topic tests.

## Phase 14 · Hardening

Tasks:
1. Accessibility pass: labels, announcements for every deck and meeting state, focus order, Dynamic Type at the largest size on every screen, reduced motion.
2. Every error and empty state from 03 and 09 exists and has a test.
3. E2E: Maestro flows in `mobile/e2e/` for flows A to H in [09-TESTING-AND-QA.md](09-TESTING-AND-QA.md) (written, and run on the web build with Playwright where Maestro cannot run here).
4. EAS profiles: `development`, `preview` (mock data), `staging` (dev server URL from env), `production` (DutyGraph origin). Config plugins for background audio, foreground service, camera, speech recognition, microphone strings with accurate copy.
5. Write `contracts/meeting-mobile.openapi.json` (OpenAPI 3.1) for every new endpoint the dev server serves, and a contract test that checks the dev server against it.
6. Write `dev-server/sql/proposed-migrations.sql` (see 07) and `docs/PORTING-TO-DUTYGRAPH.md` (which endpoint goes to which server file, which tables, which env vars, which tests).
7. `dev-server/scripts/rehearse-openai.ts`: only with `OPENAI_API_KEY`, makes one TTS line, mints one live-transcription secret and opens the socket for 3 s of a bundled WAV, prints timings. Not part of tests.
8. Final `README.md`, `PROGRESS.md` (built / not built / not run on a device), `DECISIONS-LOG.md`.

## Extra passes (when every phase is done)

Run these in order, committing after each:
1. **Red team** the app and dev server for privacy leaks (logs, analytics, push payloads, caches), token handling, idempotency gaps, prompt injection through transcript text. Fix what you find. Write `docs/REDTEAM.md`.
2. **Design review**: compare every screenshot with the captures and 03; fix drift.
3. **Copy review**: every string against ASD-STE100 and the copy rules in 03. Fix.
4. **Test depth**: raise coverage of `shared/`, `mobile/src/features/handsfree`, `mobile/src/features/meetings` and `dev-server/src` to at least 90 % lines; add property-style tests for the deck reducer (random event sequences never reach an invalid state, never end a card while words arrive, never open the mic while speaking).
5. **Demo polish**: a mock-data "Demo tour" in Me › Developer that walks a viewer through the flows A to H with one tap per step.
