# Build progress

**Current goal:** Continue the existing work, fix bugs, and complete the app. Gemini review is out of scope. The continuation adds native adapters and fixes the bugs found by expanded end-to-end and security checks.

The standalone Expo app now implements participant and advisor workflows against mock repositories and the local fake-provider HTTP API. Astra, GPT-6.1 Sol and GPT-6.1 Terra completed parallel implementation and review. The original 48 shared and 312 mobile seed tests remain intact; shared tests now total 78 with 96.76% executable line coverage. Final validation passes 488 mobile tests, 78 shared tests and 60 API tests, plus typechecks, lint, web export and the documented browser acceptance paths. Native integrations are implemented where the SDK supports them, but **not run on a device**. One scripted real-provider rehearsal has run (see below); no upstream deployment or app-store release has occurred.

| Phase | Status | Verification |
| --- | --- | --- |
| 0 Workspace | Complete | Original seed passed; query-cache timer cleanup preserves assertions |
| 1 Development server | Implemented | Scoped sessions, fake/proxy modes, safe provider boundaries and contract tests |
| 2 Design system | Implemented | 14 primitives, mock gallery, light/dark 390×844 captures reviewed |
| 3 Voice output | Implemented | Server/device/silent fallback, cache isolation, completion, echo and barge-in tests |
| 4 Speech input | Implemented; native compilation/device QA outstanding | Native/browser PCM/WS, device fallback, session fencing, same-engine WAV recovery |
| 5 Answer and Task Cards | Implemented | Source-aware review, explicit Send, version/hash-pinned decisions and offline retry tests |
| 6 Advisor sessions | Implemented | QR/manual pairing, separate tokens, rotating refresh, biometric overlay, company isolation |
| 7 POWER and Gate | Implemented | Shared deck, editable plan/roles, deterministic policy and server-enforced gate |
| 8 Pulse | Implemented | Scoped decks, reviewed submission, completion-only team status and second gate |
| 9 Capture and Copilot | Implemented; device QA outstanding | Consent/exclusion, typed evidence, native segmented AAC adapter, resumable checksummed upload |
| 10 Facilitator | TTS and opt-in realtime implemented | Six triggers, consent/output/lifetime guards, mute/skip/stop; native device QA outstanding |
| 11 Closing and results | Implemented | Speaker confirmation, sourced proposal accept/edit/reject, stale checks, owner confirmation, exports |
| 12 Kickoff and setup | Implemented | Attributed secure-autosaved notes, eight-topic setup deck, source-linked proposals |
| 13 Optional flags | Implemented | Auto-advance off and table nudges by default; explicit developer/server flags |
| 14 Hardening | Local checks complete; external QA outstanding | OpenAPI, SQL proposal, CI, browser E2E, security review, screenshots and >90% scoped line coverage |

## Verification evidence

- Shared: **78 tests pass; 96.76% lines**. Random deck sequences and source/policy regression cases are included. Only erased type-only files are excluded from executable coverage.
- Mobile: **488 tests pass across 57 suites**, with typecheck and lint passing. Targeted handsfree/meetings coverage **94.52% lines** (handsfree and meetings runtime files, no implementation exclusions). The coverage script enforces 90% in CI.
- API: **60 tests pass; 92.50% lines**, with typecheck and lint passing. The proposed OpenAPI contract covers 57 operations and validates actual local HTTP lifecycle traffic; the pinned participant contract regenerates without changes.
- Browser: typed interview passes mock and HTTP; HTTP offline Send retries the same key and waits for acknowledgment. Mock scripted speech, Task Cards, Pulse, setup, kickoff, advisor and Facilitator paths pass. The fresh-server HTTP regression runner covers 12 paths and is wired into CI. HTTP mixed Task Card decisions, Hybrid/Pulse creation and completion, attributed kickoff notes, advisor/Facilitator proposal acceptance, declined-attendee exclusion, all eight setup topics, private owner confirmation and stale-source rereview pass. See [DEVICE-QA.md](docs/DEVICE-QA.md) for exact executed portions and remaining checks; these do not establish device behavior.
- Isolated Expo prebuild succeeds for both native projects, and autolinking resolves the custom PCM module on both platforms. Static native configuration introspection confirms iOS background audio, Android microphone foreground recording service, camera and accurate microphone/Face ID notices. This is configuration evidence only.
- 77 light/dark captures live in [docs/screens](docs/screens). [REDTEAM.md](docs/REDTEAM.md) records the review and fixes. [PORTING-TO-DUTYGRAPH.md](docs/PORTING-TO-DUTYGRAPH.md) maps proposed endpoints, storage and production work.

## Remaining verification and integration limits

- **Native PCM and optional realtime WebRTC are implemented but not compiled or run on a device here.** Both Apple/Android autolinking and isolated Expo prebuild pass. The manually triggered native build workflow is ready for platform toolchains. Device recognition/typing and TTS remain fallback paths.
- **Realtime input and native meeting recording are mutually exclusive** pending device evidence for shared microphone access. Default TTS facilitation remains available with recording; the UI requires pausing recording before realtime input and stopping realtime before resuming recording.
- **Not run on a device:** microphone and camera prompts, biometric lock, simultaneous recognition/backup capture, background recording, Bluetooth/echo, phone interruptions, long recordings, restart recovery, upload reconnection, VoiceOver/TalkBack, largest Dynamic Type, App Links and push taps. The checklist is explicit in [DEVICE-QA.md](docs/DEVICE-QA.md).
- **One real-provider rehearsal (2026-10-27):** `dev-server/scripts/real-provider-rehearsal.ts` spoke a fictional six-line, three-voice meeting with OpenAI TTS, uploaded it as .m4a and finished it with real diarized transcription (`gpt-4o-transcribe-diarize`) and extraction (`OPENAI_TEXT_MODEL=gpt-5.4-mini`). It produced a sourced decision, an action with an explicitly named owner and an open question; the Facilitator opening and a spoken TTS line also worked. Timings: plan and gate 2.0 s, Facilitator line 1.0 s, TTS line 1.5 s, finish 28.8 s for about 30 s of audio. Server cost estimate: 1 cent. Diarization merged two of the three synthetic voices and the transcript contained one invented word, so real-room quality still needs testing. The rehearsal found and fixed a blocking bug: finish sent recordings as `audio/aac`, which OpenAI rejects; phones record .m4a, now sent as `audio/mp4`.
- **No production backend migration:** the local server's JSON persistence and process-local command locks are development mechanisms. Proposed SQL is unexecuted; transactional tenancy, durable jobs, retention and billing remain upstream integration work.
- The web preview deliberately uses memory-only secure storage. A full browser reload is not evidence of native encrypted persistence.

## External checks and scope updates

- Gemini review was explicitly waived by the owner. It is no longer a requirement or blocker.
- The environment proxy denies `docs.expo.dev`. SDK 57 installed source/types and seed patterns were used; no network-policy bypass was attempted.
- No physical devices, production DutyGraph server or provider keys are configured.

## Owner decisions for later (not blockers)

1. Enable careful auto-advance? Default off.
2. Allow AI-written spoken employee follow-ups? Default table nudges.
3. Facilitator voice: TTS lines or realtime? Default TTS lines.
4. Who reviews the consent script and recording notice?
5. Confirm meeting budgets and provider usage payer. Defaults: $2 record/process, $15 live voice.


## Bugs fixed in the continuation

- Explicit note attribution is atomic and retry-stable, allowing a meeting with a declined attendee to finish without admitting that attendee’s words. Raw room audio requires everyone’s consent.
- HTTP setup supports all eight named topics; participant wrap-up exposes only the current person’s items and resets stale confirmations.
- Transcript corrections invalidate proposals. Audio playback uses actual recording durations and does not pretend live notes have a recorded source.
- Logout invalidates old requests, queue work and draft writers before awaiting remote revocation. Late refreshes, submissions and acknowledgments cannot affect a new login.
- Native/provider speech runs and hook callbacks are fenced by session. Recovering multiple clips preserves earlier words and manual edits; spoken prompts are excluded from backups.
- Raw PCM backups use the same capture engine, bounded rolling WAV files and private OS-backup-excluded storage. Native file-protection behavior remains unverified on devices.
- Extraction and facilitator replies recheck consent/state after provider waits; malformed model output cannot publish partial proposals. Withdrawal removes escaped-text caches and derived follow-ups.

## 2026-10-28 — Earn phone B2.0: contract and development adapter

Branch `codex/earn-phone` starts from origin/main8827048d; web counterpart codex/earn-client has completed its web review and2774-test regression. [Shared final handover](https://github.com/mattrob333/DutyGraphV2/blob/codex/earn-client/docs/earn-client/PROGRESS.md).

Pinned Agent A749f3318 mobile OpenAPI (8 canonical operations) and generated separate Earn types. Added authenticated fictional development routes, optional local capability discovery and development-only new app-draft creation. Real A reads/confirm/Not mine/fix routes remain contractual; missing production POST/drafts is not invented. Release builds refuse a development fixture backend; legacy mock mode has no new Earn seed/network fallback. The new adapter shares the actual participant client/context for one refresh single-flight and logout fences, with additive nested-error handling.

Checks: mobile and dev-server TypeScript passed;67 focused new/legacy transport and phone tests passed;7 development HTTP tests passed. Initial voice screen tests lacked the provider after transport-context sharing; the test harness was corrected to use the real provider and all67 passed. Full suites, browser/export and five fresh phone reviews follow.

Dependency audit: root/dev-server audits pass with0 vulnerabilities. Mobile safe non-breaking fixes removed node-forge/source-map high findings. Remaining mobile audit is20 advisories (14low,3moderate,3high) through Expo57 CLI's Zod3 build-tool path; audit proposes a breaking Expo51 downgrade. No forced SDK downgrade or untested cross-major override is applied. This is an open tooling limitation, not a passing audit claim. Clipboard was installed through Expo's compatible SDK57 manifest in offline mode after official metadata/docs fetches returned403; installed Clipboard API types/documentation were read. No native/device or paid provider test.

Needs from Agent A: a real mobile draft-creation route for standalone spoken tasks; current confirmation already supports optional reviewed card edits. Contract mismatch notes remain in the linked web handover. No DutyGraphV2 server/shared source or migrations were changed by this phone work.

## 2026-10-28 — Earn phone B2.1: core screens and dictation reuse

Implemented Me entry, name-sorted scoreboard, From your AI list/detail, full hands-on Task Cards, Earn rules/prompts Copy/Share and gaps/fixes. Missing-slot Add edits stay local and are sent only as the contract's optional card in Confirm; no PATCH route or automatic confirmation was invented. Tick boxes are local and explicitly do not record task completion. Native dictation reuses the existing device adapter with no grant/provider, gates unsupported draft destinations before opening a microphone and stops on typing/navigation/background/unmount. Typed fallback saves an unconfirmed app draft only on acknowledged development-capability connections.

Actual development fake-HTTP browser journeys passed at360/1280 with normal participant enrollment, storage/transport and expected-version confirmations; no page exceptions, React render warnings, document overflow or microphone calls. Eighteen screenshots include tools/materials locations. Browser testing corrected a decorative SVG web/native accessibility split, raw/empty View child strings and explicit web ARIA checked state; regression tests preserve native behavior. Voice component tests now run inside the shared real repository provider.

Full mobile suite passed527/527 across61 suites in35.8s; dev-server verification71/71 and root shared78/78/typecheck/lint passed; mobile TypeScript passed. Earlier concurrent runs retained one unchanged5s Deck/Conversation timeout each (526/527); isolated Deck20/20 and quiet whole suite passed without increasing a timeout or changing the old tests. The post-package browser and production export/fixture guard plus five fresh phone reviews follow. Audit limitation above remains open; this is not device or release acceptance.

## 2026-10-28 — Earn phone B2.2: browser and release boundary

Development fake-HTTP journeys passed at360/1280; production HTTP export and actual static-release fixture refusal passed before any Earn seed request. Nineteen screenshots and two result files are linked in docs/earn-client/BROWSER.md. Exported JavaScript contained none of the three checked Earn seed strings. No physical phone, native microphone or hosted backend was tested. Five fresh-context reviews follow at this committed freeze.

## 2026-10-28 — Earn phone B2.3: five reviews and corrections

Pushed review freeze79c890dabcdf5587b9c31b86266994c11e4a3ef7. Five fresh-context reviewers completed independently. No confirmed High; all five confirmed Medium and the reported Low findings are corrected: durable scoped retries, atomic local confirmation/receipt, quoted-secret removal, accessible row summaries, reopenable slot corrections, precise rejection copy and fail-closed hints. See docs/REDTEAM.md for evidence and the independent persistence correction review. Local enrollment identity is explicit client metadata retained on refresh; current server contract has no sessionId and was not changed. Web storage is memory-only; native secure storage/device behavior remains unverified. Existing root decisions log now contains browser choices; the accidentally named duplicate DECISIONS.md is removed. Final full checks and post-correction browser/export follow.

Post-review verification: whole mobile **552/552** (65 suites,36.997s), dev-server **76/76**, shared **78/78**; mobile/dev/shared TypeScript and whole lint passed. An integrated typecheck first caught new test-only Jest imports/literal/tuple types; those were corrected, final TypeScript exit0, and affected four suites28/28 passed. No product type bypass, skipped test or timeout increase. Mobile high-threshold audit rerun exits1 with20 findings (14low,3moderate,3high) in the documented SDK tool chain; root/dev audits0. Review freeze CI40824655411 passed including legacy browser/HTTP/coverage checks. Corrected-head CI and post-correction browser/export follow.
