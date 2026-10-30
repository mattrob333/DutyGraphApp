# Build progress

## October 30, 2026 — Upload with the camera

- Added `/upload` with Take a photo, Scan pages to one PDF and Choose a file, a note, Send to my advisor and a "You sent" list with Take back. Today links Your Task Cards, Company files and Upload; Files links Upload.
- Http repository posts multipart FormData to DutyGraphV2 `/api/mobile/v1/uploads` with an Idempotency-Key; the sample repository keeps uploads in memory.
- Checks: mobile typecheck, lint and Jest (78 suites, 656 tests; 6 new upload tests with mocked camera, picker and print). Not checked: a real camera, the scanned PDF on a device, or a hosted upload.

## October 28, 2026 — Optional gate advice and final adapter contract sync

- Added an explicit Ask AI for a suggestion action to the meeting gate. The rules result remains visible. Any reason is labelled as a suggestion and never changes the saved gate or route. Off, unavailable, over-budget and rules-required results retain the deterministic result. The mock and development API stay off; this app has no provider-settings editor and adds no new configuration authority.
- Refreshed both actual served wire contracts from a restarted local backend at `27503b89e4fae598255b51677b379eba82617cee`. The extras provider-code enum now includes AI_USAGE_RECORD_FAILED. The served-contract byte hashes match the checked-in manifest. Backend voice_server is an additive participant-v1 source enum; this advisor/extras generator intentionally preserves the separately pinned participant-v1 contract.
- Checks: 75 focused UI/advisor/actual-contract tests passed; mobile/development API typechecks and touched-file lint passed. The focused development API off-state regression passed. Mock web export and the 390×844 advisor browser flow passed: asking for an optional suggestion showed the company off-state while the rules result and route stayed available. [Phone screenshot](docs/day-run/screens/advisor-gate-ai-off-light.png).
- All provider responses in tests are fake. No paid call, hosted acceptance or physical-device result is claimed. Full mobile suite and independent review remain parent integration checks.


## October 28, 2026 — Day-run resumable finish follow-up

- The HTTP adapter treats a queued finish response as pending. It polls job metadata for up to one minute, then reports that the server is still preparing the review. It confirms completion by replaying the original POST with the same command key, rather than trusting a session's latest job alone.
- Stop checking, background and screen leave cancel local polling. This does not cancel the server job. A later tap resumes the same persisted command key. Logout/company changes fence the entire polling run, including waits between requests.
- Ambiguous dispatches use FINISH_REVIEW_REQUIRED and retain the original key. They never automatically start another provider attempt. Definite pre-processing failures keep the existing deliberate-retry path. The mock and synchronous development API remain supported.
- The screen no longer says to keep the app open. It shows a Stop checking action while checking finish. Nothing navigates to closing until this exact command is acknowledged complete.
- Validation: the final adapter/actual-contract/retry-key group passed 67/67 tests. It includes queued/eventual completion, timeout/resume, cancellation before and during a status response body, logout, failed/review-required jobs, empty acknowledgments and command binding. The request timeout/cancel guard now covers response bodies as well as headers. The final actual served D5 contract was regenerated from local port 4321; polling metadata uses its generated MobileFinishJobStatus type.
- Mobile typecheck, touched-file lint, mock web export and the retained 390×844 advisor browser flow passed. The browser still completes the fictional closing review and opens a linked follow-up plan. Full mobile suite/CI and independent red team remain parent integration work. Providers are fake; no real device, hosted API or paid call is claimed.


## October 28, 2026 — Day-run meeting closing

- Added an outcome checklist: Met, Partly met, Deferred or Dropped. Deferral requires a consenting attendee owner and an explicit date/time. Partly met outcomes require a follow-up plan. Local edits stay drafts until the save is acknowledged; failures retain the edits.
- Closing shows the server's readiness. Complete remains unavailable while local edits are unsaved or server checks fail. Completion appears only after a meeting read acknowledges COMPLETE. Existing source review edits action owners/dates and keeps proposal acceptance separate from owner confirmation.
- HTTP and mock repositories support outcome review and version/hash-bound completion with stable retry keys. A completed meeting with deferred items offers a linked next-meeting plan. The fictional development API supports the same closing commands and shared rules.
- Checks: 24 advisor repository tests passed, followed by 31 UI/actual-contract tests (three closing UI and 28 contract cases). The full shared suite passed 78/78. The targeted development API closing test passed. Mobile and development API typechecks, repository lint and final touched-file lint passed. Actual DutyGraphV2 advisor wire types were regenerated from the served local API at port 4321 after its closing version pins/provenance update. An initial typecheck ran before mobile installation finished and failed on missing React Native types; the completed-install rerun passed.
- A mock web export passed with one Metro worker. The maintained advisor browser flow passed at 390×844 through proposal acceptance, deferred-outcome save, acknowledged COMPLETE and explicit linked follow-up planning. [Screens](docs/day-run/screens/) include closing review and completion; the completion image was visually inspected. Browser data was fictional and all providers simulated.
- Self-review also pinned a local outcome draft to the session version at edit start. If another save changes the server review, the app requires explicit reload instead of overwriting it with a newly refetched version. Inputs lock while saving. The regression covers this two-tab boundary.
- The D2 freeze retained foreground finish; the D5 follow-up below replaces it for queued actual-backend jobs.
- Providers in tests are fake. No hosted database, paid provider, native build or real device was exercised. Full suite/CI and independent red team remain parent integration work.


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

## 2026-10-28 — Earn phone B2.4: final handover

B1 web and B2 phone plus both five-reviewer red teams are complete within the documented contract boundaries. Corrected phone code checkpoint: `6bfcdb2d4a0370d521cfaa48d55c85e98c32b0e2`. Post-correction real-enrollment fake-HTTP journeys passed360/1280 with zero page/render errors, overflow or microphone use. Fresh production export and static-release guard passed before any new Earn seed request;19 screenshots/two results files are refreshed. Actual pending helper/session storage paths were used; browser storage remains memory-only, not native persistence evidence.

Final local checks: mobile552/552, dev-server76/76, shared78/78, TypeScript/lint passed. Web2774/2774 and build/TypeScript passed. Do not add overlapping targeted counts. Mobile audit still exits1 for20 package findings (14low/3moderate/3high) through SDK57 build tooling; root/dev audits0, web high-threshold passes with one moderate. No physical phone, native voice/share/clipboard/accessibility, signed build, hosted backend, real provider or live payment acceptance was run.

[Full cross-repository handover, integration results, contract needs, open questions and next three steps](https://github.com/mattrob333/DutyGraphV2/blob/codex/earn-client/docs/earn-client/PROGRESS.md). [Web draft PR195](https://github.com/mattrob333/DutyGraphV2/pull/195) on codex/earn-client into matt/dev; [phone draft PR4](https://github.com/mattrob333/DutyGraphApp/pull/4) on codex/earn-phone into main. Both remain draft/unmerged. No A server source or legacy participant contract was changed. Production standalone spoken-draft save and safe advisor blind approval remain unavailable until A adds the documented data/routes.

## 2026-10-28 — Earn phone B2.5: final enrollment boundary

A final independent transport probe reproduced R2-03: capability discovery and the following POST each captured a different session generation, allowing old reviewed words to be posted after replacement enrollment. Generation now spans the whole repository operation, the outer spoken-draft capability check and synchronous pending callback dispatch. The actual ApiClient regression failed before and21 focused tests passed after; full mobile553/553, TypeScript and whole lint passed. Dev-server76/shared78 remain unchanged and passing. This sixth confirmed Medium is fixed; original review reports and exact counterexample are in docs/REDTEAM.md. Final repeated browser/export and corrected-head CI follow. Audit/device/backend limitations remain unchanged.

## 2026-10-28 — Earn phone final close

Final corrected code `f01d76a1e355df41af990cab9e7e2619ddfaa436`:553/553 mobile tests (65 suites), TypeScript/lint passed. Unchanged development-server76/shared78 checks remain passing. After R2-03, actual-enrollment fake-HTTP360/1280 journeys passed again with no page/render errors, overflow or microphone calls. Fresh release export/static fixture refusal passed before seed reads; normal legacy enrollment still worked. Evidence refreshed in docs/earn-client/BROWSER.md. Browser normal flow checks compatibility; the focused actual-transport regression verifies the hostile enrollment interleaving. Only owned QA servers were stopped and ports4510/4512/4513 verified clear.

Six confirmed Medium findings and all reported Lows are corrected, no confirmed High. Audit remains failed on the documented Expo toolchain path; no native/device/provider/payment acceptance was run. Final shared handover and both draft PR links above are authoritative; neither PR is merged.
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

## 2026-10-29 — Meeting review corrections

Task Card proposals now show the linked card title and identity and load a read-only, company-scoped source or saved draft. Reviewers can change the affected attendee, choose an existing or new Task Card, and select an owner by name before acceptance. Current values come from the selected card. Acceptance creates a separate draft; that proposal cannot be edited or accepted again. If a later source correction makes it stale, explicit rejection releases closing review while preserving the draft and explaining its separate review requirement. HTTP, mock and development API paths use these same rules.

Verification: 47 focused mobile tests and all 67 development API tests passed in the final correction run. The earlier complete mobile suite passed 572 tests, and shared tests passed 78. These counts describe distinct checks, not a repeated full final suite. Native/device, paid providers and hosted deployment remain unverified. Served advisor/extras snapshots were synchronized with the backend's scoped Task Card reads; participant-v1 stays intentionally pinned.

Phone review: the fake-provider HTTP walkthrough passed at 390×844: linked-source inspection, target/person/owner adjustments, acceptance, read-only saved-draft inspection, and absence of mutation buttons after draft creation. Three screenshots are in `docs/day-run/screens/advisor-taskcard-*-light.png`. No horizontal document overflow or browser page errors were observed. The first harness attempts incorrectly waited on text in stacked question cards; waiting on the accessible current heading corrected the automation without changing gate checks.
