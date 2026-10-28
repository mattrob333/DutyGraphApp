# DutyGraph Mobile security review

Review date: 2026-10-27. This review exercised local fake providers and injected provider transports. It did not access the DutyGraph production service, use real provider credentials, apply SQL, or test a physical device.

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

## 2026-10-28 follow-up (draft `codex/live-backend`)

- **Injected text inside proposals — mitigated in review UI, not closed end to end.** `ProposalEvidenceCard` now labels source quotations that match explicit role/prompt markers, override instructions or the recorded budget-approval pattern: “This quote looks like an instruction. Check before accepting.” Added 11 helper test cases. This is heuristic and may miss attacks or flag ordinary speech. Manual acceptance rules stay unchanged. **Focused Jest and device visual QA not run in this session.** Keep as open until the test suite and full flow are exercised.
- Other open findings (iCloud backup, Universal/App Links, signing) are unchanged.

## 2026-10-28 iOS recording privacy mitigation (draft, unverified)

- Previous finding: iPhone meeting evidence was saved to iCloud-backed Documents. Draft P4 code now uses the native module's backup-excluded Application Support directory, keeps temporary clips in Cache, migrates old Documents clips during restore and blocks iOS meeting recording when the native method is missing. Two Jest checks added. **Remains open for confirmation** until native compilation, iPhone recording/restart, and actual iCloud backup exclusion have been verified. No claim of a passing real-device test.
