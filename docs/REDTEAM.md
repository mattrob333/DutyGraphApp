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
