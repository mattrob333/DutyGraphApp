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

## 2026-10-28 — Earn phone B2.0 foundation

Added separate generated Earn types and adapter, authenticated scoped fixture routes and production fixture refusal, sharing the existing participant transport/refresh lifecycle. Seven dev HTTP and67 focused phone/transport checks and both TypeScript checks passed. Added SDK-compatible clipboard support and non-breaking dependency fixes; remaining Expo CLI/Zod3 audit findings are recorded without a forced SDK downgrade. Phone screens and final reviews follow; no real provider, money, device, hosting or DutyGraphV2 server/schema changes.
