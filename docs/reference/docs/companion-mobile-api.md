# Companion mobile API contract

This note describes the authored contract for the DutyGraph Companion app. The running server accepts these request fields on `/api/mobile/v1`. React Native can call enroll, transcription, understanding, and submit without renaming fields.

## Source of truth

Use [contracts/companion-mobile.openapi.json](../contracts/companion-mobile.openapi.json).

`contracts/openapi.json` stays the generated record-transport document. `npm run contracts` checks the Companion file and does not rewrite it. Do not paste mobile paths into the generated file.

The base path is `/api/mobile/v1` on the DutyGraph origin:

- Local: `http://localhost:4317/api/mobile/v1`
- Hosted: `https://dutygraph.com/api/mobile/v1`

## Generate a typed client

From a React Native project, point a generator at the committed file. One example, using [openapi-typescript](https://github.com/openapi-ts/openapi-typescript):

```sh
npx openapi-typescript contracts/companion-mobile.openapi.json -o src/mobile-api.d.ts
```

Regenerate when the contract version changes. Do not invent response fields in the app.

## Operations in this revision

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/enroll` | Invitation token to a participant mobile session and refresh token |
| POST | `/session/refresh` | Rotate the refresh token |
| POST | `/session/logout` | Revoke the current device session |
| GET | `/me` | Minimal profile for the identity screen |
| GET | `/requests` | Needs-you inbox |
| GET | `/requests/{requestId}` | Question screen; v1.2 adds `key`, `short` and `hints` per question and `advisorName` |
| POST | `/requests/{requestId}/transcriptions` | Server-side transcription schema |
| POST | `/requests/{requestId}/understanding` | Proposed understanding schema |
| POST | `/requests/{requestId}/coverage` | v1.2: which "Try to cover" hints one card's words already cover (hint ids only; never stored) |
| POST | `/requests/{requestId}/understand` | v1.2: "Here's what we heard", the web team page's polish per answer |
| POST | `/requests/{requestId}/submit` | Save the answer, confirmed understanding, and hashes, or (v1.1) the participant's own words alone; v1.2 adds the web team page's per-question fields to the words path; v1.3 adds `questionAnswerSources` |
| GET | `/task-cards` | v1.1: cards the participant performs or owns |
| GET | `/task-cards/{taskCardId}` | v1.1: one card to read before attesting |
| POST | `/task-cards/{taskCardId}/attest` | v1.1: attest one exact card version; the last card of a task check returns the check |

## Revision 1.1 (2026-09-24, additive)

Existing 1.0 clients keep working: no field was removed or renamed, and every 1.0 request body is still valid. New behaviour a 1.1 client should use:

- **Send my words for advisor review.** Submit with `understanding: null`, `understandingUnavailable: true` and `attestation` without `understandingHash`. Offer it whenever understanding returns 429, 503 or 504, or proposes no tasks. The server saves the response and the words as proposed evidence, creates no task cards, and returns `reviewState: "words_unreviewed"`. Tell the participant: "Your answer is saved. Your advisor will review it." The advisor sees the response in Discovery marked unreviewed.
- **Incomplete steps are kept.** A proposed task with an empty field reads `"Not stated"` and lists the field in `missingFields`; `gaps` names the step. Let the participant fill the field in or leave it. Echo `missingFields` back on submit (it is accepted on confirmed tasks).
- **Configuration errors are not retryable.** No provider key is `503 UNDERSTANDING_NOT_CONFIGURED` or `503 TRANSCRIPTION_NOT_CONFIGURED` with `retryable: false`. They are checked before any daily limit is counted and before audio is stored. Daily limits are per company, sized from the roster (at least 60, plus 4 per person), and failed attempts do not count.
- **Lost responses.** Send an `Idempotency-Key` on enroll: repeating the same key and token within two minutes returns the same session and device with a new token pair (`200`, `idempotentReplay: true`). Refresh with the same key and the previous refresh token inside two minutes does the same. Without the matching key a replayed refresh token is still `401 REFRESH_REPLAY`. A repeat logout returns `204`.
- **Web-only links.** Enroll refuses leadership, first-touch, account-setup and company-picture-review links with `409 USE_WEB_LINK` before the invitation is used, so the browser link keeps working. `/requests` lists only work questions and task checks (`type: "confirmation"`, with `taskCardIds`).
- **Task checks in the app.** Read each card with `GET /task-cards/{taskCardId}` and attest it with its `version` and `hash`. When every card of an open task check is attested, the check is returned to the advisor (`checkReturned: true`); the advisor's acceptance makes the confirmations count.
- **Every keyed command** documents `400 IDEMPOTENCY_REQUIRED`.

After the advisor accepts a participant's work response, the participant's confirmations recorded with it count for the exact versions they confirmed. When the advisor later changes only advisor fields (owner, review state, review date), the performer's confirmation is copied to the new exact version with a note; a change to the described work needs a new check (decision D22).

## Revision 1.2 (2026-10-09, additive): hands-free question cards

Built on branch `matt/companion-hands-free` for the question cards in [docs/specs/COMPANION-HANDS-FREE.md](specs/COMPANION-HANDS-FREE.md). Not deployed and not rehearsed with a real AI provider. Every 1.1 request body is still valid, and every new response field is optional, so a 1.2 app can still read a 1.1 server (it then builds the hints itself with `buildQuestions` from `shared/hands-free/hints.ts`).

- **Hints on the question screen.** Each question carries `key` (`question.0`, `question.1`, …, the web team page's answer key), `short` (a title of at most 40 characters) and `hints` (1 to 3 "Try to cover" chips: `id`, `label`, `nudge`, `cues`). They come from `request.data.questionHints` when the advisor stored some (the Discovery composer's chip editor, from October 16; an entry written for other wording is ignored), otherwise from the hand-written table in `shared/hands-free/hints.ts`; no AI writes them. The detail also carries `advisorName`, the name the web team page shows. The "Anything else <advisor> should know about your work?" card is not sent; the app adds it. The web page's `GET /api/invitations/{token}/team` returns the same hints as `questionHints`, keyed by question.
- **Coverage check.** `POST /requests/{requestId}/coverage` with `{ questionKey, text }` (text up to 4000 characters) answers `{ available: true, covered: ["h0", …] }`: the company's approved AI connection reads the question, the hint labels and the words as untrusted data and returns hint ids only, under a strict JSON schema, filtered to that question's hints. Every refusal is `200 { available: false, reason }`: `AI_NOT_CONFIGURED`, `SAMPLE_COMPANY` (a sample company never reaches the model), `COVERAGE_LIMIT` (120 per request and 3000 per company in 24 hours), `SPONSOR_UNAVAILABLE`, `TIMEOUT` (about 4 seconds) or `MODEL_ERROR`. Then the app's local check stands. It never returns 429 or 503 and takes no `Idempotency-Key`: the words are not stored, and the only change is an audit event `team.coverage_checked` with the question key and without the words. A key that is not one of the request's questions is `422`. The web team link has the same route, `POST /api/invitations/{token}/team/coverage`, with the same gate (handlers: `server/participant-coverage.ts`).
- **Here's what we heard.** `POST /requests/{requestId}/understand` takes and returns exactly what `POST /api/invitations/{token}/team/understand` does (`shared/participant-understand.ts`), with the same gate and the same event, `team.understand_requested`, so the phone and the web page share the limit of 8 per request and 120 per company in 24 hours. A refusal is `200 { available: false, reason }`; the review then shows the person's own words. Nothing is stored until submit.
- **Per-question submit.** The words path (`understanding: null`, `understandingUnavailable: true`) also accepts `questionAnswers`, `questionUnderstood`, `questionSuggestions`, `questionResponses` (`unknown` or `wrong_role`) and `responseText`, with the web team page's limits (4000 characters per answer, 400 per suggestion, 30000 for `responseText`, at most 12 `question.N` keys). The server saves the same response record fields as a web team answer, returns the request, marks the invitation used, queues the participant receipt (now on the phone too, as on the web page), the gap reply job for gap follow-ups and fill extraction, and writes `mobile.submitted` with `perQuestion: true` and no answer text. `shared/hands-free/submission.ts` (`toSubmission`) builds the body. The same fields with a non-null `understanding` are `422 VALIDATION_ERROR`.
- **Push copy.** A push for a work request uses the company name as its title and "<Advisor> has N questions for you · about M minutes" as its body (a reminder starts with "Reminder: "); M is the figure the web team page shows (`minutesFor` in `shared/hands-free/hints.ts`). Task checks and the overdue notice keep their generic text. Question and answer text never appear in a notification. The Expo payload's `data` carries `requestId`, `deepLink` (`/mobile/requests/<id>`, unchanged) and `route`, the app screen a tap opens: `/questions/<id>` for work questions, `/confirmations/<id>` for task checks, `/today` otherwise. The app opens only allow-listed routes and, when `route` is missing (an older server), opens `/questions/<requestId>`.

## Revision 1.3 (2026-10-16, additive): where each answer's words came from

- **Per-answer sources on submit.** The words path also accepts `questionAnswerSources`: per `question.N`, `{ via, edited? }` with `via` one of `typed`, `voice_openai`, `voice_device` or `voice_browser` (`AnswerSource`, the values of `shared/answer-sources.ts`). The server validates it with the web team route's `answerSourcesSchema`, keeps it only for answers that have words (`sourcesForAnswers`) and stores it on the response record as on a web team answer, so Repo › To review says "Transcribed from voice on their device…" for a spoken answer and nothing for a typed one. With a non-null `understanding` it is `422 VALIDATION_ERROR`, like the other per-question fields.
- **What the app sends.** The hands-free deck records each card's input; the app's speech (`expo-speech-recognition`, the phone's own recognizer) is `voice_device`, typing is `typed`, and `edited` is set when the person typed on a spoken card or changed it on the review. `toSubmission` builds the field and `submitAnswersBody` sends it.
- **Older apps.** A 1.2 body without the field is still valid; the answer is saved without sources and shows no label.

## Rules the contract already states

- The mobile session is a bearer token. It is not the browser `dg_session` cookie and it is not `X-CSRF-Token`.
- The server derives tenant, company, person, and device from the session. A mismatch is `403` `PERSON_FORBIDDEN`.
- `expectedVersion` or a content hash that does not match the saved record is `409` `VERSION_CONFLICT` or `HASH_CONFLICT`.
- A missing, used, revoked, or expired invitation is `410` `INVITATION_EXPIRED`, matching team and kickoff links. In the browser, a used work link says when the answer was sent (`RESPONSE_ALREADY_SENT`) or that it was connected to the app (`COMPANION_CONNECTED`).
- The same `Idempotency-Key` and the same body return the saved result. A different body for that key is `409` `IDEMPOTENCY_CONFLICT`.
- Errors use `{ code, message, retryable, requestId }`.
- Understanding responses set `confirmationState` to `proposed`. Submit requires `participantConfirmed: true` and the proposal hash. That confirmation is the participant's understanding. It does not accept a Task Card as company truth.
- Task fields use the existing participant card names: title, duty, inputs, instructions, output, handoff, software, and decision. This contract does not define a second Task Card schema.
- Transcription pins `grok-voice-transcribe-2.0`. Understanding pins `grok-4.7` with reasoning effort `low` and `store: false`. No provider credential is in the schema. A missing `XAI_API_KEY` is `503`. A provider deadline is `504` `TRANSCRIPTION_TIMEOUT` or `UNDERSTANDING_TIMEOUT`. Phone clips may use `audio/m4a`, `audio/x-m4a`, or `audio/aac`. A language hint such as `en-US` is shortened to `en`. Live streaming remains `501` `STREAMING_NOT_AVAILABLE` and does not call xAI.

## Left out of this revision

`PUT /me/push-token`, `POST /requests/{requestId}/transcription-stream-ticket`, and `POST /updates`. A participant who logs out still needs a new invitation from the advisor; an emailed-code re-link is not built yet.

QA's vertical-slice matrix is [docs/qa/companion-mobile-e2e-matrix.md](qa/companion-mobile-e2e-matrix.md). The contract tests enforce those case ids and expected status codes. Microphone-denied / typing escape is client-only and has no path.

Handlers for the pinned paths are in [server/mobile-participant.ts](../server/mobile-participant.ts). Enroll consumes the invitation token. An unused browser team link still works. After that same token is used to enroll a phone, the browser link returns `410`. Transcription accepts multipart `audio` plus `meta`, or JSON with a saved `assetId`. Understanding and submit use `contentHash` and `sourceText` as named in the pin. Proposed tasks stay proposals.

Preferences, push tokens, stream tickets, and updates may also be registered. They stay out of the pin until a later contract revision.

Hosted Neon does not apply migrations during a Vercel deploy. Prefer `npm run db:migrate` with `MIGRATION_DATABASE_URL` (Neon owner, unpooled) and `APP_DATABASE_PASSWORD` before relying on phone enroll in production. That applies `0013-mobile-participant`, `0014-mobile-device-platform`, and `0015-mobile-participant-grants`, then grants tables to `dutygraph_app`. See [HOSTING.md](HOSTING.md). Do not put those values in a client or a pull request.

Pasting migration SQL into the Neon SQL Editor does not run that grant step. The tables exist, but `dutygraph_app` cannot use them, and enroll fails with PostgreSQL `42501`. Hand-applying `0013` still requires the grants in `0015`: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `participant_devices`, `participant_sessions`, and `push_subscriptions`, plus `EXECUTE` on `mobile_session_by_access_hash(text)` and `mobile_session_by_refresh_hash(text)`. Those grants do not turn off row-level security. If `schema_migrations` has no row for `0013` or `0014`, `npm run db:migrate` tries to create the tables again and stops before `0015`. Apply the `0015` statements as the owner, then reconcile the ledger before the next runner pass.

## Android App Links

Companion's Android package is `com.dutygraph.companion`. Production App Links expect the Digital Asset Links statement at `https://respond.dutygraph.com/.well-known/assetlinks.json`. That statement is the static file `client/public/.well-known/assetlinks.json`. It is not a mobile API route. `dutygraph.com` serves the same file from this project. If `respond.dutygraph.com` is still a Porkbun or l.ink redirect, attach that hostname to the dutygraph-v2 Vercel project (or serve the file there with no redirect) before Android can verify the link. See [HOSTING.md](HOSTING.md).

### Which links open the app (decision D16)

App Links and Universal Links are limited to participant paths: `/mobile/enroll` (work questions and task checks). Everything else opens in the browser, including a Companion app user's phone: `/invite/<token>` for leadership and first-touch requests, `/account-link/...` for setup, company-picture review and proposals, and `/voice-interview/...`. The Companion app must not declare intent filters or associated-domain paths for those prefixes. If one reaches the app anyway, enroll answers `409 USE_WEB_LINK` without using the invitation, and the app should open the same URL in the system browser. Pre-payment steps stay on phone web with a status link; a Companion sponsor role (engagement status, roster, kickoff, results) is planned after payment and is not in this contract.

The "Open installed Companion" button on the web page uses the `https://…/mobile/enroll?t=` App Link rather than the unowned `dutygraph://` scheme, so no bearer token is handed to another app that might claim the scheme.

### For the advisor app (not built)

**Connected phones (fix sprint H, TEAM-01-28).** Advisors see each participant's connected phones in team discovery (`GET /api/v1/companies/{companyId}/participant-phones`) and can revoke one (`POST …/participant-phones/{deviceId}/revoke`): the device and all its sessions end, so the next call returns 401. Closing the account and merging a duplicate person (`POST /api/v1/companies/{companyId}/people/merge`, TEAM-01-23) revoke phones too. A web participant can check task cards on the private link without an account (`GET/POST /api/invitations/{token}/check`, TEAM-01-08); the records are the same confirmations and returned response as the app.

The advisor React Native app is specified in [docs/redteam/2026-09-23/specs/advisor-react-native-app.md](redteam/2026-09-23/specs/advisor-react-native-app.md) (ADV-01-16). It has no mobile contract yet. Server functions it can wrap without new business logic: `GET /api/v1/companies/{companyId}/team-delivery` (per-person status: emailed, link shared, Companion connected, answered, expired, reminders) and `POST …/team-delivery/{requestId}/remind` (rate-limited push or fresh emailed link), the record `accept` action for team answers, and `POST /records` with the deterministic question templates in `shared/team-question-templates.ts`. Push to participant phones uses `server/mobile-notifications.ts` (`EXPO_PUSH_ENABLED=true` turns on Expo delivery; every attempt is a `push_deliveries` row without the token or message text). An advisor bearer role, advisor device registration and advisor push remain to be built.
