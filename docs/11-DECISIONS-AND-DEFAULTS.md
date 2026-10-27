# 11 · Decisions and defaults

Use these defaults without asking. The owner can change any of them later; build them as settings or flags where the table says so. Add every new choice you make to `DECISIONS-LOG.md`.

| # | Question | Default for this build | Flag / where | Why |
| --- | --- | --- | --- | --- |
| D1 | New repo or inside DutyGraphV2? | New standalone repo `dutygraph-mobile`, seeded from `seed/` | — | The owner asked for a standalone project; avoids collisions with active web work. The team ports back later |
| D2 | App name and bundle id | Keep "DutyGraph Companion", `com.dutygraph.companion`, scheme `dutygraph-companion` | `app.json` | Matches App Links config and the web's "Open installed Companion" button |
| D3 | Voice-to-voice design | Spoken cards on the existing deck: server TTS, cached per line; deck owns the flow | — | Cheapest, no delay, keeps the deck's safety rules (research of October 21, 2026) |
| D4 | Read questions aloud default | **On** in this app (the person still chooses voice at the intro) | Me › Voice `speakQuestions` | The owner asked for voice-to-voice |
| D5 | Does a spoken card move on by itself? | **No.** Next ends a card (Jesse's October 18 rule after a phone test). Careful auto-advance exists behind a flag | `autoAdvance` (default false) | Cards cut people off mid-sentence before the rule |
| D6 | Who writes follow-ups? | The hint table (fixed nudges), spoken | `followUps: table` (alternative `ai`) | Model text spoken to employees needs the owner's yes; the `ai` path is built and tested behind the flag |
| D7 | TTS model and voice | `gpt-4o-mini-tts`, voice `marin` | `TTS_MODEL`, `TTS_VOICE` | `marin` is the voice the existing realtime interview uses |
| D8 | Device TTS fallback | `expo-speech` when the server has no TTS | — | Works offline; robotic, so fallback only |
| D9 | iOS silent switch | Play spoken questions while the deck is open | audio mode | The person chose voice |
| D10 | Live transcript source on phones | Device recognizer first; OpenAI live transcription when the server grants it and the company allows it; recorded clip backup | `liveTranscription` in `/v1x/config` | Device is free and private; OpenAI is better for names |
| D11 | Meeting facilitator voice | `tts_lines` (server writes the line, TTS speaks it); `realtime` behind a flag | session `voice` | Controller keeps control; cost does not grow with length |
| D12 | Live meeting mode order | Build all three; default mode for new meetings: **Copilot** | Start screen | Silent coach first: cheaper and less "surveillance" feel (walkie-talkie spec recommendation) |
| D13 | Kickoff default mode | Capture | Start screen | The leadership meeting is human-led |
| D14 | Advisor sign-in on the phone | QR pairing from the web app → company-scoped device session (15 min access, rotating refresh). In dev, a pairing code from the dev server | — | No all-companies session on a phone |
| D15 | Speaker attribution | Per-meeting diarization clusters, suggested from the introductions round, confirmed by the leader. No voiceprints | — | Biometric law risk |
| D16 | Consent | Every attendee, every time, everywhere; spoken + tap; declined excluded | — | All-party-consent states; employment context |
| D17 | Batch meeting transcription | `gpt-4o-transcribe-diarize` behind the provider interface | `OPENAI_TRANSCRIBE_MODEL` | One vendor for this build; the interface allows Deepgram/AssemblyAI later |
| D18 | Budget defaults | $2 per meeting record-and-process, $15 per meeting live voice; recording never stops for budget | `MEETING_BUDGET_CENTS_*` | Proposed in the walkie-talkie spec |
| D19 | Time estimate | 30 s a question (`minutesFor`); Pulse = 30 s a question + 1 min | — | Decided October 10 |
| D20 | Measurement questions | Ask unit of work, how often, and "about how long do you think one takes?". No comparison buttons | — | Owner, October 26 |
| D21 | Task Card choices | This is right / Needs a change / Not my work / Not sure + note; only "This is right" reaches the real server today | `/v1x/task-cards/:id/decision` | Matches the web check page |
| D22 | Participant roles in a meeting | Carson Tate's four (Decision maker, Influencer, Resource person, Executor) + Needs to know | — | From the Meeting OS north star |
| D23 | Gate judgment | Deterministic rules by default; model judgment when `OPENAI_TEXT_MODEL` is set; policy rules always enforced | — | Jev judges, code enforces |
| D24 | Copy standard | ASD-STE100 Simplified Technical English | — | Owner's app-wide rule (October 20) |
| D25 | Scope switch | Keep `EXPO_PUBLIC_COMPANION_SCOPE` (`questions` default, `full`); advisor screens appear only with an advisor session | env | Existing behaviour |
| D26 | Tabs for the advisor | Meetings, Capture, Me | — | Meeting-first |
| D27 | When to speak in a room | Only on the six triggers; wait 1.2 s silence; give up after 8 s and show on screen | — | Never talk over people |
| D28 | Data persistence in the dev server | In memory + optional JSON file | `DEV_SERVER_DATA_FILE` | No database dependency for an unattended run |
| D29 | Pairing QR on the web | Out of scope (web app not changed); the dev server's `/dev/pairing-code` stands in | — | Non-goal: no web changes |
| D30 | GPT-Live adapter | Not built unless every phase and extra pass is done | — | Launch status unclear |

## Open questions for the owner (do not wait for them)

Write these at the top of `PROGRESS.md` so the owner sees them in the morning:
1. Turn on careful auto-advance (D5)?
2. Allow AI-written spoken follow-ups for employees (D6)?
3. Default facilitator voice: TTS lines or realtime (D11)?
4. Who reviews the consent script and recording notice (legal)?
5. Meeting budget defaults (D18) and who pays provider usage (DutyGraph keys or the advisor's)?
