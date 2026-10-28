# Build progress

**Current goal:** Complete the existing `codex/live-backend` app integration against DutyGraphV2's actual mobile API while preserving mock/dev-server workflows. Current continuation results are recorded below; physical release and device acceptance remain separate.

The standalone Expo app supports participant and advisor workflows with mock/development repositories and the actual V2 mobile backend on a scratch PostgreSQL database. Current verification passes 538 mobile tests, 78 shared tests, 64 development API tests, typechecks/lint and all twelve actual-backend browser paths with 219 schema-validated exchanges. Handsfree/meeting line coverage is 94.37%. Native integrations remain **not run on a device**. One historical development-server provider rehearsal is documented below; no deployment or app-store release occurred in this continuation.

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
- Mobile: **538 tests pass across 63 suites**, with typecheck and lint passing. Targeted handsfree/meetings coverage **94.37% lines** (handsfree and meetings runtime files, no implementation exclusions). The coverage script enforces 90% in CI.
- Development API: **64 tests pass**, with typecheck passing; the previous measured line coverage was 92.50%. Its proposed contract covers 57 operations. Separately, actual V2 contracts expose 39 advisor and 16 extra operations; all twelve app browser paths pass against those served schemas. The pinned participant contract remains unchanged.
- Browser: typed interview passes mock and HTTP; HTTP offline Send retries the same key and waits for acknowledgment. Mock scripted speech, Task Cards, Pulse, setup, kickoff, advisor and Facilitator paths pass. The fresh-server HTTP regression runner covers 12 paths and is wired into CI. HTTP mixed Task Card decisions, Hybrid/Pulse creation and completion, attributed kickoff notes, advisor/Facilitator proposal acceptance, declined-attendee exclusion, all eight setup topics, private owner confirmation and stale-source rereview pass. See [DEVICE-QA.md](docs/DEVICE-QA.md) for exact executed portions and remaining checks; these do not establish device behavior.
- Isolated Expo prebuild succeeds for both native projects, and autolinking resolves the custom PCM module on both platforms. Static native configuration introspection confirms iOS background audio, Android microphone foreground recording service, camera and accurate microphone/Face ID notices. This is configuration evidence only.
- 77 light/dark captures live in [docs/screens](docs/screens). [REDTEAM.md](docs/REDTEAM.md) records the review and fixes. [PORTING-TO-DUTYGRAPH.md](docs/PORTING-TO-DUTYGRAPH.md) maps proposed endpoints, storage and production work.

## Remaining verification and integration limits

- **Native PCM and optional realtime WebRTC are implemented but not compiled or run on a device here.** Both Apple/Android autolinking and isolated Expo prebuild pass. The manually triggered native build workflow is ready for platform toolchains. Device recognition/typing and TTS remain fallback paths.
- **Realtime input and native meeting recording are mutually exclusive** pending device evidence for shared microphone access. Default TTS facilitation remains available with recording; the UI requires pausing recording before realtime input and stopping realtime before resuming recording.
- **Not run on a device:** microphone and camera prompts, biometric lock, simultaneous recognition/backup capture, background recording, Bluetooth/echo, phone interruptions, long recordings, restart recovery, upload reconnection, VoiceOver/TalkBack, largest Dynamic Type, App Links and push taps. The checklist is explicit in [DEVICE-QA.md](docs/DEVICE-QA.md).
- **One real-provider rehearsal (2026-10-27):** `dev-server/scripts/real-provider-rehearsal.ts` spoke a fictional six-line, three-voice meeting with OpenAI TTS, uploaded it as .m4a and finished it with real diarized transcription (`gpt-4o-transcribe-diarize`) and extraction (`OPENAI_TEXT_MODEL=gpt-5.4-mini`). It produced a sourced decision, an action with an explicitly named owner and an open question; the Facilitator opening and a spoken TTS line also worked. Timings: plan and gate 2.0 s, Facilitator line 1.0 s, TTS line 1.5 s, finish 28.8 s for about 30 s of audio. Server cost estimate: 1 cent. Diarization merged two of the three synthetic voices and the transcript contained one invented word, so real-room quality still needs testing. The rehearsal found and fixed a blocking bug: finish sent recordings as `audio/aac`, which OpenAI rejects; phones record .m4a, now sent as `audio/mp4`.
- **No hosted migration or deployment:** the separate development server still uses development-only JSON persistence. Actual V2 PostgreSQL migrations and mobile routes were exercised on a scratch database; this does not establish hosted migration, provider acceptance or billing accuracy.
- The web preview deliberately uses memory-only secure storage. A full browser reload is not evidence of native encrypted persistence.

## External checks and scope updates

- Gemini review was explicitly waived by the owner. It is no longer a requirement or blocker.
- A prior session could not reach `docs.expo.dev`. The current continuation fetched SDK 57 documentation successfully and used installed source/types; no network-policy bypass was attempted.
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

## Historical connector-only notes — superseded by the actual-backend continuation below

The following dated entries describe earlier sessions without a runnable checkout. Their pending/unrun statements are historical; current results appear in the final continuation section.

### 2026-10-28 — `codex/live-backend` preliminary Sprint 2 hardening

- **P4 (partial):** Added `hasInstructionLikeQuote` and a visible amber warning on proposal evidence cards. Detection is a review hint (not a safety classifier or automatic decision). Added 11 focused Jest examples.
- **P1–P3, P5:** Not implemented here; production meeting contract, authenticated advisor pairing, PostgreSQL integration runner and backend profiles still depend on DutyGraphV2's `codex/mobile-api` sprint.
- **Checks:** Code inspection completed. Jest, typecheck, lint, web export, full 626-test suite, EAS/device QA and cross-repo integration **not run**: this session can read/write through the GitHub connector, but lacks an authenticated local checkout and test services. No provider used.
- **Default:** Flag source quotes with explicit prompt/role markers, directive overrides, or the budget-approval pattern from the recorded red-team case. Treat false positives as prompts to recheck, not as rejection. Do not modify proposal status or authorization.
- **No production change:** Draft-only branch; no merge or deployment.

## 2026-10-28 — Sprint 2 P2 backend selection

- Added `resolveBackendProfile` and config wiring for mock, dev-server, dutygraph-local, dutygraph-preview, dutygraph-production. Real backend modes use one origin for participant and advisor HTTP. HTTPS required for preview/production; remote preview requires an explicit URL. Stale separate meetings-origin overrides are ignored in real DutyGraph profiles. Legacy `http` keeps earlier behavior.
- Added focused tests for the five profiles, legacy compatibility and rejecting credentialed URLs/paths/unknown modes. **Not run** in this session: npm install, Jest, typecheck, lint, EAS/native, HTTP integration and device QA (no authenticated local checkout or network). Code changes are unverified pending CI.
- Defaults: `mock` stays default, no EAS profile automatically points at unimplemented production endpoints. No secrets or provider calls. The live DutyGraph server still needs Sprint 1 endpoints.

## 2026-10-28 — Sprint 2 P4 iOS recording privacy

- Updated the iOS PCM module to expose an Application Support meeting recording directory with `isExcludedFromBackup` and file protection. Expo raw clips now use Cache; stored clips use that private directory on iOS. Existing Documents clips migrate during restore with manifest-first preservation. Cleanup removes private and legacy files. Old builds without this native method cannot start iOS meeting recording.
- Added two focused Jest cases for private storage and legacy migration (iOS checks). **Not run**: Jest, iOS build, iCloud backup verification, device recording and crash recovery, full suite, typecheck, lint (no authenticated local checkout). Native behavior remains unverified.
- No production app store rollout, production backend integration or paid provider call.

- P4 self-review correction: fixed legacy-path slash normalization and adjusted the file-system mock to handle Directory objects. Re-run the focused iOS recovery test and native build before accepting the PR.

## 2026-10-28 — Sprint 2 P4 release links and signing

- Production-mode invitation links now use HTTPS `dutygraph.com/mobile/enroll`, while mock/dev keep previous behavior. Added focused URL tests and `docs/EAS-RELEASE.md` for signing, AASA, Android asset links and device acceptance.
- iOS AASA hosting is not performed (DutyGraphV2 website outside this sprint); release signing and on-device links are **not tested**. Existing EAS profile environment remains untouched pending the server port. Unit tests and build not run in this session.

## 2026-10-28 — CI feedback and correction

- GitHub Actions run `40628515406` (commit `26f7311`) passed the shared test/typecheck steps and failed at mobile TypeScript. Exact findings: missing `@jest/globals` in two new tests; wrong `File[]` annotation in `nativeRecorder.ts` resolved to the DOM File type. A corrective commit fixes all three source locations. Run on the corrective commit: **not yet observed**.
- `npm ci` emitted 25 pre-existing-style dependency audit findings (5 high); no package dependency changed in this branch. A dedicated `npm audit --audit-level=high` is **not run** and advisories require triage before release.

## 2026-10-28 — Actual backend P1–P5 continuation

- **Contracts and adapters:** Generated advisor and participant-extra TypeScript from the actual V2 served OpenAPI (39 advisor +16 extra operations). The source URLs and SHA-256 hashes are recorded in `contracts/dutygraph-served-contracts.json`. Both snapshots match V2's current contract files; participant v1 remains pinned and unchanged. Adapters use generated auth/meeting/session/people/Pulse/config types and narrow unknown server fields before app use.
- **Profiles and review binding:** Real profiles use one origin, preview/production require HTTPS, and mock plus legacy HTTP remain available. Real-profile PATCH/route/closing commands include the exact reviewed version/hash; kickoff acknowledgments preserve note revisions for later edits. Durable command identities include those bindings. EAS production defaults remain gated on deployment/release verification.
- **Actual PostgreSQL browser runner:** All twelve paths passed in one current run, `dutygraph-v2-e2e-BzCVSO`, with **219 actual request/response exchanges** checked against the served schemas. Paths: participant, offline, Task Cards, Hybrid, Pulse, advisor, Facilitator, declined consent, stale-source review, private wrap-up, kickoff and setup. The runner starts V2 `createApp`, injects fake providers, creates fresh fictional tenants through domain writers and authenticates pairing through the real cookie+CSRF endpoint. It never starts the development server. Temporary credentials are mode 0600 and deleted at exit. See [DUTYGRAPH-INTEGRATION.md](docs/DUTYGRAPH-INTEGRATION.md).
- **Hardening and review fixes:** Advisor logout clears role data before remote revocation; session generations fence late refreshes and company responses. Batch finish waits up to 210 seconds for bounded 180-second processing, retains its key after ambiguous outcomes and only retires an authoritatively failed attempt before another user tap. Timeout copy does not falsely claim offline. Closing Change requires a note. Simulated server silence is labeled and skipped in favor of device/text fallback; protected extensionless WAV caches use declared MIME and strict origin/path checks. iOS fallback M4A uses backup-excluded native storage, migrates legacy clips and fences logout/metadata races.
- **Verification:** `npm run verify -- --runInBand` in mobile passed **538 tests across 63 suites**, TypeScript and lint. Required handsfree/meeting coverage passed **166 tests/19 suites; 94.37% lines**. Root baseline 78 tests/typecheck and development API 64 tests/typecheck passed. Legacy browser paths passed across the complete suite plus focused kickoff/setup rerun after the acknowledgment fix. Actual-backend full-scope export passed. Eleven advisor checkpoint captures were reviewed at 390×844 against existing screenshots; no clipping was observed. These are browser observations.
- **Audit:** Compatible lock-only node-forge 1.4.2/source-map-js 1.2.2 patches reduced high findings 8→3. Remaining high findings are the nested Expo CLI Zod 3 advisory and propagated CLI/Expo entries; no compatible upstream Zod 3 fix was available. Low/moderate findings remain documented by the audit output; the audit is not clean.
- **CI and limits:** Added a manual cross-repository PostgreSQL integration workflow. YAML parses; sibling private-repository authorization and hosted execution are unverified. No new secret was requested. No paid provider call, native build, physical-device/iCloud verification, signing, hosted migration, merge, deployment or EAS release occurred in this continuation. The existing real-provider rehearsal above is historical evidence from the separate development server.

- 2026-10-28 review correction: meeting budget labels now describe estimated dispatch limits and estimated reserved use, including failed requests; actual provider cost may differ. Facilitator defaults use the server's $15 estimate for both TTS and realtime, with $2 for other meeting modes. These are enforcement estimates, not billing evidence.

Final frozen-backend snapshot: all twelve paths passed again after participant live-transcription and approved realtime response changes, with 219 schema-validated exchanges. [Sanitized current-run evidence](docs/verification/dutygraph-mobile-2026-10-28.json) records each path and exact served contract hashes. Generated output typecheck/lint and web export passed. The runner's SIGTERM cleanup was separately exercised: private fixture directory removed and owned server stopped. No additional physical-device/provider claim is made.
