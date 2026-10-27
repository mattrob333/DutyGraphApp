# Local voice-interview dashboard pilot

This local feature is not a public deployment or production acceptance of Voice Capture V2.

## Review locally

Run `npm run setup`, `npm run build`, then `npm start`. Use the configured app origin (default http://localhost:4317), sign in or open the fictional sample workspace, then select **Discovery → 04 Team interviews**. The standalone Voice interviews sidebar tab was removed. See the [branch explainer and review checklist](voice-interview-review.md) for the final placement and latest pre-push verification.

- **Connections** reuses the existing account-scoped encrypted OpenAI settings. Never enter a key in chat. The selected reasoning model controls summaries; voice currently uses `gpt-realtime-2.1` / `marin` and `gpt-4o-mini-transcribe` input transcription. Account configuration does not prove model access, billing, or microphone quality.
- **New invitation** records name, role, company context, goals, and 5–30 minute duration. Links expire after seven days and can be revoked before submission. The full bearer link is shown only at creation; stored tokens are hashed. Save/copy it at that point. No email is sent.
- Participants consent before live audio is sent to OpenAI, using the sponsoring account's key. No participant API key or account is needed. Link possession is not independently verified identity.
- Finish stops the voice connection and opens transcript review. Corrections are spoken by continuing the interview, preserving original and correction statements. **Submit interview to advisor** publishes the transcript; the participant need not download or email anything.
- The dashboard retains submitted transcripts separately from generated summaries and advisor notes. AI summaries are drafts; this feature does not create duties, tasks, or accepted evidence automatically.

## Persistence and recovery

Migration 0016 (`0016-voice-interviews`) adds a forced-tenant-RLS table with company foreign keys. Public tokens contain a tenant routing identifier plus random secret, and only the combined token's hash is matched. Advisor reads omit unfinished transcripts and summaries. Public checkpoints serialize revisions; an expired/revoked link is rejected. Repeated submission returns the existing receipt and cannot mutate the submitted transcript.

The server starts a durable-state summary job after submission. Processing is claimed with a lease; interrupted processing can resume when an advisor lists/opens the interview. Failed jobs support explicit retry up to six attempts. This is not an independent always-running hosted queue: if the process stops, reopening the dashboard drives recovery. No external deployment or maintenance schedule was changed.

## Limits requiring acceptance before external beta

- Localhost invitation URLs only work on this computer. Other devices need a separately authorized HTTPS deployment.
- There are at most three voice connection starts per invitation. Browser duration caps are per connection and not billing guarantees; revocation blocks new API access but does not forcibly terminate a previously negotiated provider call.
- No raw-audio recording or recovery exists in this feature. Saved transcript checkpoints can be restored; unsaved words and audio cannot. Abrupt Stop or delayed provider events can omit the last turn. Provider retention policies apply.
- Transcript events are client-reported and can be corrected/supplied by the holder of the invitation, not cryptographically authenticated provider evidence.
- History currently shows the newest 200 interviews. No full erasure, retention purge, object storage, or automated email notification is implemented.
- Public request rate limiting is per process; production-distributed abuse controls and provider budgets require further work.
- Real realtime access, transcription/summary quality, 30-minute performance, actual phones/Bluetooth, and sensitive-data readiness remain unverified.

## Local verification

Latest rerun: build/typecheck passed; the full suite returned 319 passed and one failure in the existing work-gap scheduler test. A targeted rerun of that scheduler file and the new voice tests passed all 12 tests. This does not establish that the full parallel suite is clean. Contract generation, git diff whitespace checks, and dependency audit (zero vulnerabilities) passed. The integrated dashboard loaded in headless Chrome without page JavaScript errors, and its screenshot was reviewed. Targeted database tests cover private drafts, revision conflict, token scope/expiry/revocation, repeat submission, tenant RLS, synthetic summary generation and advisor notes. Paid providers were not called. Earlier browser checks used fictional sample data: create invitation, public page, history after reload, draft privacy notice and revocation; the recorded single-run timing is not a benchmark or voice-latency measurement. Independent source review found no critical authorization, private-draft disclosure, or submission-idempotency blocker. It identified one uncorrected lifecycle issue: browser back/forward-cache restoration can retain a listening/paused UI after pagehide has closed the connection; reload the participant page to recover saved checkpoints. This finding is static, not browser-reproduced. Live-provider and long-session acceptance remain outstanding.
