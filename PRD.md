# DutyGraph Mobile: Meeting and Information-Gathering App

## Product Requirements Document for the React Native build

| | |
| --- | --- |
| **Owner** | Matt Roberson (DutyGraph, Tier 4 Intelligence) |
| **Builder** | OpenAI Codex, running unattended |
| **Date** | October 27, 2026 |
| **Status** | Approved for build by the owner ("write the PRD, give it everything"). Everything in "Built today" sections exists in the DutyGraph repository on branch `matt/dev`. Everything else is new work this build creates. |
| **Package** | This file, the `docs/` folder (how to build it), `seed/` (code to start from) and `reference/` (source documents and code copied from the DutyGraph repository). |

Read this whole file first. Then read [docs/01-BUILD-PLAN.md](docs/01-BUILD-PLAN.md) and start Phase 0. You do not need to ask questions. Where this document leaves a choice open, [docs/11-DECISIONS-AND-DEFAULTS.md](docs/11-DECISIONS-AND-DEFAULTS.md) gives the default to use. Record any new choice you make in `DECISIONS-LOG.md` in the repository you create, and keep going.

---

## 1. Summary

DutyGraph builds an AI-readable operating model of a company: who does what, how the work is done, which systems it uses, who decides, and where work waits. It gets that knowledge from conversations with the people who do the work. Today those conversations happen in a web app (advisor side) and on a private link or a phone app (employee side).

This build makes **one React Native app (Expo) with two tools and one voice layer**:

1. **The information-gathering tool.** People answer DutyGraph's questions by talking. The question cards "flash by": one card per question, chips light up as the person covers each point, and the next card slides in. A **live transcript** shows the words as they are said. At the end, **"Here's what we heard"** shows each answer as an editable card, and the person sends it. Later the answers become **Task Cards** the person checks. This exists today (the "hands-free question cards"). This build ports it into the new app and extends it.
2. **The meeting tool (Meeting OS).** An advisor or meeting leader plans a meeting with the **Carson Tate POWER framework** (Purpose, Outcomes, Who, Execution, Responsibility, plus DutyGraph's Evidence and Coverage). DutyGraph decides if the meeting is needed (async Pulse, shortened, or live), runs it in one of three modes (Capture, Copilot, Facilitator), closes it with a closing ritual (decisions, actions, owners, dates, open questions), and turns the result into proposals a person approves. This is new.
3. **The voice layer: voice-to-voice.** On top of the flashing cards and the live transcript, the app **speaks**: each card reads its question aloud, spoken follow-ups ask for a missing point, and in a meeting the AI facilitator speaks at the right moments. The person answers by voice. Typing is always available. This is new.

The app connects to the real DutyGraph server for everything the server has today (participant enrollment, question requests, coverage check, "Here's what we heard", submit, transcription, Task Card checks). For everything the server does not have yet (voice output, meetings, Pulse, the advisor phone session), this build also creates a small **development server** (`dev-server/`) that implements a proposed API with fake providers and optional real OpenAI calls. The DutyGraph team later moves those endpoints into the main server. The app never holds a provider key.

## 2. How to use this package

| Folder | What it is | How to use it |
| --- | --- | --- |
| `PRD.md` | This document: what to build and why | Read first |
| `docs/` | How to build it: phases, architecture, design system, voice, Meeting OS, information gathering, backend and API, data model, testing, rules, decisions | Follow `01-BUILD-PLAN.md` phase by phase |
| `seed/` | A working starting point copied from the DutyGraph repository: `seed/mobile` (the existing Expo Companion app, 18,000 lines, tests passing), `seed/shared` (the pure deck logic shared with the web and server), `seed/contracts` (the API contract and design tokens), `seed/server/companion` (the facilitator prompt pack) | Copy `seed/*` to the root of the new repository in Phase 0. The folder layout matters: the app imports `../shared/hands-free` |
| `reference/` | Source material, read-only: product docs, the Meeting OS north star with the Carson Tate framework, the design prototype and 50 screen captures, the web version of the voice deck, server handlers | Read when a phase points to it. Do not copy it into the app unchanged |

You build a **new standalone repository** named `dutygraph-mobile`. Do not try to change the DutyGraph web app or its server. The owner's team merges your work back later.

## 3. Background: DutyGraph in one page

Read `reference/docs/VISION.md` sections 1 to 29 for the full picture. The parts this build needs:

- **The loop.** Discover → Map → Operate → Learn → Diagnose → Route → Execute → Govern → Measure → Update. This app serves **Discover** (gathering knowledge from people) and **Operate/Learn** (meetings and Pulses that keep the model current).
- **The discovery chain** (built in the web app). Outside-in research on the company → a **sponsor packet** to the main contact (corrects the research, names the team) → an **executive kickoff** (the leadership meeting, eight topics) → **team interviews** (each employee answers personal questions) → **Task Cards** (one per task: trigger, inputs, steps, systems, output, handoff) → the employee checks their cards → the advisor accepts. Each step feeds the next.
- **Three kinds of intelligence.** "AI proposes. Judgment models assess. Code enforces. Accountable humans approve." The generative model talks and drafts. A judgment layer (called **Jev** in DutyGraph) answers typed questions such as "is a follow-up needed?" or "is the meeting ready to close?". Ordinary code handles time, counts, permissions, ids and state. Nothing becomes company truth until a person accepts it.
- **Evidence over transcript.** The transcript is evidence. The product is what the conversation changes: decisions, actions, open questions, Task Card changes. Every proposal keeps its source (who said it, the quote, the transcript segment).
- **Participant-first.** The employee side must feel like "this saves me from meetings, remembers what I said, and only asks what it needs", never "my employer installed an AI audit tool". No scores, no rankings, no streaks, no shame.

## 4. Users

| User | What they do in this app | Sign-in |
| --- | --- | --- |
| **Participant** (employee, sponsor, executive) | Answers question cards by voice or text, reviews "Here's what we heard", sends; checks Task Cards; answers a Pulse instead of a status meeting; reads a pre-meeting brief; confirms a meeting wrap-up; reports "something changed" | Invitation link (`/mobile/enroll?t=…`) gives a participant mobile session. **Built today.** |
| **Advisor / meeting leader** (DutyGraph advisor, FDE, or a client manager who runs meetings) | Plans meetings with POWER; runs a meeting on the phone (record, coach, facilitate); runs the executive kickoff guide with attributed notes; answers setup topics by voice ("walkie-talkie"); reviews proposals before they go to the web app | QR hand-off from the signed-in web app gives a company-scoped advisor device session. **Proposed; the dev server implements it.** |
| **The AI facilitator** | Speaks questions and follow-ups, keeps time, parks topics, closes the loop | Server side only. Never on the device. |

## 5. Goals and non-goals

### Goals

1. A participant can finish a 6-question interview **hands-free by voice in about 3 minutes**: the card speaks, they talk, chips light, they tap Next (or it moves on, if the owner turns that on), they review and send.
2. The voice-to-voice deck **never talks over the person** and **never ends a card while they are still talking**.
3. An advisor can plan a meeting with POWER in under 2 minutes, and DutyGraph says whether it should be async, shorter, or live.
4. An advisor can record an in-person meeting on one phone with consent from every attendee, see coach prompts live, and get attributed proposals after.
5. In Facilitator mode the AI runs a short meeting by voice: opening, one question at a time to a named person, time boxes, "park it", and the closing ritual.
6. Every output is a **proposal** with its source. Nothing is applied without a person's tap.
7. The app works on **mock data with no server** (demo mode), against the **dev server**, and against the **real DutyGraph server** for what it supports today.

### Non-goals (this build)

- Changing the DutyGraph web app, its server, its database or its migrations. You write proposed SQL and a proposed API contract; the team applies them.
- Joining Zoom, Teams or Google Meet calls with a bot. In-person and phone-speaker meetings only.
- Voiceprints or any stored voice identity (legal risk). Speaker mapping is per meeting, confirmed by a person.
- Payments, outreach email, research runs, agent governance. Those stay in the web app.
- Publishing to the App Store or Play Store. EAS build profiles yes; submission no.
- Showing any participant a score, confidence number, judgment label or other people's answers.

## 6. Product scope

### 6.1 The information-gathering tool

#### Built today (port it, keep it working)

The hands-free question cards in `seed/mobile` (spec: `reference/docs/COMPANION-HANDS-FREE.md`; design: `reference/design/companion-mobile/screens/hf-*.png`):

- **Intro**: "6 quick questions about your work · About 3 minutes", the question list, **Start with voice**, **Type instead**, **Why am I being asked this?**
- **Microphone consent** (first time only), with accurate privacy copy.
- **The deck**: one card per question. The card shows the eyebrow ("Question 2 of 6"), the question, and 1 to 3 **"Try to cover" chips**. As the person talks, a **caption box** shows the live words with a waveform, and chips turn sage with a check as their cues are heard. After a pause the card **checks** (local cue match, plus an optional server check that returns hint ids only, 2.5 s maximum). A missing chip gets a **nudge** from a fixed table ("…which tools are they?"), at most 2 per card. **Next** is quiet until every chip is heard, then lit with "That covers it. Tap Next when you're ready." Next ends the card as **Got it** (all chips) or **Saved** (some missing), never a failure. A short hold shows **Keep talking** (undo). The next card slides in; the following card peeks from the right.
- **Controls**: Pause, Skip (three reasons: "I don't know yet", "Someone else should answer this", "Skip this one"), Type instead, Previous (swipe right) with "You said: …" and **Add more**.
- **"Anything else <advisor> should know about your work?"** as the last card.
- **"Here's what we heard"**: each answer polished by the server and editable, **Show what I said**, a note for later, then one **Send to <advisor>** button. Sending, Sent, Send failed (with retry under the same idempotency key).
- **Drafts** per request in secure storage: a restart resumes at the first unanswered card.
- **Task Card check**: the participant reads each Task Card and attests it (`GET /task-cards/{id}`, `POST /task-cards/{id}/attest`).
- **States**: offline, microphone blocked, speech error, send failed, reduced motion.

The deck logic is a pure reducer, `seed/shared/hands-free/deck.ts`, shared with the web page and server. **Do not fork its behaviour.** Extend it with new events and phases (Section 7), keep its existing tests green, and add tests for every change.

#### New in this build

1. **Voice-to-voice cards** (Section 7.3): the card speaks its question, spoken nudges, a "speaking" phase in the deck, barge-in, echo guard, optional AI-written follow-ups behind a flag, optional careful auto-advance behind a flag.
2. **Live transcript upgrades**: three speech sources in order (device recognizer, OpenAI live transcription over WebSocket through a server-minted key, recorded clip with server transcription), with the fallback rules the web page uses (Section 7.2).
3. **Transcribed answer cards**: "Here's what we heard" grows into answer cards with **Show what I said** (the raw transcript), edit marks, and the source label (voice on device, voice via OpenAI, typed).
4. **Task Card review in the app** with the four web choices ("This is right", "Needs a change", "Not my work", "Not sure") and a short note, in the Task Card layout (Section 8.4). The server today accepts attest only; "Needs a change", "Not my work" and "Not sure" go to the dev server's proposed endpoint and are mapped to the real server later.
5. **Advisor information-gathering** (advisor session, proposed API):
   - **Executive kickoff guide on the phone**: the eight topics (business model and value flows; goals and evidence of success; departments, people and reporting; responsibilities under each role; one concrete task walkthrough; dependencies and delays; software, information and decision boundaries; agree the discovery follow-up), one prominent question per topic, a speaker picker for **attributed notes** ("who said what"), notes that survive app switch and restart, and an optional recording of the session (Meeting tool, Capture mode).
   - **Walkie-talkie setup**: the advisor or owner answers setup topics by voice, one topic per card, using the same deck. Answers become setup proposals.
   - **Measurement questions**: every task question asks for the unit of work, how often, and how long the person thinks one takes (owner's rule, October 26: just ask how long they think it takes; no comparison buttons).

### 6.2 The meeting tool (Meeting OS)

All of this is new. The doctrine is in Section 9 and `docs/05-MEETING-OS.md`; the source is `reference/docs/DUTYGRAPH-MEETING-OS-NORTH-STAR.md` (the owner's Meeting OS north star, October 17, 2026) and `reference/docs/companion-mobile-north-star.md`.

1. **Meeting Center** (advisor): upcoming, needs planning, needs review, recent. Participant side: the existing Meetings tab (avoided, shortened, required, brief, live, wrap-up).
2. **Meeting Builder (POWER)**: the leader answers five short prompts, by voice or text, on cards: **Purpose** (why does this meeting exist?), **Outcomes** (what must be true when it ends?), **Who** (who must contribute, decide, execute, or only know?), **Execution** (what happens next, by when?), **Responsibility** (who owns the result?). DutyGraph proposes the **meeting type** (informational, decision, problem-solving, brainstorming, team-building, instructional) and an agenda with time boxes. The leader edits and approves.
3. **Meeting Gate**: DutyGraph judges if the meeting should be **async** (send a Pulse), **shortened**, **live**, **hybrid** (Pulse first, then a short live part with only the needed people) or **not needed**. The leader sees the reason in one sentence and decides. Participants see the outcome in plain words ("You no longer need to join the 11:00 meeting.") and **time returned**.
4. **Pulse** (async meeting replacement): each participant gets a short voice or text Pulse built on the same card deck with spoken questions based on their own work and earlier commitments ("Last Monday you said the carrier API was blocking rollout. Is that still unresolved?"). Review, send. Team status shows completion only.
5. **Pre-meeting brief**: purpose, outcomes, what DutyGraph already knows, what is still needed from this person, time box.
6. **Live meeting** on one phone, three modes:
   - **Capture**: record, live transcript, no interruptions. Per-attendee consent first. Chunked recording that survives a crash or a phone call.
   - **Copilot** (silent coach): the leader's screen shows the next question, the topic timer, the "still needed" list, missing owner or decision authority, drift, and a **Park it** button. The AI never speaks.
   - **Facilitator**: the AI speaks through the phone at set moments only: the opening, a topic's time box ends, a long silence after a question, the leader taps **Next**, or a required item is still empty when a topic closes. One question at a time, addressed to a named person. Mute, skip and stop are always one tap. Stopping the AI never stops the recording.
7. **Closing ritual**: before the end, DutyGraph reads back decisions, actions with owners and dates, open questions, parked items, and unresolved contradictions, and asks each owner to confirm their item.
8. **Meeting Results** (review): speaker-to-attendee mapping (suggested from the introductions round, confirmed by the leader), attributed notes, and proposals: decisions, action items, open questions, Task Card changes, responsibility changes, contradictions. Each shows speaker, quote and transcript segment. Accept or reject each one. Parked items become follow-up questions routed to the right person.
9. **Participant wrap-up**: each attendee confirms the items DutyGraph took from the meeting about them, before they count.

### 6.3 Out of scope for both tools

Advisor tools beyond meetings and kickoff notes (accounts, outreach, research, payments, reports, agents) stay in the web app. The app links to the web app for them with a plain "Open on the web" row.

## 7. The voice layer

Full detail is in [docs/04-VOICE.md](docs/04-VOICE.md). The rules here bind every screen.

### 7.1 Principles

- **Voice-first, not voice-only.** Every voice step has **Type instead**.
- **The microphone opens only after the person chooses voice** and consents on this device. A visible "Listening…" label (text, not only colour) shows while it is on. It turns off on pause, Type instead, leaving the screen, and backgrounding. No background listening. In a recorded meeting, the recording indicator and timer are always visible, and Android uses a foreground service with a notification.
- **Accurate privacy copy.** "Your words are transcribed securely while you speak so the cards can follow along. Nothing goes to <advisor> until you review it and tap Send." Never "nothing leaves your phone". Name the service in use (the phone's own speech service, or OpenAI).
- **The deck owns the flow, not the model.** The reducer decides when to listen, check, nudge, speak and move on. A voice model may write a follow-up sentence (behind a flag) but never decides when a card ends.
- **Never talk over the person.** If the person starts talking while the app speaks, the audio stops at once (barge-in) and the deck listens.
- **No provider keys on the device.** The server mints short-lived client secrets or returns audio.

### 7.2 Speech in (live transcript)

| Order | Source | Answer source label | Where |
| --- | --- | --- | --- |
| 1 | Device recognizer (`expo-speech-recognition`, on-device where the phone supports it, interim results) | `voice_device` | Built in `seed/mobile/src/features/voice/live/native.ts` |
| 2 | OpenAI live transcription (`gpt-live-transcribe`, transcription-only session) over WebSocket with a server-minted client secret, PCM16 mono 24 kHz | `voice_openai` | Built on the web (`reference/web-reference/handsfree/speech/`); port to the app. The mobile API has no mint route yet: the dev server adds `POST /requests/{id}/live-transcription` |
| 3 | Recorded clip, transcribed after the card (`POST /requests/{id}/transcriptions`) | `voice_device` today; record the real source | Built |
| 4 | Typing | `typed` | Built |

The deck keeps one microphone session across cards and calls `reset()` between cards (phones' recognizers often stay deaf when restarted right away). A watchdog restarts the source when the microphone hears sound for 6 s with no words, at most 3 times a card. While a spoken card listens, the app also records a backup clip; if live words fail and the person talked, the clip is transcribed and its text replaces the live words (`shared/hands-free/recorded.ts`).

### 7.3 Speech out (voice-to-voice)

**Default design (build first): spoken cards on the existing deck.**

1. Each question, nudge and fixed line ("Got it.", "One last thing.", "Here's what we heard. Check it, then tap Send.") is turned into audio **on the server** with text-to-speech and **cached per text and voice**. The app downloads the audio for a request when the deck starts and plays it from the cache, so there is no delay.
2. The deck gets a new phase, **`speaking`**. The microphone opens when the audio ends, not on the fixed 1.3 s timer.
3. **Echo guard**: words heard while the app speaks are ignored, and the audio session uses voice-processing mode (echo cancellation) where the platform offers it.
4. **Barge-in**: if speech is detected while the app speaks, stop the audio and go to `listening`. The card keeps the words.
5. A **nudge is spoken only if the person is still silent** when it is due.
6. **Auto-advance** (flag `autoAdvance`, default **off**): when every chip is heard, the voice says "Got it. Next question." and the card moves on after 3 s with no words. Any word cancels it through the existing Keep talking path. With the flag off, Next ends the card (the October 18 rule).
7. **AI-written follow-ups** (flag `followUps`, values `table` | `ai`, default **`table`**): with `ai`, the server's coverage check may also return one short follow-up sentence written by the model under the voice-style and anti-overquestioning rules, spoken with streaming TTS. The deck still decides if and when it is spoken, and still counts it against the 2-nudge limit.
8. **Fallback voice**: when the server has no TTS, use the device's voice (`expo-speech`) and say so nowhere on screen; if that also fails, the deck runs silently as today.

**Meeting facilitator voice (build after the cards).** A provider interface with three implementations: (a) **TTS lines** (the facilitator's text from the server, spoken with TTS; cheapest; default), (b) **OpenAI Realtime** speech-to-speech over WebRTC (`gpt-realtime-2.1`, server-minted session, `create_response: false` in rooms so the AI answers only on the trigger events in 6.2), (c) **simulated** for mock data. The facilitator's words always come from the server's prompt pack (`seed/server/companion/prompts/`).

### 7.4 Voice selection

One neutral DutyGraph voice for every spoken line. The default TTS voice name is an env setting on the server (`TTS_VOICE`, default `marin`, the voice the existing realtime interview uses). The person can turn spoken questions off in **Me › Voice** ("Read questions aloud").

## 8. Design system and card layouts

Full detail is in [docs/03-DESIGN-SYSTEM.md](docs/03-DESIGN-SYSTEM.md). The visual source of truth is the Claude Design prototype `reference/design/companion-mobile/DutyGraph_Companion_2.dc.html` and its 50 captures at 390 × 844. The tokens already in `seed/mobile/src/theme/tokens.ts` come from it. Use only those tokens.

### 8.1 Look

- Dark first (`bg #151515`, `surface #202020`, `ink #f0eeea`), light theme supported. DM Sans 400/500/600/700.
- Colour carries meaning, never decoration: **violet** = DutyGraph's understanding, not yet confirmed; **sage** = confirmed, sent, heard, time returned; **amber** = due, attention, offline; **red** = overdue, failure. The lit Next uses `ready` (green).
- The owner's dislikes (strong): **no coloured left-edge accents on cards**, no blowing up sizes to fix hierarchy (use weight and spacing; keep the compact scale), no decorative strips, never shrink a preview until it is unreadable, rows rather than cards for lists.

### 8.2 The question card (flash card)

Card radius 12, padding 16/18. Eyebrow label (12, uppercase, 1.3 letter-spacing): "QUESTION 2 OF 6" or "ONE LAST THING". Question text 19/28 regular. Chips below (12 medium, radius 6): grey when not heard, sage with a check when heard; the missing chip pulses once on a nudge. Nudge line in violet. State label on the card: Got it (sage, check scales in), Saved, Skipped, Paused. The border and background ease from surface to sage on Got it. The next card peeks 12 to 16 px on the right. On advance the card slides left with a slight tilt and the next springs in. Swipe right goes back. Reduced motion cross-fades. New: a small speaker glyph and "Speaking…" label while the card reads its question aloud, and a tap on the question replays it.

### 8.3 The caption box and answer cards (transcribed cards)

**Caption box** under the card: dashed border, label LISTENING… / CHECKING / PAUSED / SPEAKING, the last 2 to 3 lines of live words, and a waveform from the real microphone level (24 to 48 bars; no fake animation).

**Answer card** on "Here's what we heard": the question short title, the polished answer (editable), **Show what I said** (the raw words), the source line ("Transcribed from voice on your phone" / "Transcribed by OpenAI" / nothing for typed), the skipped reason when skipped, and an edited mark when the person changed it.

### 8.4 The Task Card

The Task Card is DutyGraph's central record. Layout (from the web `TaskCheckLink` and `TaskReviewCard`):

- Eyebrow "MY WORK · TASK DESCRIPTION", title, the person's name, status ("Ready for your review" / "Confirmed · ready to send").
- Rows (label above value, 14 medium label, 16 regular value): **Duty** · **Starts when** (trigger) · **You receive** (inputs, and from whom) · **Steps** (a numbered list) · **Systems** · **Result** (output) · **Goes to** (destination or handoff) · **Checks and approvals**. A missing value reads "Not stated in your answer. Review it with your advisor."
- Choices: **This is right**, **Needs a change**, **Not my work**, **Not sure**, and an optional note.
- Meeting proposals (decision, action item, open question, Task Card change) use the same card frame with their own rows (Section 10).

### 8.5 Copy

All app text follows **ASD-STE100 Simplified Technical English**: short sentences, one instruction per sentence, active voice, common words. Plain states only: Not started, In progress, Complete, Due, Overdue. Buttons say what they do ("Send to Alex", not "Submit"). Never show "AI", "score", "confidence" or judgment names on participant screens. In client-facing copy say "leadership meeting", never "audit".

## 9. Meeting doctrine: the Carson Tate POWER framework

Source: `reference/docs/DUTYGRAPH-MEETING-OS-NORTH-STAR.md` sections 3 to 9, and the prompt-pack layer `seed/server/companion/prompts/facilitator/meeting-doctrine.md`. Carson Tate's framework comes from her book *Work Simply* (Chapter 14, on meetings). Attribute it to her in any user-facing explanation; never present it as DutyGraph's own invention.

| Letter | Question the system keeps asking | What the app does with it |
| --- | --- | --- |
| **P**urpose | Why is this conversation happening? | Builder card 1. The facilitator states it in one sentence at the opening. No purpose → the gate says "not ready". |
| **O**utcomes | What must be true when it ends? | Builder card 2. Each outcome becomes a checklist item the closing ritual checks. |
| **W**ho | Who must contribute, decide, execute, or only know? | Builder card 3. Carson Tate's four roles per attendee: **Decision maker**, **Influencer**, **Resource person**, **Executor** (one person can hold several), plus DutyGraph's **Needs to know**, who gets the summary, not the invite. Position is not authority: where decision authority is unknown, ask, never invent it. |
| **E**xecution | What happens next, by when? | Every real item ends in a next step with a date, or is marked "no next step". |
| **R**esponsibility | Who owns the result? | Every action has one named owner as stated by the people in the room. The AI never assigns one. Missing or double ownership is flagged. |
| + **Evidence** | What supports the statement or decision? | Proposals separate observed fact, the person's belief and assumption. |
| + **Coverage** | Do we know what, how, who and why for each item that matters? | Ask only for the missing one, and only if it matters. |

**Meeting types** and their playbooks: informational (bias to async), decision (exact decision, authority, options, evidence, objections, rationale), problem-solving (current state, desired state, causes, constraints, experiment), brainstorming (protect divergent thinking; evaluate later), team-building (intervene less), instructional (capture sequence, systems, rules, exceptions; produces Task Card candidates). The prompt pack has one mode file per type (`seed/server/companion/prompts/modes/`).

**Facilitator behaviour** (prompt pack, already written): one question at a time, under about 25 words; no "Great question"; never ask the same thing twice; at most one follow-up per topic unless a critical piece (owner, deadline impact) is missing; accept "I don't know" and move on; close as soon as the outcome is met. Full rules in `docs/05-MEETING-OS.md`.

## 10. Data the app reads and writes

Full types are in [docs/08-DATA-MODEL.md](docs/08-DATA-MODEL.md). Summary:

- **Built (server today):** `Participant`, `ParticipantRequest` (work questions, task checks), `ParticipantQuestion` with `key`, `short`, `hints`; `HandsFreeSubmission` (per-question answers, understood text, suggestions, responses, sources); `TaskCardView` (`id`, `title`, `version`, `hash`, `state`, `needsAttestation`, `reviewed`, `data` with duty, purpose, trigger, inputs, instructions, output, systems, humanGate, destination, mode).
- **New (dev server, proposed for the main server):** `MeetingDefinition` (POWER fields, type, agenda, attendees with roles), `MeetingGateResult`, `MeetingSession` (mode, state, consent per attendee, recording segments), `TranscriptSegment` (id, revision, speaker cluster, start/end, text), `SpeakerMap`, `ParkedItem`, `MeetingProposal` (kind: decision, action, open_question, task_card_delta, responsibility_delta, contradiction; with source segments and quote), `Pulse`, `PulseResponse`, `KickoffNote`, `SetupProposal`, `SpokenLine` (text, voice, audio URL, hash).

## 11. Backend and connection

Full detail is in [docs/07-BACKEND-AND-API.md](docs/07-BACKEND-AND-API.md).

- **The real DutyGraph server** is Node 24 + Express 5 + PostgreSQL (Neon in hosting, forced row-level security per tenant) on Vercel. Origins: `http://localhost:4317` (local), `https://dutygraph.com` (hosted). The participant API is `/api/mobile/v1`, contract `seed/contracts/companion-mobile.openapi.json` (revision 1.3). Bearer sessions: 15-minute access token, rotating refresh token, stored only in Keychain/Keystore. Errors are `{ code, message, retryable, requestId }`. Every command takes an `Idempotency-Key`.
- **The dev server** (`dev-server/`, new) is Node 22+ with Express 5 and zod 4 in the same style. It (a) serves the proposed meeting, voice and advisor API, (b) can proxy `/api/mobile/v1/*` to a real DutyGraph origin, or serve its own fake participant data, (c) uses fake providers by default and real OpenAI only when `OPENAI_API_KEY` is set on the server. It stores data in memory with an optional JSON file. It also writes `dev-server/sql/proposed-migrations.sql` in DutyGraph's migration style for the team to review.
- **The app** picks its data source with `EXPO_PUBLIC_DATA_SOURCE` = `mock` (default, no network) or `http`, and its origins with `EXPO_PUBLIC_API_BASE_URL` (DutyGraph or the dev server) and `EXPO_PUBLIC_MEETINGS_API_BASE_URL` (the dev server). Only `EXPO_PUBLIC_*` values reach the app, and they are readable by anyone: never a secret.
- **Database (Neon).** The app never connects to a database. Notes for the proposed SQL: tenant-scoped tables with `tenant_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, a `tenant_scope` policy on `current_setting('app.tenant_id', true)`, grants to the runtime role `dutygraph_app`, audio in 512 KB checksummed chunks, retention by the company's `retentionDays`. Hosted Neon does not apply migrations on deploy; the team applies them to both preview databases.

## 12. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Privacy | Microphone rules in 7.1. No answer or transcript text in logs, analytics, crash reports or push payloads. Lock-screen text is company name plus "<Advisor> has N questions for you · about M minutes", never question text. Analytics carry ids and counts only. |
| Consent | Meetings: every attendee, every time, in every place: spoken consent at the start plus a tap per person; a person who declines is excluded and their segments dropped. Record consent time, app version and notice version. |
| Security | Tokens in `expo-secure-store` only. Single-flight refresh. Logout removes drafts and unsent answers. Allow-listed deep-link routes only. Transcript text sent to a model is wrapped as data, never instructions. |
| Offline | Recording never needs the network. Drafts and pending submissions are stored before sending and retried with the same idempotency key. Completion shows only after the server acknowledges. |
| Reliability | Meeting audio in rolling segments (5 minutes) so a crash loses at most one segment; 32 kbps mono AAC; upload in chunks; warn under 500 MB free and under 30 % battery for live modes. |
| Accessibility | VoiceOver/TalkBack labels; every deck state change announced; 44 pt touch targets (48 for primary); Dynamic Type; reduced motion; contrast per tokens. |
| Performance | Cached spoken question starts under 150 ms after the card shows; barge-in stops audio under 200 ms after speech is detected; first live word under 1 s with OpenAI live transcription (measured on the web at about 0.9 s). Measure; never claim a number you did not measure. |
| Cost | Budget per meeting shown before a live mode starts; live voice falls back to record-only at the cap; recording never stops for budget. |

## 13. Phases (summary)

Details, tasks, files and checks per phase are in [docs/01-BUILD-PLAN.md](docs/01-BUILD-PLAN.md).

| Phase | Result |
| --- | --- |
| 0. Workspace | New repo from `seed/`, installs, typecheck and all existing tests pass, CI file, `PROGRESS.md`, `DECISIONS-LOG.md` |
| 1. Dev server skeleton | Express 5 dev server with fake providers, proxy mode, the participant API in fake mode, health route, tests |
| 2. Design system pass | Theme, components and a component gallery screen (`/dev/gallery`) checked against the captures |
| 3. Voice out on the cards | `speaking` phase in the deck reducer, TTS endpoint and cache, audio player, echo guard, barge-in, spoken nudges, Me › Voice switch |
| 4. Speech in upgrades | OpenAI live transcription source (WebSocket, PCM16), backup recording, watchdog, source labels |
| 5. Transcribed cards and Task Cards | Answer cards with Show what I said and sources; Task Card review with 4 choices |
| 6. Advisor session and Meeting Center | QR hand-off sign-in (dev server), role switch, Meeting Center |
| 7. Meeting Builder and Gate | POWER cards by voice or text, type and agenda proposal, gate result, participant outcomes and time returned |
| 8. Pulse | Pulse on the card deck with context-aware spoken questions, review, team status |
| 9. Live meeting: Capture and Copilot | Attendees, consent, segmented recording, live transcript, coach panel, timers, Park it |
| 10. Facilitator mode | Spoken facilitator on trigger events, prompt pack composition on the dev server, realtime provider option, mute/skip/stop |
| 11. Closing ritual and Results | Read-back and owner confirmation, speaker mapping, proposals review, parked items to follow-ups, participant wrap-up |
| 12. Kickoff guide and walkie-talkie setup | Eight-topic kickoff guide with attributed notes; setup topics by voice |
| 13. AI follow-ups and auto-advance flags | `followUps: ai`, `autoAdvance` behind flags with tests |
| 14. Hardening | Accessibility, offline, error states, E2E flows (Maestro), EAS profiles, docs, proposed contract and SQL |

## 14. Definition of done

1. `npm run verify` passes in `mobile/` and `dev-server/` (typecheck, lint, all tests).
2. Every screen in `docs/03-DESIGN-SYSTEM.md` has a web-export screenshot at 390 × 844 in `docs/screens/`, dark and light, compared with the design captures where one exists.
3. The mock data source runs every flow with no network: a participant interview with spoken cards; a Pulse; a planned meeting from POWER to gate; a live meeting in all three modes with simulated speech; the closing ritual; results review.
4. Against the dev server, the same flows run with fake providers.
5. Against a local DutyGraph server (`http://localhost:4317`), enrollment, question cards, coverage, "Here's what we heard", submit and Task Card attest still work exactly as in the seed.
6. No test calls a real provider. One script, `dev-server/scripts/rehearse-openai.ts`, runs a real TTS and live-transcription check only when `OPENAI_API_KEY` is set, and prints what it measured.
7. `contracts/meeting-mobile.openapi.json` (proposed) and `dev-server/sql/proposed-migrations.sql` exist and match what the dev server does.
8. `README.md`, `PROGRESS.md` and `DECISIONS-LOG.md` describe what was built, what was not, and every default chosen.

## 15. What must not be claimed

Do not write in code, docs or UI that any of these is built in DutyGraph: Meeting OS, Pulses, the facilitator, advisor mobile sessions, meeting recording, voice output. They are built **in this new app and dev server only**, with fake providers, until the team merges and tests them with real providers and real devices. Do not invent customers, results, savings figures or measurements. Example data is fictional (Cobalt, Noah Reed, Alex Rivera; Larkspur Supply, Dana Whitlock, Alex Moreno). Do not use the terms ContextOps, Living Playbooks or Executable Coverage.

## 16. Glossary

| Term | Meaning |
| --- | --- |
| Advisor | The DutyGraph consultant or FDE who maps a company |
| Ask / request | A set of questions sent to one person |
| Chip / hint | One "Try to cover" point on a question card, with cue words |
| Coverage check | "Is this answer enough?": local cue matching, plus an optional server check that returns hint ids only |
| Deck | The run of question cards for one request |
| Here's what we heard | The review screen of polished, editable answers before Send |
| Jev | DutyGraph's judgment layer: typed judgments such as follow-up need or close readiness. Server only |
| Meeting Gate | The judgment of whether a meeting should be async, shortened, live, hybrid, or not held |
| POWER | Carson Tate's meeting framework: Purpose, Outcomes, Who, Execution, Responsibility |
| Proposal | Anything the AI extracted. It counts only after a person accepts it |
| Pulse | A short async voice or text check-in that replaces a status meeting |
| Sponsor | The client's main contact for the engagement |
| Task Card | One task as a record: duty, trigger, inputs, steps, systems, output, handoff, checks |
| Time returned | Meeting time a participant did not have to spend, shown to them only |
