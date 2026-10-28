# Development log

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
