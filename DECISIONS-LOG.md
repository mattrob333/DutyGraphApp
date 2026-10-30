# Decisions

| Date (UTC) | Phase | Decision | Reason |
| --- | --- | --- | --- |
| 2026-10-28 | Day-run D3 | Request optional gate advice only on a tap; render it separately and keep the deterministic result and route unchanged. | AI is advice, and off/unavailable/over-budget cases must preserve the rules. |
| 2026-10-28 | Day-run D3 | Keep mock/development gate advice off and add no provider-settings editor. | The app has no existing provider configuration UI; authorization must not be invented. |
| 2026-10-28 | Day-run D5 | Poll finish status for at most one minute; subsequent taps reuse the original command key and confirm completion through that receipt. | Keep UI waits finite without duplicating paid work or accepting another job's completion. |
| 2026-10-28 | Day-run D5 | Stop only local checks on leave/background/cancel. Ambiguous dispatch requires advisor review and retains its key. | Durable server work can finish independently; uncertain provider dispatch must not be repeated automatically. |
| 2026-10-28 | Day-run D2 | Save outcomes separately from Complete; Complete requires the current server session version/hash and no unsaved outcome changes. | Outcome review must not imply acknowledged meeting completion. |
| 2026-10-28 | Day-run D2 | Require an explicit timezone on deferred dates; preserve draft input after a failed save. | Avoid silent date/time conversion and retry data loss. |
| 2026-10-28 | Day-run D2 | Link a follow-up meeting explicitly with previousMeetingId; never create a meeting automatically. | Deferred work carries forward only when the advisor starts the next plan. |
| 2026-10-27 | 0 | Use the existing DutyGraphApp Git repository and work branch as the standalone mobile repo. | User opened this repo; it contains only the uploaded brief/archive and no upstream app. |
| 2026-10-27 | 0 | Extract the original archive, rather than copying generated setup artifacts. | Preserve the supplied seed exactly and make installs reproducible. |
| 2026-10-27 | 0 | Interpret participant-only seed instructions as applying to participant screens. | The approved PRD explicitly adds company-scoped advisor workflows. |
| 2026-10-27 | 0 | Continue with Astra and GPT-6.1 Sol while Gemini review is unavailable. | Requested CLI/skill/auth are absent; no invented model substitution or credentials. |
| 2026-10-27 | 0 | Use installed SDK 57 source/types if versioned docs are inaccessible. | Proxy denied docs.expo.dev; no bypass attempted. Device behavior remains unverified. |
| 2026-10-27 | All | Develop independent components in parallel after the seed baseline, then gate integrated milestones with full checks. | User explicitly requested a team; shared contracts establish dependencies before integration. |
| 2026-10-27 | 14 | Serialize secure-record operations and commit chunk pointers last. | Preserve drafts across write failures; keep legacy chunk reads compatible. |
| 2026-10-27 | 6–14 | Keep existing v1 logout keyless; require keys for new commands. | Preserve the pinned participant client while enforcing new command idempotency. |
| 2026-10-27 | 9 | Upload audio as JSON/base64 512 KiB chunks with per-chunk and whole-segment SHA-256. | A transport-neutral resumable contract works in Expo and the local server. |
| 2026-10-27 | 11 | Keep unknown owners null and resolve confirmed speaker maps separately from source text. | No inferred ownership or mutation of evidence; acceptance checks the current confirmed map. |
| 2026-10-27 | 1 | Proxy participant additions return NOT_AVAILABLE for unresolvable real upstream identities. | Local fixture authorization must not accept arbitrary upstream bearers. |
| 2026-10-27 | 14 | Exclude only erased type declaration files from executable coverage. | Type-only files have no runtime statements; shared executable line coverage is 96.73%. |
| 2026-10-27 | 4, 10 | Expose unavailable native PCM/WebRTC adapters honestly; retain device recognition, typing and TTS. | No native build/device/provider session is available to establish those transports. |
| 2026-10-27 | 5 | Keep the pinned Task Card attestation payload exact; send change/not-mine/unknown notes through the proposed extras API. | Adding note fields to the existing correct-attestation schema would violate the deployed contract. |
| 2026-10-27 | 6, 14 | Clear local advisor state even when remote logout fails; scope queries and drafts to identity. | Offline logout and company replacement must not expose previous session data. |
| 2026-10-27 | 14 | Read staging origins from the EAS preview environment; preview builds use mock data. | An example placeholder must not override configured reachable origins. |
| 2026-10-27 | Extra | Keep demo-tour steps explicit and mock-only; route to real screens without automatic consent or submission. | A guided demo must retain the application's human review boundaries. |

| 2026-10-27 | Continuation | Remove Gemini review from required scope; continue native adapter and end-to-end implementation. | The owner explicitly waived Gemini and authorized further build work. Lack of a device limits verification, not source implementation. |

| 2026-10-27 | Continuation | Implement native PCM as a local Expo module with a same-engine WAV tee. | Avoid a second microphone owner; retain bounded recoverable audio without storing transcript text in backup metadata. |
| 2026-10-27 | Continuation | Require all attendees to consent for raw room audio; preserve explicitly attributed typed notes when someone declines. | A single-phone microphone cannot separate a declined person’s voice. |
| 2026-10-27 | Continuation | Keep native meeting recording and optional realtime input mutually exclusive pending device validation. | Prevent unverified microphone contention; default TTS facilitation remains supported with recording. |
| 2026-10-27 | Continuation | Use actual recording durations for playback and recording-local speaker clusters. | Interrupted segments are shorter than five minutes and provider speaker IDs cannot be assumed stable across files. |

## 2026-10-28 — Earn phone client defaults

Use Agent A's generated eight-operation mobile contract independently of participant v1. Share the existing participant ApiClient/context; independent refreshers can rotate the same refresh token twice. Missing settings and financial authority never come from screen input. No new Earn data is embedded in the phone bundle; release builds refuse a fixture-advertising backend. The real contract has no standalone draft-creation route, so spoken task saving uses only the authenticated development capability on loopback, not an invented production route. Voice uses existing native recognition with no provider grant; all unknown task slots remain Not stated. Clipboard uses the installed SDK57-compatible package; native acceptance remains unverified. Keep the current SDK rather than apply audit's proposed breaking downgrade; remaining tooling findings are an explicit release limitation.

## 2026-10-28 — Phone review semantics and platform accessibility

Use the existing Confirm request's optional card for local missing-slot edits, so production needs no invented PATCH endpoint. Never auto-confirm spoken words or persist local task tick boxes as execution. Preserve native accessibility state and supply web ARIA state explicitly; decorative SVG native props are excluded from web DOM. Render optional string notices through boolean conditions so empty values cannot become raw View children. Verify development fake data with Expo development mode and release refusal with a separate production export.

## 2026-10-28 — Earn phone B2.2: browser and release boundary

Development fake-HTTP journeys passed at360/1280; production HTTP export and actual static-release fixture refusal passed before any Earn seed request. Nineteen screenshots and two result files are linked in docs/earn-client/BROWSER.md. Exported JavaScript contained none of the three checked Earn seed strings. No physical phone, native microphone or hosted backend was tested. Five fresh-context reviews follow at this committed freeze.

Phone review freeze: `79c890dabcdf5587b9c31b86266994c11e4a3ef7`, pushed before five independent fresh-context reviewers. Browser evidence belongs in the existing DECISIONS-LOG.md; the mistakenly named extra log was consolidated here.

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
| 2026-10-28 | Sprint 2 P4 (partial) | Show a non-blocking amber warning for instruction-like evidence quotes; retain human decision controls. | The app red team found injected words inside draft proposals. The warning makes the source risk visible without inventing or automatically applying a decision. Native and full-suite verification not yet run. |
| 2026-10-28 | Sprint 2 P2 | Keep `http` as backward-compatible dev mode; explicit real profiles use one origin and remote profiles enforce HTTPS. Do not change deployed EAS profiles until real endpoints pass. | Avoid cross-origin bearer leakage and preserve mock/dev-server demos while backend porting remains incomplete. |
| 2026-10-28 | Sprint 2 P4 | Fail closed for iOS meeting evidence if backup-excluded native directory is unavailable. Keep temporary recordings in Cache and migrate legacy Documents clips on restore. | Avoid silently writing private meeting audio into iCloud-backed Documents on older builds; preserve saved upload state during migration. |
| 2026-10-28 | Sprint 2 P4 | Use dutygraph.com HTTPS App Links only in explicitly selected production backend builds; retain existing invitation origin and custom scheme in mock/dev. | Avoid breaking demo links and avoid claiming iOS Universal Links work until the server AASA and signed app are verified. |
| 2026-10-28 | Actual backend P1/P3 | Generate separate advisor/extras wire types only from the running V2 server; keep participant v1 pinned. Bind browser traffic to served schema hashes. | Avoid treating the old proposed development contract as production evidence. |
| 2026-10-28 | Actual backend P3 | Use actual V2 createApp and PostgreSQL with injected test providers, fresh fictional tenants and private ephemeral manifests; serve SPA/API on one origin. | Exercise deployed-style routes/auth/storage without adding a public seed endpoint or relaxing production origin policy. |
| 2026-10-28 | Actual backend P4 | Clear advisor access before remote logout and fence every in-flight response/refresh by session generation. | An old request must not restore tokens or erase a later login. |
| 2026-10-28 | Actual backend P4 | Retain reviewed version/hash and exact-command identity through real-profile edits, routing, closing and kickoff acknowledgments; preserve legacy request shapes. | A retry cannot silently substitute a newer review or reuse a key with changed content. |
| 2026-10-28 | Actual backend P4 | Cache extensionless protected voice URLs only with declared WAV/MPEG format and exact same-origin path validation. | Correct native file formats without granting bearer credentials to arbitrary URLs. |
| 2026-10-28 | Actual backend P4 | Apply compatible audit patches; retain Expo CLI's declared Zod3 dependency pending an upstream fix. | A forced major override would create an unverified toolchain change; remaining advisory is documented. |

## 2026-10-29 — Keep accepted drafts independent

Accepted Task Card proposals are immutable because they already created a separate advisor draft. A stale proposal can be explicitly rejected so closing can continue, but this does not edit or delete that draft. The UI states that requirement and exposes scoped read-only inspection. Owner changes use named selections, and source/card changes update the displayed current value. No automatic acceptance or source-card write is introduced.
