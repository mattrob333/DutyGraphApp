# 07 · Backend, API and connection to DutyGraph

## 1. The real DutyGraph server (built)

| | |
| --- | --- |
| Stack | Node 24, Express 5, zod 4, PostgreSQL (Neon in hosting) with forced row-level security per tenant, deployed on Vercel. Optional Neo4j projection (not needed here). |
| Origins | Local `http://localhost:4317` (`npm run setup && npm run dev` in the DutyGraph repo). Hosted `https://dutygraph.com`. Vercel feature-branch previews cannot sign in; do not target them. The `develop` preview sits behind Vercel login and phones cannot reach it. |
| Participant mobile API | Base path `/api/mobile/v1`, contract `contracts/companion-mobile.openapi.json` **version 1.3.0**. Handlers: `reference/server-reference/mobile-participant.ts`, auth `mobile-auth.ts`. Prose: `reference/docs/companion-mobile-api.md`. |
| Advisor API | Web only: cookie `dg_session` + `X-CSRF-Token`. **There is no advisor mobile session.** Do not try to use the web cookie from the app. |

### 1.1 Participant operations (contract 1.3, all built)

| Method | Path | What |
| --- | --- | --- |
| POST | `/enroll` | `{ invitationToken (64 hex), deviceLabel? }` + `Idempotency-Key` → participant mobile session (access + refresh). Consumes the invitation; afterwards the browser link returns 410. `409 USE_WEB_LINK` for leadership, first-touch, account-setup and company-picture links: open that URL in the browser instead |
| POST | `/session/refresh` | Rotate the refresh token. Same key + previous refresh token within 2 minutes → same session, new pair (`idempotentReplay: true`). A replayed refresh token without the key → `401 REFRESH_REPLAY`: end the session |
| POST | `/session/logout` | Revoke this device session. Repeat → 204 |
| GET | `/me` | Minimal profile |
| GET | `/requests` | Needs-you inbox: work questions and task checks (`type: "confirmation"`, `taskCardIds`) |
| GET | `/requests/{id}` | Questions with `key`, `short`, `hints`; `advisorName` |
| POST | `/requests/{id}/transcriptions` | Multipart `audio` + `meta`, or JSON with `assetId`. xAI `grok-voice-transcribe-2.0`. `audio/m4a`, `audio/x-m4a`, `audio/aac`. `503 TRANSCRIPTION_NOT_CONFIGURED` (`retryable: false`) without a key; `504 TRANSCRIPTION_TIMEOUT` |
| POST | `/requests/{id}/understanding` | Proposed task understanding (older flow; `confirmationState: proposed`) |
| POST | `/requests/{id}/coverage` | `{ questionKey, text ≤ 4000 }` → `{ available: true, covered: ["h0", …] }` or `200 { available: false, reason }` (`AI_NOT_CONFIGURED`, `SAMPLE_COMPANY`, `COVERAGE_LIMIT`, `SPONSOR_UNAVAILABLE`, `TIMEOUT`, `MODEL_ERROR`). Never 429/503. No idempotency key. Words not stored |
| POST | `/requests/{id}/understand` | "Here's what we heard". Refusal is `200 { available: false, reason }` |
| POST | `/requests/{id}/submit` | Words path with per-question fields and `questionAnswerSources` (see 06 §4). `Idempotency-Key`, `expectedVersion`, `contentHash` |
| GET | `/task-cards`, `/task-cards/{id}` | Cards the participant performs or owns |
| POST | `/task-cards/{id}/attest` | `recordVersion`, `contentHash` of the exact version; the last card of a check returns it to the advisor (`checkReturned: true`) |

### 1.2 Rules every client follows

- Bearer `Authorization: Bearer <access>`. Access lives **15 minutes** (`MOBILE_ACCESS_MINUTES`), refresh **30 days** (`MOBILE_REFRESH_DAYS`), rotating. Refresh once, single-flight, on 401; end the session on refresh replay.
- Tokens only in Keychain/Keystore (`expo-secure-store`). The invitation token is never logged, shared, or put in analytics or crash reports.
- The server derives tenant, company, person and device from the session. A mismatch is `403 PERSON_FORBIDDEN`.
- `410 INVITATION_EXPIRED` for a missing, used, revoked or expired invitation.
- `409 VERSION_CONFLICT` / `HASH_CONFLICT` when `expectedVersion` or a hash is stale.
- Same `Idempotency-Key` + same body → saved result; different body → `409 IDEMPOTENCY_CONFLICT`; missing on a command → `400 IDEMPOTENCY_REQUIRED`.
- Errors: `{ code, message, retryable, requestId }`.
- Deep links: only `https://respond.dutygraph.com/mobile/enroll` and `https://dutygraph.com/mobile/enroll` open the app (decision D16). Never declare `/invite/*`, `/account-link/*` or `/voice-interview/*`. Do not use a custom `dutygraph://` scheme for tokens.
- Push payloads carry `requestId`, `deepLink`, `route` (allow-listed: `/questions/<id>`, `/confirmations/<id>`, `/today`); body text never contains question or answer text. `PUT /me/push-token` is not in the contract yet.
- Generate types from the contract (`cd mobile && npm run contract:types`); never hand-edit `src/api/generated/`.

## 2. The dev server (new, this build)

Purpose: run every new feature end to end now, with fake providers, in the same style as the DutyGraph server, so the team can port it.

### 2.1 Shape

```text
dev-server/
  package.json            express 5, zod 4, tsx, ws; node:test
  src/
    index.ts              app factory + listen (PORT, default 4417)
    config.ts             env parsing (names in §4), feature flags
    errors.ts             { code, message, retryable, requestId }, fail()
    idempotency.ts        middleware
    auth/                 participant (fake enroll) and advisor (pair) sessions, token hashing (sha256), rotation
    store/                in-memory store + optional JSON persistence; fixtures (fictional companies, people, requests, task cards)
    participant/          /api/mobile/v1 fake implementation (contract 1.3) + proxy to DUTYGRAPH_ORIGIN
    v1x/                  proposed participant additions: voice lines, live-transcription grant, task-card decisions, pulses, config
    meetings/             /api/mobile/meetings/v1: advisor session, meetings, plan/gate, pulse, sessions, segments, transcript, coach, facilitator, finish, proposals, export, kickoff notes, setup
    providers/            tts, liveTranscriptionGrant, transcription (batch + diarization), conversationModel, judgment, realtimeSession — each fake + openai
    facilitator/          uses ../server/companion/prompt-pack.ts and ../shared/companion-judgment.ts
    fake-realtime.ts      local WebSocket that mimics OpenAI live transcription events for tests and demos
  sql/proposed-migrations.sql
  scripts/rehearse-openai.ts
  test/
```

### 2.2 Modes

- **Fake (default):** everything served locally from fixtures; providers are fake and deterministic.
- **Proxy:** `DUTYGRAPH_ORIGIN=http://localhost:4317` forwards `/api/mobile/v1/*` unchanged to a real DutyGraph server; new namespaces stay local. In proxy mode the dev server cannot see the real server's records, so new features that need them (for example a Pulse built from someone's real commitments) use fixtures and say so in `GET /health`.

### 2.3 Proposed endpoints

Write each into `contracts/meeting-mobile.openapi.json` (OpenAPI 3.1) as you build it, and test the dev server against it.

**Participant additions** — base `/api/mobile/v1x` (participant bearer; advisor bearer where noted):

| Method | Path | What |
| --- | --- | --- |
| GET | `/config` | Feature flags for this person: `speakQuestions`, `followUps`, `autoAdvance`, `liveTranscription` |
| POST | `/voice/lines` | `{ requestId?, sessionId?, voice?, speed?, lines: [{ id, text ≤ 400 }] ≤ 40 }` → `{ lines: [{ id, url, hash, durationMs }] }`. Participant or advisor bearer. Cached by hash |
| GET | `/voice/audio/{hash}` | The audio file (`audio/mpeg`) |
| POST | `/requests/{id}/live-transcription` | `{ available: true, clientSecret, expiresAt, wsUrl, model, transcription }` or `{ available: false, reason }` (see 04 §2.1). The secret is never logged |
| POST | `/requests/{id}/coverage` | Same as v1 coverage plus optional `followUp: { text, hintId }` when `followUps: ai` |
| POST | `/task-cards/{id}/decision` | `{ decision: "needs_change" \| "not_mine" \| "unsure", note? ≤ 1000, recordVersion, contentHash }` + `Idempotency-Key` |
| GET | `/pulses/{id}` | Pulse with questions (same question/hint shape as a request) |
| POST | `/pulses/{id}/responses` | Same body shape as submit's words path; idempotent |
| GET | `/pulses/{id}/team-status` | `{ total, done }` and per person `{ name, state }` only. **Never answer text** |
| GET | `/meetings` · `/meetings/{id}` · `/meetings/{id}/brief` | Participant meeting outcomes and brief (the seed's mock shapes in `mobile/src/types/domain.ts`) |
| GET | `/confirmations/{id}` · POST `/confirmations/{id}/items/{itemId}` | Wrap-up items about this person: Confirm / Change / Not mine |

**Advisor and meetings** — base `/api/mobile/meetings/v1` (advisor bearer, company-scoped):

| Method | Path | What |
| --- | --- | --- |
| POST | `/advisor/pair` | `{ pairingCode, deviceLabel? }` + key → advisor session (15 min access, rotating refresh, role `advisor_mobile`, one company) |
| POST | `/advisor/session/refresh` · `/advisor/session/logout` · GET `/advisor/me` | As participant |
| GET | `/people` | The company roster (names, roles, departments) for pickers |
| GET/POST | `/meetings` | List (sections) / create from POWER `{ title, startsAt, minutes, purpose, outcomes[], execution, attendees: [{ personId \| guest, roles[] }] }` |
| GET/PATCH | `/meetings/{id}` | With `expectedVersion` |
| POST | `/meetings/{id}/plan` | → `{ meetingType, typeReason, agenda[], gate }` (05 §4) |
| POST | `/meetings/{id}/route` | The leader's choice `{ choice: "pulse" \| "shorter" \| "as_planned" }` |
| POST | `/meetings/{id}/pulse` · GET `/meetings/{id}/pulse` | Create and watch the Pulse; second gate result when complete |
| POST | `/meetings/{id}/sessions` | Start a session `{ mode: "capture" \| "copilot" \| "facilitator", voice?: "tts_lines" \| "realtime" }` |
| POST | `/sessions/{id}/consent` | `{ attendees: [{ personId, state: "consented" \| "declined", at }], noticeVersion, appVersion }` |
| POST | `/sessions/{id}/segments` | Chunked audio upload: `{ segmentIndex, chunkIndex, chunkCount, sha256 }` + bytes; resumable; final segment hash checked |
| POST | `/sessions/{id}/transcript` | Committed live segments `{ id, revision, startMs, endMs, text, speaker? }[]` |
| POST | `/sessions/{id}/coach` | → coach panel state (05 §6) |
| POST | `/sessions/{id}/park` | `{ text, speaker?, atMs }` |
| POST | `/sessions/{id}/facilitator/turn` | `{ trigger }` → `{ text, addressedToPersonId?, action, promptVersion }` |
| POST | `/sessions/{id}/realtime` | Mint a realtime session (flag) |
| POST | `/sessions/{id}/state` | Facilitator state transition `{ to }` (validated with `nextMeetingState`) |
| POST | `/sessions/{id}/finish` | Stop; run batch transcription + diarization + extraction |
| GET/POST | `/sessions/{id}/speakers` | Suggested map / confirmed map |
| GET | `/sessions/{id}/proposals` · POST `/proposals/{id}/decision` | Accept / reject / edit, with `expectedVersion` |
| POST | `/proposals/{id}/follow-up` | Parked item or open question → proposed question request for a person |
| GET | `/sessions/{id}/export` | `{ markdown, json }` |
| POST | `/kickoff/{meetingId}/notes` | Attributed notes (≤ 80 × 6000 chars) and claim proposals (≤ 30) |
| POST | `/setup` · POST `/setup/{id}/understand` | Walkie-talkie setup request and its proposals |

All commands take `Idempotency-Key`. All responses use the error shape. Rate limits per session and per tenant on every provider-backed route.

### 2.4 Providers

| Interface | Fake | OpenAI (only with `OPENAI_API_KEY`) |
| --- | --- | --- |
| `TextToSpeechProvider` | Silent MP3, duration from word count | Speech endpoint, `TTS_MODEL` (default `gpt-4o-mini-tts`), `TTS_VOICE` (default `marin`) |
| `LiveTranscriptionGrantProvider` | `available: false`, or a grant for `fake-realtime.ts` with `FAKE_LIVE_TRANSCRIPTION=1` | `POST /realtime/client_secrets` (04 §2.1), `OPENAI_LIVE_TRANSCRIBE_*` |
| `TranscriptionProvider` (batch, diarized) | Scripted segments with clusters S1, S2… | `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe-diarize`) |
| `ConversationModelProvider` | Scripted facilitator lines per trigger and mode | `OPENAI_TEXT_MODEL` (set by the owner; DutyGraph's default text model id is `gpt-5.6-sol`) |
| `JudgmentProvider` | Deterministic rules (05 §4) | Same text model with a strict JSON schema; output through `parseJudgment`; safe default on any failure |
| `RealtimeSessionProvider` | Simulated | `POST /realtime/calls` with SDP, `gpt-realtime-2.1` |

Every model input wraps participant words, transcripts and company records in data blocks (`<<<DATA id=…>>> … <<<END DATA id=…>>>`, as `prompt-pack.ts` does). Every model output that reaches a participant passes `toParticipantFacing()` (no scores, confidence or rationale).

## 3. Connecting the app

| `EXPO_PUBLIC_DATA_SOURCE` | `EXPO_PUBLIC_API_BASE_URL` | `EXPO_PUBLIC_MEETINGS_API_BASE_URL` | Result |
| --- | --- | --- | --- |
| `mock` (default) | — | — | Everything on fictional data, no network |
| `http` | `http://localhost:4417` | `http://localhost:4417` | Dev server, fake mode: all features |
| `http` | `http://localhost:4417` (dev server with `DUTYGRAPH_ORIGIN=http://localhost:4317`) | `http://localhost:4417` | Real DutyGraph participant API through the proxy + new features locally |
| `http` | `https://dutygraph.com` | unset | Real participant features only; new features show "Not available on your account yet" |

From a physical phone use the computer's LAN address. `EXPO_PUBLIC_COMPANION_SCOPE` stays (`questions` default, `full`).

The `http` repository uses `EXPO_PUBLIC_MEETINGS_API_BASE_URL` for `/api/mobile/v1x` and `/api/mobile/meetings/v1`. When it is unset, every new operation rejects with `NOT_AVAILABLE` and the screens show the honest "not available yet" state that the seed already uses.

## 4. Environment variables (names only; never commit values)

### App (public, end up in the bundle: never a secret)

`EXPO_PUBLIC_DATA_SOURCE`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_MEETINGS_API_BASE_URL`, `EXPO_PUBLIC_COMPANION_SCOPE`.

### Dev server (server only)

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | 4417 | |
| `DUTYGRAPH_ORIGIN` | unset | Proxy target for `/api/mobile/v1` |
| `DEV_SERVER_DATA_FILE` | unset | JSON persistence |
| `DEV_SERVER_AUDIO_DIR` | `./.data/audio` | TTS cache and meeting audio |
| `OPENAI_API_KEY` | unset | Turns on OpenAI providers. Never in the app |
| `OPENAI_API_BASE_URL` | `https://api.openai.com/v1` | For tests and fakes |
| `OPENAI_LIVE_TRANSCRIBE_API_KEY` | falls back to `OPENAI_API_KEY` | DutyGraph's own name for the live-transcription key |
| `OPENAI_LIVE_TRANSCRIBE_MODEL` | `gpt-live-transcribe` | |
| `OPENAI_LIVE_TRANSCRIBE_DELAY` | `low` | Empty to omit |
| `OPENAI_LIVE_TRANSCRIBE_WS_URL` | `wss://api.openai.com/v1/realtime?intent=transcription` | |
| `OPENAI_LIVE_TRANSCRIBE_SECONDS` | 600 | |
| `TTS_MODEL` | `gpt-4o-mini-tts` | |
| `TTS_VOICE` | `marin` | |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe-diarize` | Batch meeting transcription |
| `OPENAI_TEXT_MODEL` | unset (fake) | Facilitator and judgments |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | |
| `FAKE_LIVE_TRANSCRIPTION` | unset | `1` serves grants for the local fake socket |
| `FEATURE_FOLLOW_UPS` | `table` | `ai` turns on AI-written follow-ups |
| `FEATURE_AUTO_ADVANCE` | `false` | |
| `MEETING_BUDGET_CENTS_LIVE` | 1500 | Per-meeting cap for live voice |
| `MEETING_BUDGET_CENTS_RECORD` | 200 | Per-meeting cap for record-and-process |

The real DutyGraph server already uses (do not set them in this repo; listed so names match when porting): `XAI_API_KEY`, `OPENAI_LIVE_TRANSCRIBE_*`, `OPENAI_API_BASE_URL`, `EXPO_PUSH_ENABLED`, `DATABASE_URL`, `APP_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DATABASE_PASSWORD`, `PROVIDER_ENCRYPTION_KEY`.

## 5. Database notes (Neon) and proposed SQL

The app never talks to a database. The dev server stores in memory. For the team, write `dev-server/sql/proposed-migrations.sql` in DutyGraph's style:

- Numbered file header `-- 00NN-meeting-os (proposed, not applied)`; the next free number is decided by the team.
- Every table has `id uuid PRIMARY KEY`, `tenant_id uuid NOT NULL REFERENCES tenants(id)`, `company_id uuid NOT NULL`, `FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id)`, timestamps.
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY; ALTER TABLE … FORCE ROW LEVEL SECURITY;` and `CREATE POLICY tenant_scope ON … USING (tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));`
- Grants to the runtime role: `GRANT SELECT, INSERT, UPDATE, DELETE ON … TO dutygraph_app;` (the DutyGraph repo keeps these in `server/runtime-grants.ts`).
- Bearer lookups happen before the tenant is known, so token tables need `SECURITY DEFINER` lookup functions like `mobile_session_by_access_hash(text)` (see `seed`'s migration pattern in `reference/server-reference/mobile-auth.ts`). Store only hashes of tokens.
- Business records in DutyGraph live in `records` / `record_versions` (versioned, hashed). Prefer new record kinds (`meeting`, `meeting_proposal`, `pulse`) over new business tables where the team's pattern allows; device and session credentials get their own tables.
- Audio: `assets` with 512 KB chunks and SHA-256 checksums, 25 MB ceiling per clip today, retention by the company `retentionDays` (1 to 365).
- Proposed tables: `advisor_devices`, `advisor_sessions`, `advisor_pairing_codes`, `meeting_sessions`, `meeting_attendee_consents`, `meeting_segments`, `transcript_segments` (id, revision, speaker cluster), `meeting_speaker_maps`, `meeting_proposals` (with `source_segment_ids uuid[]`, `stale boolean`), `meeting_parked_items`, `pulses`, `pulse_participants`, `voice_line_cache` (hash, voice, model, duration, asset id; no text).
- Hosting facts for the team (not for you to run): Neon does not apply migrations on a Vercel deploy; they run `npm run db:migrate` with `MIGRATION_DATABASE_URL` and `APP_DATABASE_PASSWORD`, against both preview databases (`dutygraph_matt` for `matt/dev` and `neondb` for `develop`, both on the Neon branch `preview-develop`). Pasting SQL into the Neon editor skips the grants step and breaks the runtime role with `42501`. Missing migrations show as an error banner on every tab of the web app.

## 6. Porting notes (write `docs/PORTING-TO-DUTYGRAPH.md` in Phase 14)

For each dev-server route: the target file in the DutyGraph server (`server/mobile-participant.ts` for `/v1x` participant routes, a new `server/mobile-meetings.ts` for advisor routes, `server/live-transcription.ts` for the grant, `server/companion/` for the facilitator), the tables, the env vars, the tests to port, and the contract revision (participant additions → companion contract 1.4; advisor routes → a new `contracts/advisor-mobile.openapi.json`).
