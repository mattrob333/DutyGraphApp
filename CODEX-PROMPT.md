# Paste this into Codex as the first message

You are building the React Native version of DutyGraph's information-gathering tool and meeting tool, with voice-to-voice on top of the existing card deck. Work through the whole build tonight without stopping to ask me anything. I will read your progress in the morning.

**Read first, in this order:**
1. `README.md` (this package)
2. `PRD.md`
3. `docs/01-BUILD-PLAN.md` (the phases you run)
4. `docs/11-DECISIONS-AND-DEFAULTS.md` (use these instead of asking)
5. `docs/10-RULES-AND-GUARDRAILS.md` (these override convenience)
6. The other docs in `docs/` when a phase points to them, and `reference/` for source material.

**Then do this:**
- Phase 0: set up the repository from `seed/` exactly as the build plan says, and get every seed check green before you write new code.
- Run Phase 1 to Phase 14 in order. After each phase run all checks (docs/09 §1), fix failures, update `PROGRESS.md`, and commit `phase N: <what>`. Then start the next phase immediately.
- When every phase is done, run the "Extra passes" at the end of the build plan until you run out of time.

**Rules you must not break:**
- Never stop to ask. Use docs/11; when it does not cover a case, pick the safest, smallest, most reversible option, write it in `DECISIONS-LOG.md`, and continue.
- When something is blocked for about 30 minutes, write it under "Blocked" in `PROGRESS.md`, put a stub behind the interface, and move on.
- Never skip, delete or weaken a test. Never disable type checking.
- No secrets in the repo, bundle, fixtures or logs. Env var names only. No test calls a real provider.
- Expo SDK 57 / React Native 0.86 differ from your training data. Read `mobile/AGENTS.md` and the versioned Expo docs before using an API. Add packages with `npx expo install`.
- Screens use the repository layer, never `fetch`. Shared deck logic stays pure.
- Only Next ends a card (auto-advance stays off by default behind a flag).
- Fictional people and companies only. Attribute the POWER framework to Carson Tate.
- Do not say any proposed feature works on a phone or with a real provider unless you ran it; write "not run on a device" instead.
- Do not change the DutyGraph web app. Write what the DutyGraph team must add on their side in `docs/PORTING-TO-DUTYGRAPH.md`.

**At the end,** put at the top of `PROGRESS.md`: a one-paragraph summary, a table of phases with status and check results, what is not run on a device, anything blocked, and the open questions from docs/11.
