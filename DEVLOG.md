# October 28, 2026 — Explicit meeting closing review

Added per-outcome dispositions, deferral owner/date input, partial-outcome follow-up and a server-acknowledged Complete action. Completion uses the current session version/hash and existing durable retry-key mechanism. Local failed-save drafts remain editable. Accepted action owner/date changes use the existing source review instead of bypassing evidence review. A completed meeting can seed a linked next plan with deferred work.

HTTP/mock adapters and the fictional development API share the closing rule. The development contract is regenerated from its source. Mobile/development API typechecks, lint, 24 advisor tests, 31 UI/actual-contract tests, 78 shared tests and the targeted development API closing regression passed. A mock web export and 390×844 advisor browser flow passed through acknowledged completion and linked follow-up planning; screenshots are in docs/day-run/screens/. Local outcome drafts retain their original session version; concurrent server changes require explicit reload. Full mobile suite and independent review remain parent integration checks. No deployment or physical-device result is claimed.

# Development log

Latest local result (2026-10-28): 538 mobile tests/63 suites, generated-type checks, lint and all twelve actual PostgreSQL browser paths pass. Older connector-session entries below retain their historical pending/unrun status; current evidence is in PROGRESS.md and docs/verification/dutygraph-mobile-2026-10-28.json.

- Initialized standalone layout from the original seed archive; copied reference material into docs/reference.
- Read the PRD, phase plan, architecture, defaults, guardrails, and mobile agent instructions.
- Started baseline dependency installation and independent architecture/mobile reviews.

- Phase 0 baseline: root 48/48 and mobile 312/312 across 29 suites passed. Typechecks passed. Seed Jest reports an open handle after success.

- Phase 1 development API: fake participant routes, hashed scoped sessions, rotating refresh, concurrent idempotency, upstream proxy, fake/OpenAI provider interfaces. 14 provider/API tests and server typecheck passed; browser integration pending.

- Meeting API milestone (phases 6–12): advisor pairing, POWER/gate/Pulse, consent and chunked audio, transcript revisions, coach/facilitator, closing, speaker mapping, sourced proposals, kickoff/setup. Backend 35 tests, typecheck and lint pass; 93.43% line coverage. OpenAPI covers 57 operations with HTTP conformance checks.

- Integrated participant and advisor mobile workflows: deck voice, fallback capture, AnswerCard recovery, versioned Task Cards, Pulse, company pairing, POWER/gate, consent, live session controls, results, speaker review, kickoff and setup.
- Verified strict outgoing advisor request bodies against the proposed OpenAPI schemas; corrected transcript, speaker, consent and notes payload mismatches found by HTTP browser tests.
- Hardened offline logout, company query scoping, role replacement, audio origins/cache cleanup, secure-storage writes and durable retry keys. Added a mock-only guided Demo tour.
- Shared suite now 78 tests and 96.75% executable lines; handsfree/meetings coverage 90% gate passes at 93.15%. CI now runs all package checks, scoped coverage and a mock browser smoke flow.
- Captured phone-size dark/light screenshots and reviewed gallery, Task Cards, plan and sourced results against the supplied design. Device/provider outcomes remain explicitly unverified.

- Final integrated verification: 428 mobile tests across 48 suites, 78 shared tests, 37 API tests; typechecks, lint, web export and pinned-contract regeneration pass. Line coverage: shared 96.75%, handsfree/meetings 93.15%, API 91.26%. Added mobile-local Ajv dev dependencies so contract tests do not rely on another package’s installation order.
- Browser A–I portions are recorded precisely in DEVICE-QA: fake providers/scripted speech only, no native or production claims. Saved 77 phone-size captures and completed the explicit-action demo tour.

- Continued after owner waived Gemini. Reopened native PCM and optional facilitator WebRTC implementation, deeper backend/participant review, and remaining HTTP end-to-end paths. Device verification remains distinct from code implementation.

- Continuation: implemented local Expo PCM capture and same-engine rolling WAV backups, plus flagged native WebRTC facilitator input/output. Both platforms autolink; isolated Expo prebuild succeeds. Native compilation/device execution remain unverified.
- Closed end-to-end gaps in declined consent, all eight setup topics, participant-only wrap-up and stale evidence rereview. Added a fresh-server 12-flow HTTP runner to CI and a manually triggered native compile workflow.
- Fixed cross-session request/refresh/draft/queue races, stale speech callbacks, backup echo/merge boundaries, source audio offsets, consent-withdrawal caches and async model races. Raw single-phone audio now requires all attendees to consent.
- Continued verification: shared 78 tests/96.76% lines; API 60 tests/92.50% lines; mobile 488 tests across 57 suites; handsfree/meetings 94.52% lines. Gemini review was waived by the owner and is not a blocker.

## Repository handoff — 2026-10-27

Expanded the root README with a repository map, verified build status and links to the implementation handoff. Prepared all completed implementation, regression tests, screenshots and documentation for the owner's requested push to `main`. This documentation-only update does not change runtime behavior; the verification evidence remains recorded in PROGRESS.md.

## Finishing pass — 2026-10-27 (Claude)

- Advisor screens: shared tab bar with active pill, POWER controls in two rows, speakers shown as Speaker 1/Typed note, no raw segment ids, plain date fields, coach question as the main line, compact timer pill, Export results with native Share.
- Real-provider rehearsal script; fixed finish sending .m4a recordings as `audio/aac` (OpenAI rejected every real recording). Results in PROGRESS.md.
- Native build workflow now produces an installable release APK, triggered by the `build-android` PR label or by hand.
- Verified: 488 mobile, 78 shared and 60 API tests; typechecks and lint; all 12 HTTP browser flows.

- 2026-10-28 (draft `codex/live-backend`, preparatory P4): Added an amber warning when a meeting proposal cites instruction-like source text. The warning is informational: it does not auto-accept, change, or reject proposals. Added a pure helper and 11 Jest cases. This change was reviewed as source only; Jest/typecheck/lint/device QA were not run in this GitHub-connector session. Sprint 1's production API and the rest of Sprint 2 remain pending.

- 2026-10-28, Sprint 2 P2: implemented a validated backend profile resolver and routed the advisor repository through the same resolved origin as participant requests for DutyGraph profiles. The legacy `http` alias remains opt-in for meetings; `mock` stays the default. Added profile/security regression tests and environment docs. Tests, typecheck, lint and device QA **not run** (GitHub connector only; no local repo checkout). No production deployment or provider call.

- 2026-10-28, Sprint 2 P4: added a native iOS backup-excluded Application Support location for meeting recordings; temporary recording now targets Cache. Restore migrates legacy Documents clips after persisting the new manifest; logout clears both directories. Added recovery and private-path Jest checks. Native Swift compilation, Jest, and iPhone backup inspection **not run**; Expo Go/old native builds fail closed for meeting recording on iOS. No provider calls.

- 2026-10-28: Corrected the iOS legacy Documents path normalization regular expression and updated the `File` test mock to accept SDK directory objects. This is source-level correction only; Jest, typecheck and native builds not run.

- 2026-10-28, Sprint 2 P4: production-profile invitation URL builder now targets HTTPS dutygraph.com, preserving respond.dutygraph.com and custom scheme for mock/dev. Added profile-specific URL assertions, updated inline route comment and documented EAS signing, iOS AASA and release prerequisites. Tests and native link verification **not run**; server AASA and signing remain open. No production changes or provider calls.

- 2026-10-28: GitHub Actions mobile verify failed at TypeScript because two new Jest files lacked explicit `@jest/globals` imports and native recording migration used the DOM `File` type rather than the Expo file object. Fixed both from CI diagnostics. Earlier shared checks passed; full mobile verification **pending rerun**. Dependency audit reported 5 high advisories during installation (not attributable to new dependencies; none were added). No native device checks.

- 2026-10-28, actual-backend continuation: installed all three frozen npm lockfiles on Node 24. Baseline passed 513 mobile tests, 78 shared tests and 64 development API tests with typechecks/lint. Added actual V2 served-contract generation, generated wire adapters and a same-origin PostgreSQL twelve-flow browser runner with fresh synthetic tenants, authenticated pairing, private temporary manifests and schema-validated traffic. Real-profile edits/routing/closing bind reviewed versions/hashes; kickoff note acknowledgments retain revisions. Legacy HTTP browser paths remain compatible. Current final run evidence is recorded in PROGRESS.md.
- Fixed advisor logout/refresh isolation: local role data clears before remote revocation; stale successful/failed refreshes and old in-flight company responses cannot affect the next login. Added four race regressions and two reviewed-command cases. Protected voice-cache URLs accept declared WAV/MPEG formats without weakening origin/path checks. Added native cache security tests. Review also fixed iOS M4A fallback recording storage and legacy migration; physical-device backup exclusion remains unverified.
- Applied compatible lock-only `node-forge`1.4.2 and `source-map-js`1.2.2 fixes. High audit findings fell 8→3; the remaining nested Expo CLI Zod 3 advisory and its propagated Expo/CLI findings need an upstream-compatible fix. No forced major override, production provider call, signing operation or app release.

- 2026-10-28 review correction: meeting budget labels now describe estimated dispatch limits and estimated reserved use, including failed requests; actual provider cost may differ. Facilitator defaults use the server's $15 estimate for both TTS and realtime, with $2 for other meeting modes. These are enforcement estimates, not billing evidence.

- Final frozen-backend verification: regenerated both served contracts/types after the final participant live/realtime changes; all twelve actual PostgreSQL browser paths passed with 219 schema-validated exchanges. Final generated TypeScript/lint passed. Fixed interrupted-run private-manifest cleanup and verified SIGTERM removes the directory/stops its server. Sanitized evidence is stored in docs/verification/dutygraph-mobile-2026-10-28.json.
