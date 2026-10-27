# Porting the proposed mobile API to DutyGraph

This repository implements a separate development server. It does not modify the DutyGraph web app, deploy endpoints to DutyGraph, or apply database migrations. Meeting OS, advisor device sessions, Pulse additions, recording ingestion, and spoken output described here are implemented against local fixtures and fake providers. No real-provider rehearsal or physical-device verification was run for this handoff.

The source inventory is [the proposed OpenAPI 3.1 contract](../contracts/meeting-mobile.openapi.json): **57 HTTP operations across 51 paths**, version `0.1.0`. The existing [participant contract](../contracts/companion-mobile.openapi.json) remains **1.3.0**. Participant additions should become a separately reviewed companion contract revision, provisionally **1.4**, and advisor operations should receive a separate `contracts/advisor-mobile.openapi.json` in DutyGraph. Do not overwrite the pinned participant contract to make new operations appear deployed.

## Implementation boundaries

| Local source | DutyGraph destination | Responsibility |
| --- | --- | --- |
| [participant.ts](../dev-server/src/participant.ts) | Existing `server/mobile-participant.ts` and `server/mobile-auth.ts` | Fixture-compatible participant v1 routes and auth behavior. Keep the real implementations and extend them through reviewed changes. |
| [v1x.ts](../dev-server/src/v1x.ts) | `server/mobile-participant.ts`; optionally split voice helpers into `server/mobile-voice.ts` | Participant extras and safe projections of meetings and Pulses. |
| [meetings.ts](../dev-server/src/meetings.ts) | New `server/mobile-meetings.ts` and focused services under `server/companion/` | Advisor routing, planning, sessions, evidence, proposals, kickoff and setup. |
| [core.ts](../dev-server/src/core.ts), [idempotency.ts](../dev-server/src/idempotency.ts) | Existing auth, tenant transaction, record-version and idempotency infrastructure | Replace the JSON store and process-local locks; preserve permission, version and retry semantics. |
| [shared/meetings](../shared/meetings) | Shared pure meeting types and policy rules | Deterministic gate, lifecycle, consent, source validity, completion and closing checks. |
| [prompt-pack.ts](../server/companion/prompt-pack.ts) and [prompts](../server/companion/prompts) | Existing `server/companion/` prompt pack | Versioned composition with escaped, delimited untrusted data. Keep Carson Tate attribution for POWER and *Work Simply*. |
| [providers](../dev-server/src/providers) | Server-only provider adapters; reuse `server/live-transcription.ts` where applicable | Typed speech, transcription, conversation, judgment and realtime interfaces. |

The optional `DEV_SERVER_DATA_FILE` is a **single-process development convenience**, not a database. It writes JSON containing development records to a restricted local file. It has no multi-process locking, transaction isolation, production retention service, encryption service, recovery journal or durable job queue. Its in-memory provider quotas also reset on restart. Do not deploy this storage or concurrency design as the production backend.

## Authentication, tenancy and record integrity

The bearer principal supplies company, person, device/session and role. Never authorize from a `companyId`, owner, speaker, request or attendee identifier sent in a body. Advisor device sessions are scoped to one company; switching company requires a new pairing. Participants may read their own requests, questions and assigned Task Cards, their own Pulse questions, and meetings they attend. Completion-only team status may include names and states, never answers or internal judgment fields.

Local records use company scoping because the fixtures represent that boundary. Production must derive **both tenant and company** from the authenticated session and carry them through every query, foreign key, audio lookup and background job. Company membership and advisor authority need the existing DutyGraph authorization checks in addition to tenant RLS.

Access tokens live for 15 minutes and rotating refresh tokens for 30 days. Persist hashes of tokens and pairing codes, never raw bearer credentials. Access and refresh lookups occur before the tenant is known: use tightly scoped security-definer lookup functions owned by a trusted auth role, then enter a tenant transaction. Restrict `search_path`, revoke public execution, and do not grant broad bypass-RLS permissions to the application role.

The participant DTO uses `accessTokenExpiresAt` and `refreshTokenExpiresAt`. The proposed advisor DTO uses `accessExpiresAt` and `expiresAt`, plus its company/advisor identity and `role: advisor_mobile`. Keep these shapes explicit in adapters instead of accidentally sharing the wrong wire DTO.

Editable records carry a positive integer version and SHA-256 content hash. Local canonical hashing sorts object keys, preserves array order and excludes the previous hash before computing the next version. Port this to the established `records` / `record_versions` hashing convention and add cross-implementation fixtures. Version and hash mismatch return `409 VERSION_CONFLICT` and `409 HASH_CONFLICT`; the client must load the current record and obtain renewed review rather than overwrite it.

## Retry protocols

1. **Ordinary commands:** persist the client operation before sending. Send an `Idempotency-Key`, reuse the same key and exact body after transport failure, and mark complete only after acknowledgment. The local scope includes session, HTTP method, original request path and key. Body fingerprints include uploaded audio bytes for multipart participant transcription. A matching concurrent or completed request receives the saved result; a different body returns `409 IDEMPOTENCY_CONFLICT`; a missing required key returns `400 IDEMPOTENCY_REQUIRED`.
2. **Production command ledger:** implement unique database constraints and transactions around command reservation, domain writes and result recording. Process-local promises are insufficient across replicas. Define retention and session-renewal behavior before purging ledger entries. Error envelopes are `{ code, message, retryable, requestId }`; never include provider bodies, words, tokens or invitation URLs in errors or logs.
3. **Enrollment and pairing:** a code is consumed once. A retry with the same key and identical body within two minutes returns the same session/device with a replacement token pair and `idempotentReplay: true`; the prior pair is invalidated. A changed body conflicts, and a different key or expired replay window cannot consume the used code again.
4. **Refresh:** refresh once, single-flight, after an expired access token. A matching key and previous refresh token may replay within two minutes, producing a replacement pair. Reuse of an old refresh token outside that valid replay ends the session with `401 REFRESH_REPLAY`. Persist refresh history and replay fingerprints transactionally in production. Do not cache raw token responses.
5. **Ephemeral transcription/realtime grants:** these require keys but intentionally do not persist the credential response. They retain only the request fingerprint; a valid retry mints a fresh short-lived grant and consumes the provider quota. Clients replace the prior grant. The live grant expiry is Unix seconds. Responses must be `no-store`; secrets belong only in memory for the active transport.
6. **Read-like coverage:** `/requests/{id}/coverage` is a POST that checks current words without storing them and is not a durable command. The participant v1 behavior remains unchanged. The v1x path returns local coverage and safely omits an AI follow-up if the model or quota is unavailable. Do not make a missing optional AI service block the card.
7. **Logout:** the current compatibility handler revokes a matching device session and returns 204 on repeats, including a missing/revoked session. It does not require the generic command key. Preserve safe repeatable revocation; document any stricter proposed advisor contract behavior before changing clients.

## Endpoint porting inventory

The environment groups and test abbreviations below apply to every row that names them. `—` means no provider environment is required for the operation; normal application database/auth configuration still applies.

- **T**: `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `TTS_MODEL`, `TTS_VOICE`; local files use `DEV_SERVER_AUDIO_DIR`.
- **L**: `OPENAI_LIVE_TRANSCRIBE_API_KEY`, `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_LIVE_TRANSCRIBE_MODEL`, `OPENAI_LIVE_TRANSCRIBE_DELAY`, `OPENAI_LIVE_TRANSCRIBE_WS_URL`, `OPENAI_LIVE_TRANSCRIBE_SECONDS`; `FAKE_LIVE_TRANSCRIPTION` is development only.
- **B**: `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_TRANSCRIBE_MODEL`.
- **M**: `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_TEXT_MODEL`.
- **R**: `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_REALTIME_MODEL`, `OPENAI_LIVE_TRANSCRIBE_MODEL`, `TTS_VOICE`.
- **F**: `FEATURE_FOLLOW_UPS`, `FEATURE_AUTO_ADVANCE`; **Budget**: `MEETING_BUDGET_CENTS_LIVE`, `MEETING_BUDGET_CENTS_RECORD`.
- **A**: [participant/auth tests](../dev-server/test/participant.test.ts); **Mtg**: [meeting route tests](../dev-server/test/meetings.test.ts); **X**: [participant-extras tests](../dev-server/test/v1x.test.ts); **P**: [provider tests](../dev-server/test/providers.test.ts); **C**: [contract tests](../dev-server/test/contract.test.ts); **S**: [shared meeting-rule tests](../tests/meetings-rules.test.ts).

Every proposed operation is inventoried by C. The HTTP contract test exercises a representative advisor lifecycle; it is not evidence that every error/status/body combination has been exercised. Port the focused suites as well as adding production database, permission and concurrency tests.

### Development-only operations

| Method and path | Production destination | Data / behavior | Env | Tests |
| --- | --- | --- | --- | --- |
| `GET /health` | Existing health endpoint, with a safe provider-status projection | Mode and provider kinds only; no credentials or words | Provider groups; `DUTYGRAPH_ORIGIN` | A, C |
| `POST /dev/pairing-code` | Replace with an authenticated web pairing action; do not expose this development helper | Loopback-only local code creation; production needs authenticated advisor/company authorization and expiring `advisor_pairing_codes` | — | Mtg, C |

### Advisor operations

Base path: `/api/mobile/meetings/v1`. All business routes require an advisor bearer scoped to the company. Target `server/mobile-meetings.ts` unless a more specific target appears below.

| Method and relative path | Production service / tables | Env | Tests |
| --- | --- | --- | --- |
| `POST /advisor/pair` | `server/mobile-auth.ts`: `advisor_pairing_codes`, `advisor_devices`, `advisor_sessions`; consume and rotate atomically | — | A, Mtg, C |
| `POST /advisor/session/refresh` | `server/mobile-auth.ts`: session, used-refresh history and replay ledger | — | A, Mtg, C |
| `POST /advisor/session/logout` | `server/mobile-auth.ts`: revoke advisor session/device access | — | A, Mtg, C |
| `GET /advisor/me` | Auth principal and company membership projection | — | Mtg, C |
| `GET /people` | Company-scoped person/role/department records; advisor picker only | — | Mtg, C |
| `GET /meetings`, `POST /meetings` | Versioned `meeting` records; create from POWER and validated attendee identities | — | Mtg, S, C |
| `GET /meetings/{id}`, `PATCH /meetings/{id}` | Meeting records/versions; invalidate stale plans and gates when planning inputs change | — | Mtg, S, C |
| `POST /meetings/{id}/plan` | Shared planner + `server/companion/` bounded judgment + deterministic policy; save agenda and gate | M | Mtg, S, P, C |
| `POST /meetings/{id}/route` | Meeting version plus the accountable leader's route choice; enforce policy again | — | Mtg, S, C |
| `POST /meetings/{id}/pulse`, `GET /meetings/{id}/pulse` | `pulse` records / `pulses`, `pulse_participants`, response records; second gate on completion or deadline | — | Mtg, X, S, C |
| `POST /meetings/{id}/sessions` | `meeting_sessions`; initialize pending consents and budget, recheck current meeting policy | Budget | Mtg, S, C |
| `GET /sessions/{id}` | Session with scoped transcript, speaker map, parked items and proposals; advisor-only snapshot | — | Mtg, C |
| `POST /sessions/{id}/consent` | `meeting_attendee_consents`, session log; exclude withdrawn speech and stale affected proposals | — | Mtg, S, C |
| `POST /sessions/{id}/segments`, `GET /sessions/{id}/segments` | Existing asset/chunk service + `meeting_segments`; checksum validation and resumable receipt | `DEV_SERVER_AUDIO_DIR` locally | Mtg, C |
| `GET /sessions/{id}/audio/{segmentIndex}` | Authenticated asset delivery; completed segments only, consent review enforced | Asset-service configuration | Mtg, C |
| `POST /sessions/{id}/transcript` | `transcript_segments`; committed ids/revisions, exclusions and stale-proposal propagation | — | Mtg, S, C |
| `POST /sessions/{id}/coach` | Session/topic clock and scoped outcome checklist; current implementation is deterministic | — | Mtg, S, C |
| `POST /sessions/{id}/park` | `meeting_parked_items`; preserve session, time and optional speaker cluster | — | Mtg, C |
| `POST /sessions/{id}/facilitator/turn` | `server/companion/`: prompt pack, typed conversation output, session log/version/hash | M, Budget | Mtg, P, S, C |
| `POST /sessions/{id}/realtime` | Server-only realtime adapter, transient grant fingerprint; never a persisted credential result | R, Budget | Mtg, P, C |
| `POST /sessions/{id}/topic` | Session current-topic pointer and start time, validated against this meeting's agenda | — | Mtg, C |
| `POST /sessions/{id}/state` | Shared validated facilitator transitions, mute/stop/skip/topic controls and append-only log | — | Mtg, S, C |
| `POST /sessions/{id}/finish` | Asset batch transcription, `transcript_segments`, proposed findings in `meeting_proposal` records | B | Mtg, P, S, C |
| `GET /sessions/{id}/speakers`, `POST /sessions/{id}/speakers` | `meeting_speaker_maps`; attendee validation, human confirmation, stale affected attribution | — | Mtg, S, C |
| `GET /sessions/{id}/proposals` | Scoped versioned proposal records with source references | — | Mtg, C |
| `POST /proposals/{id}/decision` | Version/hash conflict checks, current source validation, human accept/reject/edit; no automatic canonical graph write | — | Mtg, S, C |
| `POST /proposals/{id}/follow-up` | Proposed question-request record linked to open question/parked item and a validated company person | — | Mtg, C |
| `POST /sessions/{id}/closing` | Closing checklist and owner confirmations; keep source, proposed/assigned state and recorder identity | — | Mtg, S, C |
| `GET /sessions/{id}/export` | Authorized Markdown + JSON export with explicit proposal states and sources | — | Mtg, C |
| `GET /kickoff/{meetingId}/notes`, `POST /kickoff/{meetingId}/notes` | Versioned kickoff notes and source-linked claim proposals; validate existing note ownership and attendee identity | — | Mtg, C |
| `POST /setup` | Versioned setup request with shared question deck | — | Mtg, C |
| `POST /setup/{id}/understand` | Setup proposal records from supplied words; retain quote, missing fields and source label | — | Mtg, C |
| `POST /setup/{id}/confirm` | Reviewed setup proposal decisions; remain proposals for later DutyGraph integration | — | Mtg, C |

### Participant additions

Base path: `/api/mobile/v1x`. Target `server/mobile-participant.ts`, calling shared meeting or voice services. Voice line generation/delivery and feature configuration also accept a company-scoped advisor session; other routes are participant-only.

| Method and relative path | Production service / tables | Env | Tests |
| --- | --- | --- | --- |
| `GET /config` | Per-person/company feature policy; default table follow-ups and manual Next | F, L | X, C |
| `POST /voice/lines` | Server TTS + `voice_line_cache` and assets; cache is scoped to tenant/company/requester | T | X, P, C |
| `GET /voice/audio/{hash}` | Authenticated cached asset lookup; hash alone grants no access | Asset-service configuration | X, C |
| `POST /requests/{id}/live-transcription` | Reuse `server/live-transcription.ts`; authorized request or own Pulse context; transient grant metadata only | L | X, P, C |
| `POST /requests/{id}/coverage` | Existing local hint matching plus optional bounded follow-up; no persistence of checked words | F, M | X, P, C |
| `POST /task-cards/{id}/decision` | Exact reviewed Task Card version/hash + proposed participant decision, preserving card content | — | X, C |
| `GET /pulses` | Own assigned Pulse list, one participant's question set per DTO | — | X, C |
| `GET /pulses/{id}` | Own `pulse_participants` questions, immutable question hash/version and completion state | — | X, C |
| `POST /pulses/{id}/responses` | Existing words-submit schema, response record + participant completion; idempotent second-gate evaluation | — | X, Mtg, S, C |
| `GET /pulses/{id}/team-status` | Completion projection only: `total`, `done`, `people: [{name,state}]` | — | X, S, C |
| `GET /meetings` | Attendance-scoped `MeetingSummary[]` projection | — | X, C |
| `GET /meetings/{id}` | Own meeting outcome, reason, role and code-computed personal time returned | — | X, S, C |
| `GET /meetings/{id}/brief` | Meeting purpose/outcomes and questions assigned to this person; no raw transcript or other's answers | — | X, C |
| `GET /confirmations` | Own wrap-up summary list for Today | — | X, C |
| `GET /confirmations/{id}` | Meeting id keyed wrap-up; only own/attributed items and current version/hash | — | X, C |
| `POST /confirmations/{id}/items/{itemId}` | Exact reviewed proposal version/hash, participant choice and closing item; owner confirmation can assign an action | — | X, S, C |

The existing `/api/mobile/v1` enroll, refresh, logout, profile, requests, coverage, understand, submit, transcription, Task Card list/detail and attest operations remain governed by contract 1.3. Their fake implementation is a local compatibility harness, not a replacement for DutyGraph's production xAI transcription/understanding implementation. Keep `correct` attestation on v1; the three additional Task Card choices use v1x until the real contract and handlers are extended together.

## Audio, evidence and consent

The upload wire format in this implementation is **JSON with base64 `data`**, not multipart raw bytes. Each body carries `segmentIndex`, `chunkIndex`, `chunkCount`, the chunk's `sha256`, and the final `segmentSha256`; optional metadata includes `startedAt` and `durationMs`. Each decoded chunk is at most 512 KiB. A segment has at most 50 chunks and at most five minutes of recorded duration. Query segment receipts and send only missing chunks, preserving their identities, bytes and idempotency keys. The final whole-segment checksum must validate before the server marks it complete. Conflicting chunk content is rejected instead of silently replaced.

Production should put bytes in DutyGraph's existing assets/chunk service, apply its current 25 MB clip limit, and preserve segment boundaries when sending long meetings for batch transcription. Do not concatenate an unbounded full meeting into one provider request. Use company `retentionDays` policy, deletion jobs and protected delivery for original audio, derivatives, transcripts, exports and cache entries. The local disk cache does not implement a production retention scheduler.

Audio paths do not carry bearer tokens. Downloads require an Authorization header. TTS cache keys include model, voice, speed and text hash; storage and authorization also bind company and requester. Only audio/hash/metadata are retained in that cache, not the TTS source text. Full recording audio remains advisor/company scoped and is not accessible through the participant TTS route.

Consent is required for every attendee, every session. Pending consent prevents recording ingestion and provider processing. A declined attendee is excluded; unknown speaker clusters cannot bypass that exclusion. Mapping a speaker to a declined attendee clears that transcript text and invalidates dependent proposals. Changing confirmed attribution also stales affected proposals. Inseparable room audio containing a declined attendee requires human review and removal; the development server rejects batch processing/playback that cannot satisfy this condition.

The spoken consent/recording notice needs **legal review before real use**; the app implementation carries the `LEGAL REVIEW NEEDED` marker. Do not interpret a UI tap as proof of every jurisdiction's requirements or the employment-context legal basis. Record the notice version, app version, time, attendee state and responsible recorder. No voiceprints or persistent voice identity are used: diarization clusters are local to one meeting.

Every accepted attributed proposal needs current committed transcript evidence with segment id, revision and quote. Unmapped speakers remain unknown. Transcript edits or attribution changes invalidate dependent proposals rather than updating their source silently. Unknown owners and decision authority remain null until supplied explicitly; the source speaker is not automatically the owner. A proposed action becomes assigned only after owner confirmation. Leader-device confirmation is an explicitly recorded human action; production may require the owner's authenticated confirmation for policy-sensitive cases.

## Providers and bounded policy

Default mode uses deterministic fake providers. `OPENAI_API_KEY` enables eligible server adapters; conversation and judgment also require `OPENAI_TEXT_MODEL`. A separate `OPENAI_LIVE_TRANSCRIBE_API_KEY` may enable transcription grants without enabling other providers. `/health` identifies selected provider kinds, not successful live validation.

The configured defaults are `gpt-4o-mini-tts` with voice `marin`, `gpt-live-transcribe` for live transcription, `gpt-4o-transcribe-diarize` for batch diarization, and `gpt-realtime-2.1` for optional realtime voice. `OPENAI_TEXT_MODEL` is intentionally unset by default. These model identifiers are configurable and require a separately authorized provider rehearsal before claiming current account availability or quality.

The realtime adapter supports either SDP exchange or a client-secret grant and sets `create_response: false`. Controller triggers, consent, mode, mute/stop and budget policy remain authoritative. Model output cannot execute a company change. The facilitator prompt pack records its version and hash; untrusted words and company records stay in escaped DATA blocks. Typed outputs are schema-validated, with conservative judgment fallbacks.

Current batch extraction is deterministic and creates proposals from exact transcript quotes. It is not a validated semantic extraction model. Unknown owners remain null. Coach output is a deterministic checklist/timer projection. Provider spending counters are approximate control guards, **not billing or measured cost accounting**; replace them with actual usage metering before treating budgets as financial limits. Recording must continue when live AI is paused for budget or network reasons.

Live transcription has bounded per-request/per-company development quotas and a five-second grant timeout. AI follow-ups are optional, capped in length and restricted to an uncovered hint; sensitive/unknown/declined answers do not trigger a probe. Provider errors fall back safely and do not include raw upstream response bodies in user-facing errors.

Provider tests inject fake fetch and verify payloads; they never call a real provider. The manual [rehearsal script](../dev-server/scripts/rehearse-openai.ts) is outside tests and was not run. Its bundled three-second WAV is silence, so even a successful run checks transport, not speech-recognition accuracy or meaningful first-word latency. Device microphone capture, room echo/barge-in, WebRTC, foreground/background recording, audio routing, permissions, App Links and push still require the device checklist.

## Migration and deployment handoff

[proposed-migrations.sql](../dev-server/sql/proposed-migrations.sql) is **proposed, not applied**. The placeholder `00NN` is not an allocated migration number. The DutyGraph team should reconcile the proposal with current `records` / `record_versions` record kinds before choosing tables. Meeting definitions, proposals and Pulses should reuse versioned records where appropriate; credentials, sessions, consent, media and transcript revisions need dedicated relational support.

The proposed SQL includes tenant/company keys, composite relationships, forced tenant RLS, runtime grants, source indexing and an access-hash lookup function. It is a review starting point, not a complete production migration. Add durable command results/reservations, refresh-token history and replay metadata, pairing consumption/replay metadata, job state, retention/deletion support and necessary record-kind integrations. Ensure transcript source arrays cannot reference another tenant/company and that updates validate revision/quote integrity transactionally.

Use the existing migration runner and `server/runtime-grants.ts` conventions. A Vercel deploy does not itself apply Neon migrations. The DutyGraph team runs `npm run db:migrate` with `MIGRATION_DATABASE_URL` and `APP_DATABASE_PASSWORD` against the appropriate preview/production databases under their own deployment procedure; do not paste SQL directly into the database editor and omit the grants step. This handoff neither performs nor authorizes a migration run.

Connection modes remain distinct:

- App mock mode uses fictional data and no server.
- Local HTTP mode uses the dev server and its locally issued participant/advisor sessions.
- With `DUTYGRAPH_ORIGIN`, `/api/mobile/v1` is forwarded to the real origin with request/response transport preserved. **The proxy cannot authenticate upstream bearers for local additions.** The new v1x namespace returns `NOT_AVAILABLE` for those credentials. Local advisor pairing and local fixture additions remain separate. Do not turn a successful upstream bearer into an invented local identity.
- Direct real-server mode uses `EXPO_PUBLIC_API_BASE_URL` for existing participant operations. Until additions are deployed, leave `EXPO_PUBLIC_MEETINGS_API_BASE_URL` unset so the app shows its honest unavailable state.

App environment names are `EXPO_PUBLIC_DATA_SOURCE`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_MEETINGS_API_BASE_URL` and `EXPO_PUBLIC_COMPANION_SCOPE`. They are public bundle configuration and must never contain provider credentials. `PORT`, `DEV_SERVER_DATA_FILE` and `DEV_SERVER_AUDIO_DIR` are development-server settings. Production database and provider secrets remain in server-side secret management.

Before enabling the port, run the root shared checks, mobile verification/export and the five backend suites above against injected providers. Add real database tests for forced RLS, cross-company references, atomic retries on multiple instances, refresh replay, consent withdrawal, stale source revisions and protected asset delivery. Run the [device checklist](DEVICE-QA.md) separately and record actual results. Preserve the distinction between local fake-provider coverage, a real-provider rehearsal and behavior observed on a phone.

## Local phone testing

The executable binds loopback by default. For an explicitly chosen local-network device rehearsal, set `HOST` to the computer's LAN interface (or all interfaces) and use that LAN address in the app API origins. Pairing-code creation remains loopback-only; create the code on the computer and enter it on the phone. Native and real-provider behavior have not been run on a device.
