# October 29, 2026 — My work matches the web: Task Card gallery, With your AI now, Connected

matt approved the Task Card gallery design and wants the web and phone to match. The phone now follows the shared spec (/mnt/project-files/app-ux/task-card-gallery-spec.md, mockup https://claude.ai/artifact/KE5oV3e6mDpAivrwzWWXmz).

- **My work** (`/earn/drafts`, was "From your AI"): "With your AI now" shows one row per task with a 10-part meter and a pill (Your AI is asking, Check it in the chat, ✓ Card ready). A task leaves once a card has the same title. "Your Task Cards" is one gallery of waiting and confirmed cards, two tiles per row, with All / Manual / AI help / Mixed chips and counts. Tiles have a work-type band (Mixed is half amber, half blue), a chip, a status (New for 15 minutes with a mint ring, Check it, Confirmed or the claim state), the title and how often · how long. "Send more cards" folds to "✓ Connected to <app>" once an AI app has used the connector.
- **Open card**: the same band and chip ("Mixed: hands-on and AI help") above the title.
- **Tokens**: `blue`/`blueBg` (AI help) and `lilac`/`lilacBg` (Mixed) in dark and light themes.
- **Data**: `listDiscoveries()` reads DutyGraphV2 `GET /api/mobile/v1/earn/discoveries` (DutyGraphV2 #210); a 404 means no rows. The dev server serves a fictional row and a connected ChatGPT.
- `scripts/e2e-earn.mjs` follows the new labels and saves a `my-work-gallery` screenshot.

Checks: mobile typecheck, lint and Jest (77 suites, 650 tests); dev-server typecheck, lint and tests (79); fake-HTTP browser journey at 360 px passed with no page errors, overflow or microphone use. No device or hosted backend.

# October 29, 2026 — One client app: Connect your AI and company Files on the phone

This branch (`claude/voice-client-app`) joins the Earn phone work (#4) and the live backend work (#3), then adds the two client screens the phone was missing, so the voice interviews, Earn and the MCP flow sit in one app.

- **Connect your AI** (`/earn/connect`): the plain `<origin>/api/mcp` OAuth connector link with Copy, a "do not paste it into a chat" warning, step lists for claude.ai and ChatGPT, what to say (start, Build my Task Cards, Find more tasks, Show my Task Cards), Share the steps to a computer, and the bring-work prompt as the no-connector fallback. Text matches the DutyGraphV2 web client (client/src/earn/SendMore.tsx).
- **Files** (`/files`, `/files/view`): Company and Mine tabs, folder breadcrumb, file view with linked files. Reads DutyGraphV2 `GET /api/mobile/v1/files` and `/files/file?path=` (DutyGraphV2 branch claude/project-thread-kql8vh), which returns only the Company Repo files shared with the team member. Mock mode shows three fictional files. Uploads stay in the web app for now.
- Me shows Connect your AI and Company files under Your work.

Checks: mobile typecheck, lint and the whole suite (76 suites, 645 tests) pass. No device, hosted backend or real AI connector was used.

# October 28, 2026 — Optional meeting gate advice and adapter contract sync

The meeting plan now exposes an explicit optional AI second opinion through the repository. It labels the reason as a suggestion, keeps the rules result visible and never changes the route. Off/unavailable/over-budget states explain that the rules still apply. Mock/development workflows remain off by default; no provider settings authority was added.

Regenerated actual served wire artifacts against the final combined mobile/adapter source at 27503b89. Extras now includes AI_USAGE_RECORD_FAILED. Validation: 75 focused tests, mobile/development API typechecks, touched-file lint, a development API off-state regression, mock export and the 390×844 advisor browser flow passed. See PROGRESS.md and the dated phone screenshot. Providers remain fake; no hosted or device acceptance is claimed.

# October 28, 2026 — Resume queued finish checks safely

The actual-backend HTTP adapter polls queued finish jobs and requires the original command receipt before showing closing. Local polling stops on cancel, background, screen leave or identity change. Pending and ambiguous outcomes retain their retry key; an ambiguous provider dispatch requires advisor review instead of another automatic attempt. The synchronous development/mock flows remain supported. The screen explains that the server can continue after local checks stop.

The final 67-test fake-HTTP/actual-contract/retry-key group passed. It covers pending, completion binding, header/body timeouts, cancellation, identity fencing, ambiguous/definite failures and retries. Mobile typecheck, touched-file lint, mock export and retained 390×844 advisor browser flow passed. The actual served D5 contract and generated job DTO were refreshed from the local backend; details are in PROGRESS.md. No paid provider, hosted API or physical device was used.

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

## 2026-10-29 — Meeting review corrections

Task Card proposals now show the linked card title and identity and load a read-only, company-scoped source or saved draft. Reviewers can change the affected attendee, choose an existing or new Task Card, and select an owner by name before acceptance. Current values come from the selected card. Acceptance creates a separate draft; that proposal cannot be edited or accepted again. If a later source correction makes it stale, explicit rejection releases closing review while preserving the draft and explaining its separate review requirement. HTTP, mock and development API paths use these same rules.

Verification: 47 focused mobile tests and all 67 development API tests passed in the final correction run. The earlier complete mobile suite passed 572 tests, and shared tests passed 78. These counts describe distinct checks, not a repeated full final suite. Native/device, paid providers and hosted deployment remain unverified. Served advisor/extras snapshots were synchronized with the backend's scoped Task Card reads; participant-v1 stays intentionally pinned.

Phone review: the fake-provider HTTP walkthrough passed at 390×844: linked-source inspection, target/person/owner adjustments, acceptance, read-only saved-draft inspection, and absence of mutation buttons after draft creation. Three screenshots are in `docs/day-run/screens/advisor-taskcard-*-light.png`. No horizontal document overflow or browser page errors were observed. The first harness attempts incorrectly waited on text in stacked question cards; waiting on the accessible current heading corrected the automation without changing gate checks.
