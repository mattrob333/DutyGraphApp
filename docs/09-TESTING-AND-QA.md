# 09 · Testing and QA

## 1. Commands (must pass after every phase)

| Where | Command | Covers |
| --- | --- | --- |
| root | `npm run test:shared` · `npm run typecheck:shared` | `shared/` reducers and rules, prompt pack, judgment contracts (48 tests in the seed) |
| `mobile/` | `npm run verify` (typecheck + Jest) | 29 suites / 312 tests in the seed, plus everything you add |
| `mobile/` | `npx expo export --platform web` | The app bundles |
| `mobile/` | `node scripts/screenshot-web.mjs --all` | Screenshots at 390 × 844 (needs Playwright; Chromium is usually preinstalled) |
| `mobile/` | `node scripts/e2e-web.mjs` | Web-build E2E against the dev server (Playwright) |
| `dev-server/` | `npm test` · `npm run typecheck` | Routes, auth, idempotency, providers (fake), contract conformance |

No test may call a real provider or need `OPENAI_API_KEY`. Unset `OPENAI_API_KEY` in test scripts explicitly.

## 2. What to test

### Shared logic (`tests/`)
- Deck reducer: every rule in `reference/docs/COMPANION-HANDS-FREE.md` §2 and §3 (the seed covers them), plus the voice rules in 04 §3.3, auto-advance (04 §3.6), AI follow-ups (04 §3.7). Property-style: random sequences of events never open the deck mic outside `listening`/`checking`/`more` (except a warm mic during `speaking` that the deck ignores), never end a card while words arrive, never exceed `MAX_NUDGES`.
- Meeting gate rules (05 §4): one test per rule, and the policy check overriding a model judgment.
- Lifecycle and facilitator transitions: legal and illegal moves, skipped states per type.
- Closing checklist: outcomes met / partly met / not met; action status ladder.
- Pulse completion: due time, all done, partial; team status contains no answer text.

### App (`mobile/`, Jest + Testing Library)
- Every new component: renders in each state, accessibility labels and roles, 44 pt targets.
- Every screen: loading, empty, error, offline, success; the "not available yet" state with an unset meetings base URL.
- Hooks with fake timers, fake `VoiceOut`, fake `LiveSpeech` (simulated), fake recorder and fake upload queue.
- HTTP adapters: request bodies validated against the contracts (`shared/mobile-contracts.ts` for v1; zod schemas generated from `meeting-mobile.openapi.json` for the new API); refresh single-flight; error mapping; idempotency key reuse on retry.
- Secure storage: drafts, notes, pending work survive a simulated restart; logout clears them.

### Dev server
- Error shape and codes; idempotency (same key same body, different body, missing key).
- Participant fake API passes the app's existing HTTP adapter tests when pointed at it.
- Proxy mode forwards unchanged (use a tiny fake upstream).
- Advisor pairing: one-time code, expiry, rotation, replay, logout revoke, company scope (a second company's ids → 403).
- Tenant isolation in the store: a session for company A can never read company B's meetings, sessions, proposals, audio.
- Providers: fake determinism; the OpenAI adapters with an injected fake `fetch` check the exact request body (model, voice, session config, `create_response: false`) and that no secret reaches logs or responses other than the minted client secret.
- Prompt composition: version and hash recorded; participant text stays inside data blocks (try "ignore previous instructions").
- Facilitator triggers: the AI line is produced only for the six triggers.
- Proposals: at least one source segment; stale on segment edit; unmapped speaker cannot source an accepted attributed claim.

## 3. End-to-end flows (Maestro in `mobile/e2e/`; Playwright on the web build where Maestro cannot run)

| Flow | Steps | Pass when |
| --- | --- | --- |
| A. Spoken interview | Enroll (dev token) → Today → questions intro → Start with voice → consent → 6 cards with spoken questions (simulated speech) → else card → review → edit one answer → Send | Sent shows only after the server acknowledges; the submit body matches `toSubmission`; sources are recorded |
| B. Typed interview | Same, Type instead from the intro | Typed nudge once on Next, second Next saves |
| C. Offline send | Flow A with offline at Send → reconnect | One submission on the server (idempotent), Sent after reconnect |
| D. Task Card check | Today → task check → 3 cards: This is right, Needs a change (note), Not my work → Send | Attest called for the first with version and hash; decisions for the others |
| E. Plan a meeting | Advisor pair → New meeting → POWER cards by voice → attendees with roles → plan → gate Hybrid → Send a Pulse | Pulse created for the right people; released people listed |
| F. Pulse | Participant answers the Pulse with spoken questions → team status → leader sees the second gate | Team status has no answers; live minutes computed by code |
| G. Copilot meeting | Start → consent (one declines) → Copilot → simulated transcript → coach prompts → Park it → closing ritual → finish → speaker map → accept proposals | Declined person's segments excluded; every proposal has sources |
| H. Facilitator meeting | Start Facilitator → opening spoken → introductions → time box end triggers a line → leader mutes → Stop AI (recording continues) → closing ritual spoken → owners confirm | The AI never speaks outside triggers; recording uninterrupted |
| I. Kickoff notes | Advisor kickoff guide → notes for 3 topics with speakers → kill and relaunch the app | Notes restored; claim proposals carry speaker and quote |

## 4. Manual device checklist (write it to `docs/DEVICE-QA.md`; you cannot run it here)

iPhone and Android development builds: microphone permission strings; live words with the device recognizer; spoken questions through the speaker and AirPods; barge-in on the speaker (echo); iOS silent switch; a phone call during a card and during a recording; app background during recording (iOS indicator, Android notification); 60-minute recording size and battery; upload resume after airplane mode; VoiceOver/TalkBack on the deck and the live meeting; largest Dynamic Type; App Links for `/mobile/enroll`; push tap routing.

## 5. Real-provider rehearsal (manual, separate from tests)

`OPENAI_API_KEY=… npx tsx dev-server/scripts/rehearse-openai.ts` makes one TTS line, mints one live-transcription session, streams 3 s of a bundled WAV, and prints the first-word latency, total time and any error. Record the output in `PROGRESS.md` as "rehearsal" with the date. Never claim provider quality from fakes.
