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

## 2026-10-28 — Earn phone B2.1 screens

Added the Me entry and phone Task Card, Earn, scoreboard and gap/fix screens with native-recognizer reuse, local missing-slot review and acknowledged commands. Corrected cross-platform SVG/checkbox accessibility and invalid raw/empty View children found by the real development browser. The full mobile527/dev71/shared78 suites, TypeScript/lint and360/1280 fake-HTTP walkthrough passed; earlier load-sensitive old-test timeouts remain documented, not rewritten. Native voice/device, actual backend phone integration, production fixture refusal and final independent review are separate evidence. No live payment/provider or DutyGraphV2 server changes.

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
