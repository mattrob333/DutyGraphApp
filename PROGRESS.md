# Build progress

**Current goal:** Continue the existing work, fix bugs, and complete the app. Gemini review is out of scope. The continuation adds native adapters and fixes the bugs found by expanded end-to-end and security checks.

The standalone Expo app now implements participant and advisor workflows against mock repositories and the local fake-provider HTTP API. Astra, GPT-6.1 Sol and GPT-6.1 Terra completed parallel implementation and review. The original 48 shared and 312 mobile seed tests remain intact; shared tests now total 78 with 96.76% executable line coverage. Final validation passes 488 mobile tests, 78 shared tests and 60 API tests, plus typechecks, lint, web export and the documented browser acceptance paths. Native integrations are implemented where the SDK supports them, but **not run on a device**. No real-provider rehearsal, upstream deployment or app-store release has occurred.

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
- **No real-provider rehearsal:** API request shapes are tested with injected fake transports. Provider quality, latency and cost are unmeasured. Meeting extraction has a bounded structured text-model adapter for all seven proposal kinds with exact-source validation and no inferred owners. Its real-model quality remains unverified.
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
