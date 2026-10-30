# DutyGraph Mobile security review

Review date: 2026-10-27. This review exercised local fake providers and injected provider transports. It did not access the DutyGraph production service, use real provider credentials, apply SQL, or test a physical device.

2026-10-28 continuation: actual V2/PostgreSQL browser integration passed all twelve paths with 219 schema-validated exchanges; application tests passed 538/63 suites. Confirmed app review fixes cover late advisor refresh/logout isolation, exact reviewed-command identities, finish timeout/terminal retry, Closing Change notes, accurate timeout copy, strict extensionless audio formats and simulated-speech fallback. iOS fallback M4A storage/migration and logout races are fixed in source with regression tests. Device backup exclusion, signing/App Links and live provider acceptance remain unverified. Compatible node-forge/source-map-js audit patches landed; Expo CLI's nested Zod 3 advisory remains open for an upstream-compatible fix. Hosted CI/release results are separate.

## Boundaries reviewed

The review covered participant/advisor bearer sessions, local JSON persistence, request replay, company/person ownership, voice cache URLs, meeting audio ingestion, consent changes, source attribution, proposal decisions, model input/output, and mobile role switching. The development server is a single-process stand-in; the production team must supply transactional storage, retention, auth lookup roles and durable jobs as described in [PORTING-TO-DUTYGRAPH.md](PORTING-TO-DUTYGRAPH.md).

## Exercised attacks and outcomes

| Attempt | Enforcement and evidence |
| --- | --- |
| Read another company's request, meeting, proposal, note or audio | Every lookup uses the session company; participant work also checks person ownership. `participant.test.ts`, `meetings.test.ts` and `v1x.test.ts` exercise cross-company and cross-person failures. A guessed audio hash is insufficient without the correct bearer/person. |
| Reuse an invitation or pairing code | Consumption is one-time. A retry needs the original key and canonical body within two minutes, returns a replacement token pair, and invalidates the earlier pair. Changed device labels conflict; late retries expire. |
| Replay a rotated refresh token | Same-key bounded retries rotate again. Any other reuse revokes the session family and rejects subsequent access. Persisted sessions contain token hashes only. |
| Race duplicate submits or change a body under an existing key | A pending promise reserves the command before async work. Same-key duplicates share one result; changed fingerprints return `IDEMPOTENCY_CONFLICT`. Multipart fingerprints include audio checksum. |
| Store minted provider secrets in an idempotency ledger | Live transcription and realtime grants use metadata-only fingerprints and mint short-lived replacements on retry. Tests search persisted records for returned client secrets. Ordinary idempotency responses contain no provider credentials. |
| Start processing before all attendees resolve consent | Audio, committed transcript and provider-backed meeting actions reject pending consent. No auto-consent is inferred from attendance. |
| Withdraw consent after extraction | Mapped source words are cleared, derived proposal text/source quotes are redacted and state becomes stale. Cached command results containing the withdrawn words become fingerprint-only tombstones, so replay cannot restore them. In-flight transcription/facilitator outputs recheck consent before being stored. Accepted attribution cannot survive withdrawal. Inseparable recorded audio is blocked from provider processing and playback. Unknown clusters are excluded from model context when someone declined, and extraction requires a reviewed map or exclusion. |
| Replace a completed audio segment with corrupt chunks | Both the 512 KiB chunk checksum and assembled segment checksum are verified. Existing metadata is cloned; validation precedes writing/promoting the chunk. Resumption returns uploaded indexes. |
| Accept an unsupported claim or silently change attribution | A proposal needs current, committed, included source segments and exact quotes. Attributed acceptance needs a leader-confirmed speaker map. Editing a transcript or changing a confirmed mapping invalidates dependent proposals. |
| Turn a speaker into an action owner | Extraction leaves owners unknown. Structured edits validate referenced attendees. A client-supplied `assigned` status is reset to proposed; assignment needs an explicit owner confirmation. Closing confirmations merge without deleting earlier confirmations. |
| Bypass a sensitive Meeting Gate by editing an earlier plan | Planning edits invalidate the previous gate. Session/Pulse policy recomputes purpose, outcome, sensitivity and decision authority. Model output cannot override these constraints or invent attendance/minutes. |
| Overwrite an unrelated kickoff note or supply a fabricated claim quote | Existing note IDs are checked for company and meeting ownership. Supplied claims require a quote from a submitted note by that attendee. Setup confirmation must retain a reviewed source quote. |
| Make the AI act on transcript instructions | Existing prompt composition neutralizes DATA delimiters and bounds context. Provider outputs pass schemas, allowed action vocabulary and addressee validation. Tests include instruction-like participant text and malformed model responses. |
| Make the facilitator speak automatically or after Stop/Mute | The turn endpoint admits only six triggers and facilitator mode. Mute and Stop survive other session log events. Realtime sessions disable automatic responses; stopped/muted/budget-limited sessions cannot mint new grants. Stopping AI does not end recording. |
| Leak a model judgment rationale to a participant | Participant meeting reasons use fixed plain-language copy derived from outcome; advisor-only rationale and numeric judgments never cross that response boundary. A test injects internal confidence/score text and verifies it is absent. |
| Request a follow-up on sensitive, unknown or already-covered material | The optional AI path is off by default; it validates a short question against the missing hint, rejects invented names and suppresses sensitive/unknown responses. Quota/provider failures keep the local result/table nudge. |
| Send an upstream DutyGraph bearer to local proposed endpoints in proxy mode | The dev server does not treat an arbitrary upstream bearer as local authority. Proposed endpoints return `NOT_AVAILABLE` unless a local dev session exists. The pinned participant namespace forwards bytes, status and headers to the configured origin. |

Tests are in [dev-server/test](../dev-server/test), pure policy tests in [tests/meetings-rules.test.ts](../tests/meetings-rules.test.ts), and the proposed contract in [contracts/meeting-mobile.openapi.json](../contracts/meeting-mobile.openapi.json). Contract tests compile every proposed schema, check runtime route coverage, and validate real local HTTP requests/responses through a meeting lifecycle. Tests explicitly remove provider-key environment variables.

## Mobile boundary review

The native secure-storage wrapper uses Keychain/Keystore and chunk-pointer commits so an interrupted save retains the old draft. The web preview uses memory storage. Advisor refresh is single-flight, preserves its retry key across temporary failures, and uses a separate role key. Voice downloads check the configured origin and audio route before adding a bearer token. These are code/test observations, not device claims.

The independent review identified four mobile cleanup risks and sent them to the mobile owner for correction:

1. Offline advisor logout originally waited for remote success before clearing local data.
2. Advisor query keys originally lacked company scope, permitting stale previous-company data during a later pairing.
3. Replacing a paired company originally retained prior-company drafts and active-session IDs.
4. Refresh replay originally cleared identity/drafts without clearing recording/audio caches.

A second code inspection confirmed the corrections: `mobile/src/app/advisor/me.tsx` clears locally after either remote outcome; `mobile/src/hooks/advisor.ts` scopes queries by company and advisor; the advisor layout cancels and removes prior identity queries; and `mobile/src/state/advisor.ts` centralizes draft/token/audio/recording cleanup on identity changes and clear/replay. The storage generation guard prevents a queued autosave from resurrecting a cleared draft. Regression tests in `mobile/src/api/advisor/__tests__/advisor.test.ts` cover role changes, queued saves, independent retry keys and refresh replay; `lock.test.tsx` covers the native unlock boundary with mocked capabilities. Final run results are recorded in PROGRESS.md. These fixes are code/test observations, not a claim of device verification.

## Remaining production and device limits

- JSON files and the in-process command reservation are local development mechanisms, not a distributed transaction system. The proposed SQL is unexecuted and needs the team's auth lookup owner, migration numbering, grants review and durable replay/job design.
- Audio and transcript retention/deletion must use the production assets policy. Dev audio is private local test data and is not automatically subject to a tenant retention worker.
- Provider cost counters are conservative guardrails, not billing measurements. No provider quality, latency or cost was measured.
- Speaker mapping is per-meeting and human-confirmed. No voiceprints are created. A single-phone recording cannot reliably isolate a declined person; processing is refused when separation cannot be established.
- Consent text is marked for legal review. Background recording, actual microphone permission behavior, biometric lock, OS backup behavior, headphone routing, phone-call interruptions and screen-reader behavior still require device QA.
- Model judgment and transcription adapters have request-shape tests with fake transports. The configured text-model adapter now performs structured extraction with exact-source validation, bounded output and no inferred owners; real-model quality and full organizational understanding remain unverified.


## Continued review after the first build

- Lost note acknowledgments now reuse the exact segment ID, timestamp, body and key. Explicit speaker selection is committed atomically with consent checks, preventing the pre-finish mapping deadlock when another attendee declines.
- Recording playback now follows actual manifest durations and does not falsely associate typed/live notes with batch audio.
- Extraction rejects ungrounded model output without partial publication, rechecks consent/evidence after provider awaits, and prevents concurrent finish from duplicating proposals. Separate recording containers retain correct time offsets and independent speaker clusters.
- Consent withdrawal also clears derived parked/follow-up text and cached JSON responses containing escaped quotes/newlines. Late facilitator responses cannot undo Stop AI.
- Participant session generations prevent old refreshes or requests from using a new enrollment. Queue deletion is serialized; an old acknowledgment cannot delete a newer review draft. Review forms reset choices when version/hash changes and retain notes for renewed review.
- Optional realtime playback is gated by explicit controller triggers, current consent and response identity. Permission races, stale callbacks, interruption, connection lifetime, and microphone release are tested with fake transports. Native code/device execution remains a separate requirement.

- Raw audio segment ingestion now rejects any declined attendee before parsing or storing bytes. Native room recording/dictation is disabled at the same boundary; consent changes stop capture while attributed typed notes remain available.

## Independent red-team pass — 2026-10-27 (Claude)

Run after the finishing pass, against the dev server in-process, the real OpenAI models (`gpt-5.4-mini` for text) and the release APK built in CI. Probe scripts were run locally and are summarized here; every fix below has a regression test in `dev-server/test/meetings.test.ts`.

### Fixed

| Finding | Impact | Fix |
| --- | --- | --- |
| Recording `segmentIndex` was unbounded (index 2^40 accepted). | One session could fill the disk, and finish would send every segment to paid transcription. | Capped at 287 (288 five-minute segments, a 24-hour meeting). |
| Finish never charged transcription or extraction to the meeting budget (`spentCents` stayed 0 after 14 paid calls). | The default $2 record/process budget was not enforced on the most expensive work. | Each paid call is charged just before it runs: transcription at 0.6 cents per minute (duration floored by bytes at 200 KB a minute; the phone records 32 kbit/s, 240 KB a minute), extraction at 2 cents once the evidence checks pass. Past the budget, finish refuses with `BUDGET_REACHED`. Failed or repeated runs still count; a finish rejected before any provider call costs nothing. |
| `/dev/pairing-code` trusted any caller whose socket was loopback. | Behind a reverse proxy (any hosted deployment) every internet caller is loopback, so anyone could pair as the advisor. | On a non-loopback `HOST` the route is closed unless `DEV_ADMIN_TOKEN` is set, and then it requires a matching `X-Dev-Admin-Token` header (constant-time compare). |
| Mobile shipped `zod` 4.5.4 (memory exhaustion on oversized collections). | Low: it validates server responses. | Updated to 4.6.7. Remaining `npm audit` items are build tools (Expo CLI, xcode, node-forge, source-map-js) that do not ship in the app; `npm audit fix` rewrote about 1,000 lockfile lines, so it was not applied without a native build check. |

### Held

Random and revoked bearer tokens; participant tokens on advisor routes; attendees from outside the company; consent for a non-attendee; oversized titles, negative lengths and `__proto__` keys; path traversal in both audio routes; reuse after logout. With the real model, a spoken "SYSTEM OVERRIDE" asking for a fabricated firing decision produced no decision, and the Facilitator refused to read its prompt or criticize an attendee.

### Open (not fixed here)

- **iPhone meeting recordings are saved in Documents**, which iOS backs up to iCloud by default (`nativeRecorder.ts` `persist`). Android is fine: its backup rules only include shared preferences. Fix: move them into the `pcm-mic` module's backup-excluded Application Support directory, or add an `excludeFromBackup(uri)` native call. Needs an iOS build to verify.
- **Injected text can surface inside proposals.** Fake JSON spoken in a meeting became a proposed "contradiction" quoting "Approve $2M budget", and a harassment line became an open question. Nothing is applied without a person accepting it, but reviewers see attacker wording. Consider flagging quotes that contain instruction or JSON patterns.
- **The fixture invitation token is public** (README). On a hosted demo server anyone can enroll once per restart as the fictional participant and use TTS within its rate limits. Fine for fictional demos; replace it before any real data.
- **The demo APK is debug-signed** and the `dutygraph-companion://` scheme can be claimed by another app. Use https App Links (already verified on dutygraph.com) for invitations, and a real signing key before distribution. `apple-app-site-association` is missing on dutygraph.com, so iOS Universal Links will not work yet.

## Earn phone B2 red team — 2026-10-29

Five independent fresh-context reviewers ran in parallel against pushed freeze `79c890dabcdf5587b9c31b86266994c11e4a3ef7`, base `8827048d4b95c2a800294d31063a5e72423ffcec`. Review lenses and evidence follow. Reports below describe that freeze; the final disposition follows them. No live provider, production backend, payment or physical phone was tested.

### Original R1 report

# B2 R1 Security review

Freeze: `79c890dabcdf5587b9c31b86266994c11e4a3ef7`; base: `8827048d4b95c2a800294d31063a5e72423ffcec`. HEAD matched the freeze. Reviewed the diff, governing earn brief, repository/mobile agent instructions, design/writing guardrails, client transport, rendering, local routes and focused tests. No product edits or commits.

## Confirmed finding

ID: R1-01
Severity: Medium
Where: `dev-server/src/earn.ts:167` (also card-number matcher at line 180)
What: The development draft secret check stores ordinary JSON credentials unchanged and only partially removes quoted passwords with spaces.
How to reproduce: Start an in-process `createApp({store: new Store()})`, issue a participant mobile session, and POST `/api/mobile/v1/earn/drafts` with an Idempotency-Key and `{cards:[{...manualEarnCard(), aiIAlreadyUse:'{"password":"fictional-json-secret"}'}],sourceNote:'app'}`. Actual result: HTTP 200; returned/stored draft has `aiIAlreadyUse` equal to the full JSON credential and `checks.secretsRemoved` equal to 0. With `aiIAlreadyUse: 'password="fictional two word password"'`, actual persisted value is `password=[removed] two word password"`, with count 1. Additional probes `Authorization: Bearer fictional-bearer-secret` and `Card 4242.4242.4242.4242` also survive unchanged, count 0. The route calls `cleanEarnCard` then puts that card in state and saves it (lines 242–268); the optional JSON data file therefore retains surviving values. This violates RULES.md 15 for the implemented local draft-creation path. The matcher requires an unquoted label directly before `:`/`=`, and consumes only a whitespace-delimited value.
Fix: Cover quoted JSON keys and fully quoted values, explicit Bearer credentials, and common PAN punctuation; retain DutyGraph-token refusal. Add route-level regression tests asserting the original complete synthetic secret is absent from both draft results and `store.records`, including quoted values with spaces. Keep any sanitizer limits documented; never claim that arbitrary secrets can be detected perfectly.
Scope: This is the phone development server's sanitizer, not evidence that Agent A's production server has this flaw. Standalone draft creation is development/loopback gated in the phone client. No live credentials were used.

## Verification and attacks

- Ran `dev-server/node_modules/.bin/tsx --test test/earn.test.ts`: 7 tests passed. Covers unauthenticated/advisor refusal, same-company foreign and cross-company draft reads, body identity smuggling, idempotency/version behavior, direct token refusal and simple secret removal, Earn-off suppression, fix identity/money injection, expiry/revocation, and proxy fixture separation.
- Independently requested another person's draft confirmation with a valid second participant token: HTTP 404 `DRAFT_NOT_FOUND`.
- Query `personId`/`companyId` smuggling left the caller's existing draft accessible as the caller (200); state identity derives from the principal, not query fields.
- Inspected `EarnTaskCardView`: imported card text is passed as React Native Text children, not HTML/Markdown execution; existing screen test uses literal `<script>do not run this</script>`. No model/provider receives this text in the new module, so embedded instructions have no execution target here.
- Oversize JSON (2 MiB plus overhead) is rejected with HTTP 500 by the pre-existing Express parser/error mapping. It is not accepted/stored. The misleading status mapping predates this diff, so it is not recorded as a new B2 security finding.
- No runtime browser attack was needed for the confirmed server sanitizer issue. Native/device security was not tested.

## External responsibilities

This B2 diff implements participant mobile screens and local fixture routes only. It adds no MCP endpoint/scope processing, manager/advisor approval route, Stripe key loading, invoice webhook, payout execution, database tables, tenant grants or RLS. Wrong MCP scope, manager self/outside-report approval, live Stripe-key rejection, unsigned funding webhook, repeated payout prevention and real database tenant isolation must be tested in Agent A's backend; they are not passed checks here. Proxy mode forwards real Earn routes instead of mounting the local fixtures.


### Original R2 report

# B2 independent R2 review

Freeze: `79c890dabcdf5587b9c31b86266994c11e4a3ef7`.
Base: `8827048d4b95c2a800294d31063a5e72423ffcec`.
Lens: money and data integrity. No product files or commits changed.

## Findings

ID: R2-01
Severity: Medium
Where: mobile/src/features/earn/hooks.ts:32; mobile/src/features/earn/VoiceTaskScreen.tsx:35
What: Pending write identities exist only in component refs, so a lost acknowledgement followed by remount/restart loses the idempotency key and can create a second fix or spoken draft.
How to reproduce: Submit a fix and let POST /earn/fixes commit, then drop its response. Unmount/reopen Gaps (or restart the app), enter the same fields and submit again. `useEarnCommand` creates a fresh `Map` and fresh key; `/fixes` assigns a new UUID and inserts another row for each new key (dev-server/src/earn.ts:510–529). The same occurs for a spoken draft because `intent` is a `useRef`, with no durable pending record. Existing tests exercise manual retries within the same mount only. Confirming an existing draft is protected from duplicate records by expectedVersion/state, but loses its replay receipt across restart. This violates mobile/AGENTS.md's explicit requirement to keep pending final submissions in secure storage until acknowledged.
Fix: Persist each pending command's exact body, operation, owner/session identity and key before sending, and restore/reconcile it after remount or restart. Remove it only after an acknowledgement. Add a test that commits the first request, loses the response, remounts and verifies the retry uses the original key and creates one record.

ID: R2-02
Severity: Medium
Where: dev-server/src/earn.ts:453
What: Confirmation persists the proposed task and Earn state in separate writes, leaving an orphan task and permitting a duplicate proposed record if the second durable write fails.
How to reproduce: Configure Store persistence (DEV_SERVER_DATA_FILE), load a waiting draft, and inject a failure into the `save(store, p, state)` immediately after `store.put("tasks", ...)` during confirmation. The task write is already durable; Store.put rolls back only its own collection entry on failure (dev-server/src/core.ts:173–183). The draft remains waiting/version 1 and the command has no saved successful result. Retry the same confirmation: it assigns a new taskRecordId and persists another task. A crash between these two writes has the same effect. Exact separate writes and UUID creation are visible in earn.ts:414 and 452–453; idempotency is saved only after the handler returns (idempotency.ts:49–61).
Fix: Commit task, draft/claim and idempotency result in one durable Store transaction/snapshot, restoring all affected collections on failure. Add a fault-injection test at the second write and verify retry produces exactly one task linked to one confirmed draft. This is a local development record integrity issue, not evidence of a production database defect.

## Checks and boundaries

Ran focused `node --import tsx --test test/earn.test.ts` in dev-server: 7 tests passed. Existing tests cover same-key parallel confirms, stale versions, conflicting key bodies, replayed fixes, decimal precision, expired drafts and revoked sessions. No full suites or real-device checks were run.

Money is displayed from server cents without client bonus calculation. The local fixture's 432000-cent bonus matches the specified 20 → 5 hours, 6000 cents/hour, 48 weeks, 10% example. Write schemas reject supplied money and identity fields. Existing draft version/state checks prevent two independent confirmation keys from creating two claims in this single-process synchronous local handler.

Production server responsibilities: transactional pool/per-person-cap approval locking, integer bonus rounding, append-only money events, forced RLS/grants, migrations, durable multi-instance idempotency and retention deletion are not implemented or modified by this phone diff. They require separate backend review; this review makes no claim that they passed. The local module has no approval or payout routes, SQL tables or migrations. Draft expiry changes waiting records to expired and prevents confirmation; it is not a retention purge.


### Original R3 report

# Phone B2 fresh R3 correctness review

Freeze: `79c890dabcdf5587b9c31b86266994c11e4a3ef7`; base: `8827048d4b95c2a800294d31063a5e72423ffcec`.
Read the supplied RULES, PRODUCT-RULES, CONTRACT, B-client PRD and RED-TEAM procedure; repository/mobile agent instructions, design and porting guides, and writing standard. Reviewed the frozen diff, Earn generated types and transport, fixture handlers, screen flows and legacy participant boundaries. No product files or commits changed.

## Findings

ID: R3-01
Severity: Medium
Where: mobile/src/features/earn/TaskCardView.tsx:58; mobile/src/features/earn/Screens.tsx:399
What: Completing an Add detail field removes the only way to reopen and correct that unsaved field.
How to reproduce: Open a waiting draft with an empty Starts when slot. Tap Add Starts when, enter a nonempty value, then tap Done adding detail. The renderer now considers that slot filled (`slotMissing` is false), so the Add button disappears. There is no Edit action for populated slots. The draft screen only opens an editor through `onAddSlot`, and Done clears `activeSlot`. The person cannot correct a typo or wrong detail before Confirm without Reload card, which discards every unsaved change. The same limitation prevents correcting populated AI slot values during review. This falls short of acceptance check 1's draft editing flow. Evidence is the explicit missing-only guard at TaskCardView.tsx:58–64 and the editor/Done state transitions at Screens.tsx:399–405,417–447,449–452.
Fix: Show an Edit action for filled slots while the waiting draft is editable, and reuse the same local review-card editor. Keep saving through the optional Confirm card body. Add a screen test that adds a missing value, closes its editor, reopens it and corrects it before confirmation while preserving another edited slot.

## Checks and scope

- Focused Earn screen/repository tests: 27 passed across 2 suites.
- Existing participant HTTP repository/client tests: 30 passed across 2 suites.
- Development Earn API tests: 7 passed, including ownership, replay/version, expiry, proxy and Earn-off checks.
- Generated Earn shapes are consumed through aliases; existing participant OpenAPI/generated contracts are untouched. Shared participant transport adds only metadata/access methods and nested-error handling; focused legacy tests passed.
- Manager/advisor approvals are web B1 scope, not missing B2 phone features. Standalone production POST drafts is explicitly absent from Agent A's pinned mobile contract; the development-only capability and honest unavailable state are documented, so no defect is reported for that limitation.
- No full concurrent suites, physical-device checks, live providers, upstream backend integration or fresh browser journey were run by this reviewer.


### Original R4 report

# B2 phone red team — R4 Gaming and fairness

Reviewed freeze `79c890dabcdf5587b9c31b86266994c11e4a3ef7` against base `8827048d4b95c2a800294d31063a5e72423ffcec` in `/workspace/DutyGraphApp-earn-phone`. No product files or commits changed.

Read the brief rules, product rules, contract, client PRD and red-team procedure; repository and mobile agent instructions; mobile CLAUDE.md; design system, porting guidance and writing standard.

Result: no High or Medium findings in the phone implementation under this lens. Two Low findings follow. Production anti-farming and payment authorization remain server responsibilities; the local fixture server cannot establish that production controls work.

ID: R4-01
Severity: Low
Where: mobile/src/features/earn/logic.ts:80–89; mobile/src/features/earn/Screens.tsx:199
What: A valid not-paid claim with `reason: "cap_reached"` and no optional `reasonText` loses the specific cap explanation.
How to reproduce: Supply a summary containing a not-paid claim with `reason: "cap_reached"`, omit `reasonText`, and set `me.maxPaidCards` to 5. `ClaimRows` calls `claimReason`, whose only special cases are too_generic, not_linked and pool_empty; the result is "Open this card with your manager to check why it is not paid." This does not use the product message "You have {max} paid cards, the most for one person. This card is still saved to your map." CONTRACT.md defines reasonText as optional. The same fallback drops useful context for already_mapped, too_small and not_ready when reasonText is absent.
Fix: Pass the available summary cap into the claim message helper and cover the cap reason explicitly; preserve server-provided reasonText when present. Add a case for a capped rejection without reasonText. This is a display issue and does not bypass an approval cap.

ID: R4-02
Severity: Low
Where: dev-server/src/earn-fixtures.ts:123–140
What: Development checks label many generic and duplicate/split cards likely to earn, so fixture journeys cannot validate the anti-farming experience.
How to reproduce: Run `node --import tsx --input-type=module` in dev-server and import `earnChecks` and `manualEarnCard` from `./src/earn-fixtures.ts`; clone the example and replace its title with "Attend meetings" or "Submit timesheets". Both return generic.flagged=false and earnHint="likely". "Answer my emails" correctly returns flagged=true/not_yet. Independently, possibleDuplicates is hardcoded to [] and earnChecks accepts no existing-card collection, so exact repeats, minor rewrites and split copies can never yield duplicate checks in this fixture. These are deterministic code observations, not evidence of a production server bypass.
Fix: Add explicit fixture cases for a broad generic task, duplicate card and split task and test their phone rendering. If dynamic fixture duplicate behavior is useful, compare against the local existing cards. Do not implement payment authorization in the client or claim these fixture checks verify server controls.

## Verified and scoped observations

- `teamRows` sorts a copy by name with localeCompare; TeamRows renders only names, card counts and fix counts. No ordinal, medals, top labels or count ranking. It never reads arbitrary peer card/title fields, so titles-off does not leak peer content on the board. The current contract board has no title field; titles-on grants permission to show titles but does not require them.
- `paidCardCount(3, null)` gives `Paid cards: 3`; `(3, 5)` gives `Paid cards: 3 of 5`. No invented default cap.
- Draft detail renders server earnHintReasons and possibleDuplicates as plain native text and says the manager decides. Confirmation does not promise payment.
- Phone repository exposes reads, confirmation, rejection and fix submission; it has no approve or mark-paid operation. Generic detection, similarity across people and drafts, task splitting decisions, merge credit, person-cap enforcement and transactional pool reservations require Agent A's server and manager decisions. Not verified here against a real backend.
- The fixture server creates manager_checking claims, not approvals or payouts. Its permissive checks are confined to a documented local development harness; the app labels the data and release repository refuses advertised fixture data.

## Focused verification

- `npm test -- --runInBand src/features/earn/__tests__/screens.test.tsx` in mobile: PASS, 13 tests. Includes name sort/count-only board, null/explicit cap text, server confirmation acknowledgement and conflict handling.
- Read-only tsx probe of earnChecks: PASS as a probe; observed generic and duplicate limitations recorded above.
- Device tests, real-server approvals, cross-user duplicate detection, cap concurrency and payment tests: not run; outside the phone-only review and local fake-server scope.


### Original R5 report

# Phone R5 — Product and claims

Reviewed freeze `79c890dabcdf5587b9c31b86266994c11e4a3ef7` against base `8827048d4b95c2a800294d31063a5e72423ffcec`. No product edits or commits.

## Findings

ID: R5-01
Severity: Medium
Where: mobile/src/features/earn/Parts.tsx:57
What: Every shared row overrides its accessible name with the title, omitting the detail that contains draft readiness/source/duration and team card/fix counts.
How to reproduce: Inspect a draft row on From your AI: Screens.tsx passes readiness and timing only through `detail`, while Row supplies `accessibilityLabel={label}` to its Pressable. The resulting accessible button name is only the task title. Likewise TeamRows supplies counts in detail but Row names the element only with the person's name. VoiceOver/TalkBack users cannot obtain the same summary at the row focus stop; on web an explicit aria-label also overrides descendant text for the button name. This is direct property evidence; a native screen-reader device run was not performed.
Fix: Include detail in the accessible label (or expose it as an accessible description with verified platform behavior), and add a focused accessibility-name regression for a draft and a team row.

ID: R5-02
Severity: Low
Where: mobile/src/features/earn/logic.ts:80
What: Several valid unpaid reason codes lose the required reason message when optional reasonText is absent.
How to reproduce: A Claim with state `not_paid`, reason `not_ready` (or `cap_reached`, `too_small`, `already_mapped`, `manager_declined`) and no reasonText is valid under the frozen Claim schema; claimReason returns only “Open this card with your manager to check why it is not paid.” The branch at lines 83–89 handles only too_generic, not_linked and pool_empty. PRODUCT-RULES section 4 requires the specific messages. Some required interpolation values are not available in Claim, so this needs contract coordination; no ungrounded values should be invented.
Fix: Render the required reason-specific messages from server-provided text, require that text for declined claims, and provide accurate code-specific fallback copy when details are unavailable.

ID: R5-03
Severity: Low
Where: mobile/src/features/earn/Screens.tsx:393
What: Draft Earn hints are displayed while the independent company-settings request is pending or failed.
How to reproduce: Return a waiting draft with earnHint `likely`, and leave getSummary unresolved or reject it. The false branch at lines 393–395 passes the original checks; TaskCardView displays “Likely to earn” before settings have established enabled=true. If the company has just disabled Earn, this can briefly expose stale financial guidance. The same branch falls back to the default pay note instead of the company note. The normal server response may already set earnHint off; this finding concerns stale/inconsistent responses and is therefore Low.
Fix: Suppress financial hints until summary positively establishes enabled=true. Keep the draft review usable if company settings fail.

## Verification and limits

- Focused existing suite: `npm test -- --runInBand src/features/earn/__tests__/screens.test.tsx` passed: 13 tests, one suite. No full suite was run.
- Inspected committed 360px screenshots for Scoreboard, Earn rules and gap/fix: readable wrapping and adjacent company pay notes; no visible horizontal clipping in those captures.
- Code review found explicit loading/error/empty list branches, acknowledged confirmation states, clearly labelled local fake money, payroll responsibility copy, local-only tick explanation, and honest voice-service wording. Monetary components consistently pair displayed amounts with pay rules.
- Committed browser ledger claims are scoped to fake HTTP, typed voice fallback, intercepted off/error cases, and stubbed Clipboard/Share. It explicitly does not claim native voice/device or real-payment testing.
- Native keyboard, largest Dynamic Type and screen-reader operation were not run. Existing 360px screenshots are reviewed evidence, not a fresh browser run.

### Verified final disposition

No confirmed High findings. All five Medium findings from the original freeze are fixed; additional R2-03 below is also corrected. Root verified the reported code paths and failing-before/passing-after evidence; independent R2 correction review additionally found no new High/Medium in persistence/retry scope.

| ID | Disposition and regression evidence |
| --- | --- |
| R1-01 Medium | Fixed quoted JSON/password values, Bearer credentials and punctuated payment numbers in the local sanitizer. Route test showed one removal instead of four before, all four values absent from response/persisted records after. Detection remains best effort; do not enter secrets. |
| R2-01 Medium | Exact operation/body/key is stored before dispatch using native encrypted storage. Manual same-body retry loads it after remount; acknowledgement removes it. Origin/device/local enrollment scope and generation checks prevent cross-login reuse. Local enrollment UUID is client metadata, preserved on refresh; no nonexistent server sessionId is assumed. Storage failure prevents send. Six targeted pending tests and transport enrollment/refresh tests cover these boundaries. Web storage remains memory-only. |
| R2-02 Medium | Local confirmation stages task, draft/claim and matching replay receipt in one synchronous atomic file snapshot. Failure restores all affected collections. Fault injection reproduced an orphan before; after fix a failed save leaves none and retry creates one. Restart after acknowledgement-save failure replays one committed task. This is single-process development persistence, not production database acceptance. |
| R3-01 Medium | All seven slots expose Add/Edit while waiting; reopen/correct retains other local fields, basis=told_me, and sends only with explicit Confirm. Not mine never sends edits. Before/after component regression covers the lost editor. |
| R5-01 Medium | Actionable draft and static team row accessible names include summary detail. Static rows are text, not disabled buttons. Two focused semantic tests failed before and pass after. No device screen-reader claim. |
| R4-01 / R5-02 Low duplicate | Fixed reason-specific unpaid fallbacks and exact configured-cap copy; server reasonText wins. Missing duplicate/card/slot detail is never invented. Eight focused a11y/reason tests passed. |
| R5-03 Low | Financial hints stay suppressed until summary positively enables Earn, including pending/error cases; draft review still works. Component tests failed on pending/error before and pass after. |
| R4-02 Low | Added deterministic generic, duplicate and split warning scenarios and renderer tests; broadened explicit generic fixture examples. Default seed IDs/counts unchanged. Server regression failed before, then fairness plus existing Earn tests passed; three renderer tests passed. These authored examples do not implement production similarity or split/payment enforcement. |

# Independent R2 correction review

Reviewed the uncommitted working diff after freeze `79c890dabcdf5587b9c31b86266994c11e4a3ef7`. Read-only review; no product edits.

## Disposition

**R2-01: substantively addressed for native phone manual retries.** `pending-command.ts` persists the exact operation/body/signature/key before network dispatch and loads matching pending records on a fresh invocation. Origin plus device/local-enrollment identity scope prevents cross-enrollment reuse; localSessionId is replaced on enrollment and retained on refresh. Storage failures prevent sending. Identity checks before dispatch and after response prevent an old enrollment from acknowledging another enrollment's command. Hooks and spoken-draft save use this mechanism. Acknowledgement removes pending records; failures retain them. This supports manual same-body retry without automatic replay. Web's memory-only secure-storage implementation remains an explicitly documented limitation; this is a native phone correction.

**R2-02: substantively addressed.** `dev-server/src/earn.ts` stages tasks, Earn draft/claim state, and the exact command receipt in one synchronous Store.save snapshot. Its failure handler restores all three prior collection references. Matching the existing wrapper's receipt key/body hash closes the crash window after snapshot persistence but before wrapper acknowledgement. The wrapper's later receipt persistence may fail, but the previously committed receipt can be replayed after restart. No other Store collections are overwritten.

## Independent focused verification

- `node --import tsx --test test/earn.test.ts`: **10 passed**, including fault injection before snapshot persistence and failure of wrapper acknowledgement persistence followed by restart/replay.
- `npx jest src/features/earn/__tests__/pending-command.test.ts --runInBand`: **6 passed**, including lost acknowledgement/fresh invocation for fixes, drafts and confirmations, failed durable storage, enrollment changes and identity fencing.

Inspected session/token storage serialization and native chunked secure storage. No confirmed new High or Medium counterexample found in the correction scope. No full suite or device validation run. Production transactional pool/cap checks, append-only money ledger, database RLS/grants/migrations and retention remain separate server responsibilities as in the original review.

Post-review verification: whole mobile **552/552** (65 suites,36.997s), dev-server **76/76**, shared **78/78**; mobile/dev/shared TypeScript and whole lint passed. An integrated typecheck first caught new test-only Jest imports/literal/tuple types; those were corrected, final TypeScript exit0, and affected four suites28/28 passed. No product type bypass, skipped test or timeout increase. Mobile high-threshold audit rerun exits1 with20 findings (14low,3moderate,3high) in the documented SDK tool chain; root/dev audits0. Review freeze CI40824655411 passed including legacy browser/HTTP/coverage checks. Corrected-head CI and post-correction browser/export follow.

Final post-correction browser/export: actual enrollment and pending helper journeys passed360/1280; fresh release fixture refusal passed before seed fetch. No native device or production authorization/payment claim. Screenshots/results are in [Earn browser evidence](earn-client/BROWSER.md). Final whole counts remain552 mobile,76 dev-server and78 shared; TypeScript/lint passed; mobile audit remains explicitly failed as above.

### Additional confirmed correction R2-03 — enrollment boundary

# Independent R2 correction: enrollment race

ID: R2-03
Severity: Medium
Where: mobile/src/api/earn/HttpEarnRepository.ts, private write() and createDraftFromTask(); mobile/src/features/earn/pending-command.ts, immediately before send(entry.key)
What: A replacement enrollment between the capability GET and write POST could send the old person's reviewed words using the new person's bearer.

## Confirmed evidence before correction

Added focused regression `does not send reviewed words under a replacement enrollment after capabilities resolves` in `mobile/src/api/earn/__tests__/repository.test.ts`.

The test uses the actual ApiClient and its token-store/generation behavior. The injected fetch records requests. The repository's injected GET delegates to actual ApiClient.get(), waits for its successful result (including that request's generation checks), then calls client.clearSession() and replaces the stored session before returning the capabilities result to the repository. The pending createFix body contains the old person's reviewed words; the replacement token store contains new-access/new-device.

Before the correction, the regression failed: Jest reported `Received promise resolved instead of rejected`, resolved value `{}`. The write continued through a new ApiClient.post(), which captured the new generation and read the replacement bearer. This is a confirmed request-boundary defect rather than an assumption that ApiClient's own per-request fence was absent. A logout/enrollment change after GET completion but before the outer continuation is the relevant scheduling window.

## Root issue and correction

Each ApiClient GET/POST independently captures participant generation. The repository previously treated its asynchronous capabilities check and subsequent POST as one authorized operation without retaining the original generation across that await.

The correction captures generation at entry to write(), awaits environment(), then calls assertParticipantGeneration(owner) synchronously immediately before client.post(). It also captures/asserts around createDraftFromTask()'s outer supportsDraftCreation() await. Finally, pending-command.ts checks its captured generation synchronously immediately before invoking send(entry.key), closing the continuation gap after its asynchronous owner verification.

No network action can interleave between each new synchronous fence and the direct invocation that captures the corresponding generation. Existing ApiClient fences continue to protect token reads, refresh and response processing within that request.

## Verification after correction

- `npx jest src/api/earn/__tests__/repository.test.ts src/features/earn/__tests__/pending-command.test.ts --runInBand`: **2 suites passed, 21 tests passed**. The new replacement-enrollment regression now rejects with SESSION_ENDED and verifies only GET was sent.
- `npm run typecheck` in mobile: **passed**.

Changed only HttpEarnRepository.ts, repository.test.ts and pending-command.ts during this correction. No commits or repository log edits were made by this reviewer.

## Limits

The deterministic regression injects the enrollment change at the exact boundary after a real ApiClient GET has completed; it is not a device timing rehearsal. No full suite, real backend, real device or provider checks were run by this reviewer. The original durable retry and atomic local confirmation corrections remain separately reviewed in phone-correction-r2.md. Production database and money-ledger responsibilities remain outside this phone correction.

Root full mobile verification after the fix: **553/553**,65 suites,35.604s; TypeScript and whole lint passed. This is the sixth confirmed Medium, corrected with a failing-before/passing-after actual transport regression. No confirmed High; no uncorrected Medium remains in reviewed client scope.

## 2026-10-28 — Earn phone final close

Final corrected code `f01d76a1e355df41af990cab9e7e2619ddfaa436`:553/553 mobile tests (65 suites), TypeScript/lint passed. Unchanged development-server76/shared78 checks remain passing. After R2-03, actual-enrollment fake-HTTP360/1280 journeys passed again with no page/render errors, overflow or microphone calls. Fresh release export/static fixture refusal passed before seed reads; normal legacy enrollment still worked. Evidence refreshed in docs/earn-client/BROWSER.md. Browser normal flow checks compatibility; the focused actual-transport regression verifies the hostile enrollment interleaving. Only owned QA servers were stopped and ports4510/4512/4513 verified clear.

Six confirmed Medium findings and all reported Lows are corrected, no confirmed High. Audit remains failed on the documented Expo toolchain path; no native/device/provider/payment acceptance was run. Final shared handover and both draft PR links above are authoritative; neither PR is merged.
- **The demo APK is debug-signed** and the `dutygraph-companion://` scheme can be claimed by another app. Use HTTPS App Links and a real signing key before distribution. Current signed-link delivery and the live `apple-app-site-association` response have not been verified by this continuation; the earlier missing-file observation is historical.

## 2026-10-28 follow-up (draft `codex/live-backend`)

- **Injected text inside proposals — mitigated in review UI, not closed end to end.** `ProposalEvidenceCard` now labels source quotations that match explicit role/prompt markers, override instructions or the recorded budget-approval pattern: “This quote looks like an instruction. Check before accepting.” Added 11 helper test cases. This is heuristic and may miss attacks or flag ordinary speech. Manual acceptance rules stay unchanged. The 11 heuristic unit cases now pass in the complete mobile suite, and ordinary source-review browser flows pass. A device visual check and malicious-quote end-to-end rehearsal remain unrun; this heuristic does not certify prompt-injection prevention.
- Other open findings (iCloud backup, Universal/App Links, signing) are unchanged.

## 2026-10-28 iOS recording privacy mitigation (draft, unverified)

- Previous finding: iPhone meeting evidence was saved to iCloud-backed Documents. Draft P4 code now uses the native module's backup-excluded Application Support directory, keeps temporary clips in Cache, migrates old Documents clips during restore and blocks iOS meeting recording when the native method is missing. Two Jest checks added. **Remains open for confirmation** until native compilation, iPhone recording/restart, and actual iCloud backup exclusion have been verified. No claim of a passing real-device test.

## 2026-10-28 App Link and signing follow-up (open)

- Production-mode URL builder now targets `https://dutygraph.com/mobile/enroll` and has focused source tests. Mock/dev links are unchanged. Android intent filters and iOS associated-domain declarations already exist, but the live iOS apple-app-site-association file, release signing, end-to-end delivery and physical-device behavior **have not been verified**. This is not a closed security/release finding.

## 2026-10-29 — Meeting-depth review corrections

Five independent meeting reviewers found no High findings. App-owned Medium findings MR3-2/MR5-01 (optional AI gate suggestion absent), MR5-02 (linked card and created draft not inspectable), and MR5-03 (affected person/card not adjustable) are corrected in this draft. The optional suggestion remains separate from the deterministic result, the company setting defaults off, and requesting advice does not route the meeting. Scoped Task Card reads support title/id and read-only data inspection; person/card/owner selections remain explicit before acceptance.

MR2-1/MR3-1's linked-draft mismatch is mitigated by immutable accepted draft proposals. Follow-up MR2-2 is addressed by allowing only explicit rejection of a stale linked proposal, preserving the existing draft. Mock/development API regressions verify the preserved record and replay semantics; component tests verify the warning and action restrictions. Backend grounding MR4-1 is owned by the mobile API branch, with whitespace/name ambiguity regressions there.

Final correction checks: 47 focused mobile tests and 67 development API tests passed. Earlier complete suites: mobile 572, shared 78. Phone-width browser validation is recorded separately when completed; no native/device or paid-provider result is implied. Historical security/release findings above retain their stated limits.

Phone review: the fake-provider HTTP walkthrough passed at 390×844: linked-source inspection, target/person/owner adjustments, acceptance, read-only saved-draft inspection, and absence of mutation buttons after draft creation. Three screenshots are in `docs/day-run/screens/advisor-taskcard-*-light.png`. No horizontal document overflow or browser page errors were observed. The first harness attempts incorrectly waited on text in stacked question cards; waiting on the accessible current heading corrected the automation without changing gate checks.
