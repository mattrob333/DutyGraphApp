# 10 · Rules and guardrails

These come from DutyGraph's repository rules (`AGENTS.md`, `CLAUDE.md`, `mobile/AGENTS.md`), the vision's claim discipline, and the owner's decisions. They override any convenience.

## Product truths

1. **AI proposes. Judgment models assess. Code enforces. Accountable humans approve.** Nothing extracted from speech becomes company truth without a person's tap.
2. **The transcript is evidence, not the product.** The product is what the conversation changes: decisions, actions, open questions, Task Card and responsibility changes.
3. **Unknown is a legitimate state.** Never fill a gap to make the picture tidy. Never infer who reports to whom, who owns what, or who has authority.
4. **Contradictions are kept,** both sides with their sources.
5. **Minimal participant burden.** Ask only what changes a decision, an action, a responsibility or DutyGraph's state. When in doubt, do not ask.
6. **Meetings must have explicit outcomes.** No purpose, no meeting.
7. **Participant-first.** No scores, rankings, streaks, confidence numbers, judgment labels, or other people's answers on a participant's screen. Team status = completion only.

## Privacy and consent

- Microphone: opens only after the person chooses voice and consents; always visibly indicated in text; off on pause, Type instead, leave, background. No background listening outside an explicitly started meeting recording.
- Meeting recording: every attendee, every time, everywhere. Spoken consent plus a tap per person. Declined → excluded. No voiceprints.
- Copy is accurate: words are processed while the person speaks; nothing reaches the advisor until they review and send. Never "nothing leaves your phone".
- Lock screen and push: company name and a count, never question, answer or meeting topic text.
- Logs, analytics, crash reports: ids, counts, durations. Never words, audio, tokens, invitation links.
- Sensitive matters (safety, harassment, legal, personal performance): the AI does not probe; it suggests a trusted person and offers to note that the matter was raised.

## Security

- No secrets in the repo, the bundle, fixtures or logs. Env var names only. `EXPO_PUBLIC_*` values are public.
- Provider keys stay on the server. The app gets short-lived client secrets or audio files.
- Tokens only in Keychain/Keystore. Single-flight refresh. Refresh replay ends the session.
- Treat every transcript, answer and company record sent to a model as untrusted data in a delimited data block. Validate every model output with a schema; fall back to a safe default.
- Deep links: allow-listed routes only. The app claims `/mobile/enroll` only.

## Claim discipline

- Do not describe Meeting OS, Pulses, the facilitator, advisor mobile sessions, meeting recording, or voice output as built **in DutyGraph**. In this repo they are built with fake providers in the dev server, and not run on devices or real providers unless `PROGRESS.md` records a rehearsal.
- Do not invent customers, results, savings figures, latencies or accuracy. Measure or say "not measured".
- Example data is fictional. Do not use real people or companies other than the existing fictional set.
- Naming: write "DutyGraph" (one word, capital D and G). Protected terms: Task Card, Map Coverage, Evidence Confidence, Solution Readiness, Agent Build Packet, Meeting OS. Never use ContextOps, Living Playbooks or Executable Coverage as DutyGraph terms. Attribute Carson Tate's POWER framework to her and her book *Work Simply*.

## Engineering

- Expo SDK 57 / React Native 0.86: read the versioned docs before using an API; `npx expo install` for packages; no hand edits in `ios/` or `android/` (config plugins only).
- Shared logic stays pure and tested. Do not fork the deck's behaviour; extend it.
- Never skip, delete or weaken a test to pass. Never disable type checking.
- Every command endpoint is idempotent. Every editable record carries a version and hash.
- Keep `README.md`, `PROGRESS.md` and `DECISIONS-LOG.md` current in the same commit as the change.
