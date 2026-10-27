# Companion hands-free question cards: build spec

**Status:** Built on branch `matt/companion-hands-free` (October 9, 2026): shared logic, server contract 1.2 and the app screens, with a review pass and its fixes. Checked with the root and app test suites and the web export (mock data). Not merged, not deployed, not run on a phone (native speech recognition, VoiceOver, Dynamic Type and push taps are untested on devices) and not rehearsed with a real AI provider. Time estimate (decided October 10): about 30 seconds a question, so "About 3 minutes" for 6 questions (`minutesFor` in `shared/hands-free/hints.ts`).
**Owner:** Matt. **Design:** [docs/design/companion-mobile/](../design/companion-mobile/), Claude Design's `DutyGraph_Companion_2.dc.html` (hands-free group in the left panel) and the `screens/hf-*.png` captures.

## 1. What and why

An employee gets the advisor's personalized questions (team discovery, step 5 of the sponsor-to-team flow). The Companion app opens on an intro ("6 quick questions about your work · About 2 minutes"), then shows one question per card. The person reads the card and talks. When DutyGraph has heard what the card asks for, the card turns sage with a check and "Got it", holds briefly with a "Keep talking" undo, then slides away and the next card slides in. No taps while answering. After the last card (and an optional "Anything else?"), "Here's what we heard" shows each answer polished and editable, and one **Send to Alex** button sends it.

Near term the app mirrors the web team page: the same questions, the same answer records, the same advisor view. Pulse, Meetings and Work stay in the code from PR #48 but are hidden by default (§6.1) until their server side exists ([north star](../vision/companion-mobile-north-star.md)).

Rules that bind this build (from CLAUDE.md, AGENTS.md and `mobile/AGENTS.md`):
- What the person says is a proposal until they review and send it; sending records their words for advisor review (`words_unreviewed`). Nothing here creates Task Cards or company truth.
- No scores, percentages, confidence or AI terms in the UI. Chips are the only progress signal.
- Accurate privacy copy: words are processed while the person speaks; nothing goes to the advisor until they tap Send. Never "nothing leaves the phone".
- Lock-screen text: company name and "<Advisor> has N questions for you · about M minutes". Never question or answer text.
- The model never writes text the person sees on a card. Nudges come from the hint table (§3); the server check returns hint ids only.
- Fictional data only (Cobalt, Noah Reed, Alex Rivera).

## 2. The design is the reference implementation

The prototype's script is a working state machine. Read it before writing the deck: in `docs/design/companion-mobile/DutyGraph_Companion_2.dc.html`, `HF_Q` (≈ line 1076, questions, chips, nudges, scripted utterances, polished text), `HF_SKIP`, and the `hf*` methods from `hfNew` to `hfJump` (≈ lines 1208–1400). Screens: `screens/hf-01-lock-screen.png` … `hf-22-send-failed.png` (390 × 844, dark). Serve the folder to click through it: `cd docs/design/companion-mobile && python3 -m http.server 8123`.

Timings in the prototype (keep them, as constants):

| Moment | ms |
| --- | --- |
| Card shown → microphone listening | 1300 |
| Words stop → check starts (pause) | 900 |
| No words at all → check anyway | 3200 (5000 on "Anything else?") |
| Checking shown at least | 750 |
| "A bit more" → listening again | 1600 |
| Got it hold (Keep talking visible) | 1300 |
| Saved hold | 1500 |
| Skipped hold | 1300 |

Rules (changed October 18 after Jesse's phone test, where cards moved on mid-sentence): **no card moves on by itself.** A spoken card checks after a pause and may nudge for a missing chip (at most 2 nudges), then keeps listening. **Next** is always in the bottom bar: quiet until every chip is heard, then lit, with "That covers it. Tap Next when you're ready."; tapping it ends the card as **Got it** (every chip heard) or **Saved** (some missing), never a failure, then the short hold (Keep talking still works). A typed card nudges once on Next, then the second Next saves it (October 16). A pause skips a card only when the whole answer is a skip phrase ("I don't know yet", "someone else should answer this", "skip this one"; `wholeSkip`); with more words it keeps listening, and Next reads the skip (`spokenSkip`). Going back shows "You said: …" and **Add more**; Add more reopens listening on that card and returns to the first unanswered card after. "Anything else?" waits for Next or "No, that's all", also after silence.

## 3. Shared logic: `shared/hands-free/`

Pure TypeScript used by the server, the web client and the Expo app (Metro watches this one folder; `mobile/metro.config.js`, alias `@shared/hands-free/*`). No imports from outside the folder, no zod, no Node or DOM APIs. Tests in `tests/hands-free-*.test.ts` (root `tsx --test`).

- `types.ts`: written; the contract (QuestionHint, HandsFreeQuestion, CardAnswer, CoverageResult, HandsFreeSubmission, …).
- `hints.ts`:
  - `hintsForQuestion(text) → { short, hints }`: deterministic, no AI. Every question that `shared/team-question-templates.ts` can produce (all role families, the duty questions, the gap questions) gets a hand-written short title and 1–3 hints with a nudge and cues. Unknown questions use keyword rules ("who", "how long", "tools", "decide", "wait", …) and then a generic pair ("What happens" / "A recent example").
  - `buildQuestions(questions, { advisorName?, stored? }) → HandsFreeQuestion[]`: keys `question.N` (0-based, the web's keys), stored hints win when the request carries `data.questionHints`, and the "Anything else <advisor first name> should know about your work?" card is last with `isElse: true`.
  - `minutesFor(count)`: the figure the web team page shows, `max(5, flow-model minutesFor(n) - 5)` = `max(5, 2n + 2)` (14 for 6 questions; tested against `client/src/sponsor/flow-model.ts`). The design's "About 2 minutes" does not come from this formula; changing it is a copy decision for both pages.
  - Also exported: `elseQuestionText(advisorName?)`, `StoredQuestionHints` (the `data.questionHints` shape: `{ "question.N": { text?, short?, hints: QuestionHint[] } }`; malformed entries are ignored, labels clipped to 40; an entry whose `text` is not the question's current wording is ignored, October 16), `advisorHint`, `questionHintsFromChips` and `chipsFromStored` (the composer's chip editor), `MAX_HINTS`, `MAX_HINT_LABEL`. `hintsForQuestion` also returns `source` (`table` / `pattern` / `keyword` / `generic`).
  - Cues: words or short phrases; `word*` matches any word starting with it; `@name` matches a capitalised name mid-sentence (for "Who" chips).
- `coverage.ts`:
  - `coverLocally(text, hints, already?) → CoverageResult` (source `local`): cue matching with light normalization.
  - `nudgeFor(hints, covered)`: the first missing hint's nudge.
  - `spokenSkip(text) → SkipReason | null`: the end of the answer only. The skip phrase must be its own sentence (give or take fillers such as "hmm", "honestly"); one short aside after it (6 words or fewer) is allowed, so the prototype's "Hmm. I don't know yet, honestly. It changes week to week." is a skip. With no punctuation, a text of 12 words or fewer that starts with the phrase also counts.
  - `mergeCoverage(local, serverIds, hints?)`: with `hints`, server ids are filtered to the card's hints and the nudge is recomputed.
- `deck.ts`: a pure reducer for one deck run. Framework-free and deterministic: timers, speech and server answers are events the caller sends. Final API (the UI hook builds on this):
  - `createDeck(questions, { mode?, micBlocked?, serverCheck?, offline?, answers? }) → DeckState`. `questions` come from `buildQuestions` (else card last). `answers` is a saved draft: the deck starts at the first unanswered card (`done` if none). `micBlocked` starts in typing with the note.
  - `deckReducer(state, event) → DeckState` (returns the same object when an event changes nothing).
  - `DeckState` fields the UI reads: `questions`, `total` (advisor questions, the 6 in "of 6"), `idx` (current card), `view` (past card on screen or null), `phase` (`ready | listening | checking | more | got | saved | skipped | done`), `mode` (`voice | text`), `typed`, `covered` (hint ids), `nudges`, `nudgeHint` (hint id whose nudge shows and whose chip pulses), `paused`, `sheet` (skip sheet open), `speechError`, `micBlocked`, `offline`, `answers` (`(CardAnswer | null)[]`, same order as `questions`; save this as the draft), `announce` + `announceId` (read `announce` aloud when `announceId` changes). Internal: `heard`, `live`, `attempt`, `session`, `timer`, `check`, `parked`, `seq`, `resumeTo`, `serverCheck`.
  - `DeckEvent`: `timer {id}`, `speech {session, text}` (full text since that microphone session started), `speechEnd {session}` (optional, recognizer end of utterance), `speechError {code: permission_denied | not_available | network | other, session?}`, `serverCoverage {checkId, covered: string[] | null}`, `pause`, `resume`, `keepTalking` (on Got it or Saved), `prev`, `fwd`, `return` (Back to question N), `addMore`, `openSkip`, `closeSkip`, `skip {reason}`, `toText`, `toVoice`, `typed {text}`, `next` (typing mode), `retry` (after a speech error), `finish` (No, that's all, else card only), `online {online}`.
  - Effects: `deckEffects(state) → { timer, mic, serverCheck }`, also separately:
    - `deckTimer(state) → { id, kind, ms } | null`: the one timer to have scheduled. When `id` changes, cancel the old one and schedule this; on fire send `{ type: "timer", id }`. Stale ids are ignored. Kinds: `listen`, `silence`, `pause`, `check`, `serverWait`, `advance`.
    - `deckMic(state) → { on, session, script }`: microphone on or off; restart it when `session` changes and tag speech with that session (old sessions are ignored). On in `listening`, `checking` and `more` (voice, not paused, no past card, no sheet, no error). `script` = `{ questionIndex, attempt }` for the simulated recognizer, null for free talk (after Add more or switching to voice).
    - `deckServerCheck(state) → { checkId, questionKey, text } | null`: with `serverCheck: true`, a check to run once per `checkId` while Checking (not offline, not the else card, something still missing). The deck waits at most `serverWaitMax` (2.5 s) from the start of Checking, then the local result stands.
  - View helpers: `shownIndex`, `deckText` (caption or typing text), `progressLabel` ("Question 2 of 6" / "One last thing"), `progressSegments` (`got | saved | skipped | current | todo` per advisor question), `cardStatus(state, i)`.
  - Constants: `DECK_TIMING` (the table in §2 plus `serverWaitMax` 2500 and the resume values `resumeToListen` 900, `resumeSilence` 2400, `resumeCheck` 600, `resumeMore` 1200, `resumeHold` 900 from the prototype's `hfResume`), `MAX_NUDGES` (2), `MAX_TYPED_NUDGES` (1), `SKIP_LABELS`. Each answer carries its `input` (the speech service, and whether the person typed); `toSubmission` sends it as `questionAnswerSources` on the web team link and, from Companion API 1.3, the app's submit; the app's speech is `voice_device` (October 16).
  - Announcements (prototype copy): "Question 2 of 6. <question>", "Heard: <chip>", "Checking", the nudge text, "Question 2 of 6, got it." / ", saved." / ", you don't know yet.", "One last thing. <question>", "Got it." (else card), "Paused. Microphone off.", "Listening again", "Question 3. <question> You said: …", "Back to question 4", "Question 2, listening. Add whatever you like.", "Typing. Tap Next when you are done.", "Microphone blocked. You can type instead.", "We couldn't hear that. Try again or type instead.", the offline notice, "Here's what we heard. Check it, then tap Send."
  - Small departures from the prototype, on purpose: words said during Checking or a nudge return to listening (the prototype had no live speech there); switching to typing pre-fills the box with what was said; Keep talking also works on Saved; Add more keeps any words already said on the card being left and gives them back on return; holds advance after a resume in typing mode too; a spoken skip is detected in voice mode only. A server answer that arrives while the deck is paused, a past card is open or the skip sheet is open is kept but waits: the card moves on only after the person resumes. Add more used again from an Add-more card returns to each card left, earliest first, with its words.
- `submission.ts`: `toSubmission(questions, answers, understood?, edits?) → HandsFreeSubmission`. Its `text` is exactly what the web page's `teamAnswerText` produces for the same answers (tested). `dontknow` → `unknown`, `someone` → `wrong_role`, plain skip → no entry. The "Anything else?" words → `responseText`. `edits` (review edits by key) replace the polished text, or the person's words when there is no polished text, as the web review does. Text is cut to the web limits (4000 per answer, 400 per suggestion, 30000 for `responseText`). `hasSomethingToSend(submission)` is the web page's "at least 1 answer or a note" rule.

## 4. Server: Companion mobile API 1.2 (additive)

Contract: `contracts/companion-mobile.openapi.json` → `1.2.0` with a "Revision 1.2" paragraph; `shared/mobile-contracts.ts` zod; `shared/companion-mobile-contract.ts` cases; `docs/companion-mobile-api.md`; regenerate `mobile/src/api/generated/companion-mobile-v1.ts` (`cd mobile && npm run contract:types`, CI checks it). 1.1 clients keep working.

1. **`GET /requests/{requestId}`:** each `ParticipantQuestion` gains `key` (`question.N`), `short` and `hints` ([{ id, label, nudge, cues }]); the detail gains `advisorName` (the request's sponsoring user's name, as the web team page shows it). Hints come from `request.data.questionHints` when present, otherwise `buildQuestions`. The "Anything else?" card is not sent; the app adds it.
2. **`POST /requests/{requestId}/coverage`:**
   - Request: `{ questionKey, text }`, with text up to 4000 characters. Response: `{ available: true, covered: string[] }` or `{ available: false, reason }`.
   - Gate: the same as `server/participant-understand.ts`: the company's approved AI connection, never a sample company, limits per request (120 in 24 hours) and per tenant (3000 in 24 hours), and an audit event `team.coverage_checked` with no text.
   - The model gets the question, the hint labels and the words as untrusted data. It answers hint ids only (JSON schema), and ids are filtered to the question's hints. Timeout about 4 s; any failure is `available: false`.
   - The text is not stored. No Idempotency-Key (no state change except the audit count).
   - Also add `POST /api/invitations/:token/team/coverage` with the same gate for the web page later, and `questionHints` on `GET /api/invitations/:token/team`.
3. **`POST /requests/{requestId}/understand`:** "Here's what we heard". Body and response are those of `POST /api/invitations/:token/team/understand` (`shared/participant-understand.ts`), with the same `understandGate` (event `team.understand_requested`, so web and phone share the limit).
4. **`POST /requests/{requestId}/submit`:**
   - The words path (`understanding: null`, `understandingUnavailable: true`) also accepts `questionAnswers`, `questionUnderstood`, `questionSuggestions`, `questionResponses` and `responseText` with the web team page's limits and key pattern. They are passed to `recordParticipantAnswer`.
   - The side effects must match the web team submit: the request goes to returned, the invitation is used, the receipt is queued, a gap-reply job and fill extraction are queued, and the audit trail is written. The integration test proves the advisor-visible response record is the same shape as a web submit.
   - Refuse the per-question fields together with a non-null understanding (422).
5. **Push copy:** `mobilePushBody` for a work request reads, for example, title "Cobalt" and body "Alex Rivera has 6 questions for you · about 2 minutes". Never question text. Check `server/mobile-notifications.ts` callers.

Tests: extend `tests/mobile-api.test.ts` (or a new `tests/mobile-hands-free.test.ts`) against local PostgreSQL with injected fake providers: hints on detail, coverage gate (no AI → unavailable, sample company → unavailable, limit, ids filtered, no text in audit), understand parity, submit parity with the web, 1.1 bodies still accepted. Run `npm run contracts` and `npx tsc --noEmit -p .`.

## 5. Mobile app: data layer

Repository methods (declared in `mobile/src/api/repository.ts`, types in `mobile/src/types/handsfree.ts`): `getQuestionSet`, `checkCoverage`, `understandAnswers` and `submitAnswers`. Implement them in both:

- **Mock** (default): Cobalt, Noah Reed, advisor Alex Rivera, due Friday, the prototype's 6 questions and chips, 1 extra request so Today has a list. `checkCoverage` returns `available: false` (the local check drives the demo, like the prototype). `understandAnswers` returns the prototype's polished text. `submitAnswers` is idempotent by key and honours the existing offline and send-failure simulation controls.
- **HTTP** (`/api/mobile/v1`, contract 1.2): map `GET /requests/{id}` into a `QuestionSet` using `buildQuestions` for the else card. `checkCoverage` → POST coverage; it never throws for 501, 503 or 429 (returns `available: false`). `understandAnswers` → POST understand. `submitAnswers` → POST submit (words path plus per-question fields, `Idempotency-Key`, `expectedVersion`, `contentHash`, an attestation without `understandingHash`). Put the pending submission in secure storage before sending and retry it with the same key, as the existing `pendingSync` does.
- **Live speech** (`mobile/src/features/voice/live/`, interface written in `types.ts`):
  - `native`: on-device recognition with interim results. Use the maintained Expo-compatible package (check `expo-speech-recognition` against Expo SDK 57 with `npx expo install`, and read its README). Add its config plugin and the iOS `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` strings with accurate copy. Prefer on-device recognition where the platform supports it. Release the microphone on stop, blur and background.
  - `simulated`: for the mock data source. It streams the prototype's scripted utterances two words at a time, every ~180 ms, per question and attempt.
  - `unavailable`: when neither works, the deck starts in typing mode.
  - Choose the implementation with `createLiveSpeech()`. Jest uses the simulated one or a fake.

## 6. Mobile app: screens

### 6.1 Scope switch

`EXPO_PUBLIC_COMPANION_SCOPE`: `questions` (default) or `full`. With `questions`, the tabs are Today and Me, Today lists question requests (and task checks) only, and Pulse, meeting and commitment cards and routes are hidden from navigation. `full` restores PR #48's app. Document it in `docs/ENVIRONMENT.md` and `mobile/README.md`.

### 6.2 Routes and components

Routes, following the design screen by screen:
- `src/app/questions/[requestId]/index.tsx`: the intro (hf-03). "Start with voice" goes through the existing microphone consent (hf-04 copy for this flow).
- `deck.tsx`: the card deck (hf-05 … hf-18).
- `review.tsx`: Here's what we heard (hf-19).
- `sent.tsx`: Sending, Sent and Send failed (hf-20 … hf-22).

Today's request card and the notification deep link open `/questions/<id>`. The old `discovery/[requestId]` route redirects there.

Components go in `src/components/handsfree/`:
- **ProgressSegments.**
- **QuestionCard:** border and background ease from surface to sage. The check scales in. Shows the eyebrow, Got it, Saved, Skipped or Paused label, the question, the violet nudge, "You said:" with Add more, and the chips.
- **HintChips:** each chip turns sage with a check, and the missing chip pulses once on a nudge.
- **CardDeck:** the next card peeks 12–16 px on the right. On advance the current card slides left with a slight tilt and the next springs in. Swipe right goes back. Reduced motion cross-fades.
- **CaptionBox:** dashed border, the LISTENING… / CHECKING / PAUSED label, the last 2–3 lines and the waveform.
- **DeckBar:** Pause, Skip, Type instead; Next in typing mode.
- **SkipSheet**, **OfflineNotice**, **SpeechErrorNotice**, **ReviewBlock** (editable polished text, Show what I said, A note for later, skipped reason) and **SentView**.

Use only theme tokens (`src/theme`) and the existing common components. Use the React Native `Animated` API unless a dependency is already installed.

The hook is `src/features/handsfree/useHandsFreeDeck.ts`. It drives `deckReducer` with timers, live speech, `coverLocally`, and `checkCoverage` (it waits at most 2.5 s, then the local result stands). It announces state changes with `AccessibilityInfo.announceForAccessibility`, keeps a draft in storage per request so a restart resumes, and passes answers to review.

### 6.3 Acceptance (mock data, web export at 390 × 844, and jest)

- From the intro, voice mode runs all 6 cards with one tap of Next per card (lit once its chips are heard): each card shows Got it, Saved or Skipped and advances, then reaches Here's what we heard (October 18; before, the cards advanced with no taps).
- Each design state is reachable and matches its `hf-*.png` capture in layout, copy and tokens.
- Keep talking undoes an advance. Add more on a past card works. Typing mode, mic blocked, speech error, offline, send failed and reduced motion behave as in §2.
- The finished screen appears only after the repository resolves the submit.
- VoiceOver labels and announcements exist; tap targets are at least 44 pt.
- Checks: `cd mobile && npm run typecheck && npm test -- --ci && npm run export:web`; root `npx tsc --noEmit -p .` and `npx tsx --test tests/hands-free-*.test.ts tests/companion-mobile-contract.test.ts tests/mobile-api.test.ts`.

## 7. Not in this build

- ~~Advisor editing of hints in the question composer.~~ Built October 16: the Discovery composer edits each team question's chips and saves them as `questionHints` (DEVLOG).
- The hands-free deck on the web team page: now §9 (October 10).
- Device builds (EAS), iOS Universal Links (needs the Apple Team ID) and store listing.
- Real-provider rehearsal of coverage and understand.
- Pulse, Meetings and commitments server work.

## 8. Who owns which files (parallel build)

| Package | Owns |
| --- | --- |
| Shared core | `shared/hands-free/*` (except `types.ts` changes, which need a note in this spec), `tests/hands-free-*.test.ts` |
| Server and contract | `server/**`, `contracts/companion-mobile.openapi.json`, `shared/mobile-contracts.ts`, `shared/companion-mobile-contract.ts`, `docs/companion-mobile-api.md`, `tests/mobile-*.test.ts`, `tests/companion-mobile-contract.test.ts` |
| Mobile data | `mobile/src/api/**`, `mobile/src/types/**`, `mobile/src/features/voice/**`, `mobile/app.json`, `mobile/package.json`, `mobile/metro.config.js` |
| Mobile UI | `mobile/src/app/**`, `mobile/src/components/handsfree/**`, `mobile/src/features/handsfree/**`, `mobile/src/features/today/**`, the scope switch |

## 9. Web hands-free cards on the team link (October 10, 2026)

**Status:** Built on the same branch (October 10, 2026): the key route, the three speech sources, the web screens on the team link and the browser walk `scripts/browser/verify-hands-free-web.mjs`. Checked against a local fake of OpenAI in the browser walk, and once against the real OpenAI API (October 10, below). Not merged, not tried in Safari or on a phone.

**Real OpenAI check (October 10, 2026, a server-side script, not a browser):** the key was minted with exactly `clientSecretBody` (HTTP 200; `gpt-live-transcribe`, keywords, prompt and `delay: "low"` accepted, though the echoed session does not list `delay`). The default WebSocket URL `wss://api.openai.com/v1/realtime?intent=transcription` opened with the browser's subprotocol key. 12.5 s of synthesized speech streamed at real time in 100 ms appends gave 43 deltas, the first about 0.9 s after audio started (about 1.1 s with `delay` left out), and the commit returned the completed transcript in about 0.6 s. The transcript was word for word, including "Priya". Events seen: `session.created`, `session.updated`, `…transcription.delta`, `input_audio_buffer.committed`, `conversation.item.added`, `conversation.item.done`, `…transcription.completed`.

What is built, beyond the text below:
- **Fallback during a deck:** when the OpenAI socket will not open (the kept key and one fresh key) or drops, or the audio graph will not start, the deck moves to the browser's speech recognition once, keeping the words already heard on that card, and the Why sheet names the browser's speech service from then on. Without browser speech, a socket problem shows "We couldn't hear that. Try again or type instead."; only a missing microphone or recognizer gives the typing note. The browser walk's `openai-socket-down` run covers this.
- **The microphone stops with the deck:** a source's `stop()` ends a `start()` that is still waiting (for the key, the microphone or the socket), and the hook starts nothing after the deck is gone.
- **One microphone for the deck (October 19):** the web hook starts the speech source once and keeps it running across cards; a new card calls `reset()` (the earlier words are forgotten) instead of stopping and starting, because phones' recognizers often stay deaf when restarted right away. Words reach the deck only while `deckMic` is on; `keepMic` stops the source (paused, blocked, error, done; not typing). A watchdog restarts the source when the microphone hears sound for 6 s with no words, at most 3 times a card; then, where the page records (below), it keeps the microphone running for the recording, and elsewhere shows the speech error.
- **Recorded backup (October 19):** while a spoken card listens, the page also records it on the source's stream (`client/src/handsfree/backup.ts`; the sources hand it over with `onStream`). Recording pauses while typing, paused or reading a past card and ends with the card. When live words are down during it (the browser source's `onTrouble`, offline, the watchdog, a source error) and someone talked meanwhile, the recording is kept on the device (IndexedDB) and sent to `POST /team/transcribe` (consent header; this device's Whisper when the server has no key) once online; its text replaces the live words heard during it (`shared/hands-free/recorded.ts`, deck event `recorded`; a skipped card stays skipped). Otherwise it is discarded. One recording is at most 4 MB and 9.5 minutes, then the next starts. The review waits for open recordings before Send; a failed one offers Try again or keeping the answer; one with no words is dropped. `/team/transcribe` allows 15 per team ask and 60 per company in 24 hours and returns `remaining`.
- **A dropped signal:** the browser source treats `network` (offline or after words came) and a refused restart after words came as a drop (`isDrop`): the microphone stays open, the recognizer retries (2 s doubling to 15 s, and on `online`), and the deck keeps voice. A `network` error before any words while online is still a browser without live words.
- **Microphone choice:** the consent screen stops for a choice only when there are two or more physical microphones (Chrome's "default" and "communications" entries and repeats in one device group do not count). A returning person, who skips the consent screen, gets the picker on the intro.
- **Short screens:** under 760 px of height the card gives up height (and, on a phone, the question and spacing get tighter), and the caption box sticks above the buttons if a long question still pushes it down. Checked at 390 × 664, 375 × 667, 360 × 640 and 1280 × 650.
- **Keyboard and focus:** shortcuts wait while the Why sheet is open; each new screen focuses its heading; the deck focuses the typing box in typing; the advisor's preview takes only keys pressed inside it. Opening Why pauses the deck and closing it resumes, unless the person had paused before.
- **Reduced motion:** the cards cross-fade (the page-wide reduced-motion rule in `styles.css` no longer cancels it).

Matt's decision: the web page leads and the app follows one step behind. Everyone gets an email link first, so the wow moment has to work in a browser on a phone or a laptop. The web version is the same deck (`shared/hands-free/deck.ts`, same timings, hints, chips, nudges, submission) with a web screen layer. Live words come from OpenAI live transcription.

### 9.1 Speech sources, in order

1. **OpenAI live transcription** (`gpt-live-transcribe`, a transcription-only session: no assistant voice). OpenAI recommends the dedicated live transcription API when nothing is spoken back; GPT-Live (`gpt-live-1`) is for an AI that talks and stays on the roadmap for Pulse and the meeting facilitator.
   - **Connection:**
     - The server mints a short-lived client secret: `POST https://api.openai.com/v1/realtime/client_secrets` with `{ expires_after: { anchor: "created_at", seconds }, session: { type: "transcription", audio: { input: { format: { type: "audio/pcm", rate: 24000 }, transcription: { model, languages: ["en"], keywords, prompt, delay }, turn_detection: null, noise_reduction: { type: "near_field" } } } } }`. The response's `value` is the key.
     - The browser opens a WebSocket to the URL the server returns, with subprotocols `["realtime", "openai-insecure-api-key." + value]` (the documented browser path).
     - The browser sends `input_audio_buffer.append` with base64 PCM16 mono 24 kHz chunks (an AudioWorklet resamples the mic, about every 100 ms) and `input_audio_buffer.commit` when the deck detects a pause. A session.update with the same transcription config is sent once after the socket opens.
     - It reads `conversation.item.input_audio_transcription.delta` (append to the live words) and `.completed` (replace that item's words with the final transcript), matching by `item_id` because completions can arrive out of order.
   - **Why WebSocket, not WebRTC:** the transcription docs describe append and commit with client-side pause detection. They do not document a transcription session or a commit over WebRTC. Revisit after the first real test.
   - **Checked with a real key (October 10):** the WebSocket URL, `prompt`, keywords and `delay` are accepted with `gpt-live-transcribe`; the first words arrive about 0.9 s into speech. See the §9 status for the numbers.
   - **Configurable on the server** so a real test can adjust without code:

     | Variable | Default |
     | --- | --- |
     | `OPENAI_LIVE_TRANSCRIBE_MODEL` | `gpt-live-transcribe` |
     | `OPENAI_LIVE_TRANSCRIBE_DELAY` | `low`; empty to omit |
     | `OPENAI_LIVE_TRANSCRIBE_WS_URL` | `wss://api.openai.com/v1/realtime?intent=transcription` |
     | `OPENAI_LIVE_TRANSCRIBE_SECONDS` | `600` |
     | `OPENAI_API_BASE_URL` | `https://api.openai.com/v1`; for tests and the fake server |
2. **Browser speech recognition**: the existing `client/src/sponsor/LiveVoice.tsx` path (Web Speech API, Chrome, Edge, Safari) when OpenAI is unavailable.
3. **Typing**, when neither is available or the person chooses it.

### 9.2 Server

`POST /api/invitations/:token/team/live-transcription` returns one of:
- `{ available: true, clientSecret, expiresAt, wsUrl, model }`;
- `{ available: false, reason }`.

The gate (one module, e.g. `server/live-transcription.ts`, shared later with the mobile API):
- The link is valid and open.
- Never for a sample company.
- The key is `OPENAI_LIVE_TRANSCRIBE_API_KEY`, a platform key on the server only. Without it the reason is `NOT_CONFIGURED`.
- Limits in 24 hours: 12 per request and 400 per tenant, counted by audit event `team.live_transcription_started`. The audit payload holds no secret.
- `keywords` come from the request's question hints and the company name. Lines are cleaned: no `<`, `>` or line breaks, at most 40, short. `prompt` is a fixed, plain description: an employee describing their own work for their company's advisor.
- Any OpenAI error or a timeout of about 5 s is `available: false`.
- The secret never appears in logs, audit, errors or the URL.

Tests: inject a fake fetch; cover each gate case; check the request body sent to OpenAI; check that no secret is stored.

### 9.3 Web screens

New folder `client/src/handsfree/`. `TeamLink.tsx` renders it for a request with questions; `?flow=classic` keeps today's `TeamFlow` for comparison.

**Screens:**
- **Intro.** "N quick questions about your work", the question list, Start with voice and Type instead, and Why am I being asked this.
- **Microphone consent.** The hf-04 copy, and a microphone picker that reuses `live-voice-model.ts`.
- **The deck.** hf-05 … hf-18: progress segments, the card with chips, the next card peeking, the caption box with level bars from the real mic, Pause, Skip, Type instead, the skip sheet, Previous and Add more, and the offline, mic blocked and speech error notices.
- **Here's what we heard.** Uses the existing `/team/understand`.
- **Sending, Sent and Send failed.** The same `POST /invitations/:token/team` body, built with `toSubmission`.

**Behaviour:**
- **Look:** the Companion 2.0 web tokens in `client/src/styles.css` and `sponsor-flow.css`, following the hands-free captures. One centered column (max about 560 px) on a laptop and full width on a phone.
- **Animations:** the card slides out and the next one springs in, with CSS transitions. Reduced motion uses a cross-fade.
- **Keyboard:**

  | Key | Action |
  | --- | --- |
  | Space | Pause or resume, outside text fields |
  | ← | Previous card |
  | S | Skip sheet |
  | T | Type instead |
  | Enter | Next, in typing |
  | Esc | Close the sheet |

  The page lists them with a small "Keyboard shortcuts" disclosure.
- **The hook** `useWebHandsFreeDeck` drives the deck reducer:
  - timers;
  - mic on or off according to the reducer;
  - `coverLocally` on every delta, so chips light at once;
  - `/team/coverage` on each pause, raced against 2.5 s;
  - a commit to OpenAI on each pause;
  - a local draft in `localStorage` per request;
  - announcements in an `aria-live` region.
- **The microphone is released** on pause, when the page is hidden, and when the person leaves.

**Privacy copy (consent and Why):** "Your words are transcribed securely while you speak so the cards can follow along. Nothing goes to <advisor> until you review it and tap Send." Never "nothing leaves your device". Name OpenAI in the Why sheet as the transcription service when it is in use, and the browser's speech service otherwise, as LiveVoice does today.

### 9.4 Proof

- **Pure tests** of the protocol helpers: message builders, delta and completed merging by `item_id`, and PCM conversion.
- **A browser walk** of the real page against a local server (Playwright, Chromium):
  - a fake microphone (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`);
  - a local fake OpenAI realtime WebSocket server (`scripts/browser/fake-openai-realtime.mjs`) that checks the subprotocol key and returns scripted deltas and completions;
  - `OPENAI_API_BASE_URL` and the WebSocket URL pointing at it.

  The run goes intro → consent → every card hands-free → review → send. It then confirms the saved response record, and repeats at 1440 × 900 and 390 × 844, with the browser-speech fallback and with typing.
- **No real OpenAI call in any test.**
