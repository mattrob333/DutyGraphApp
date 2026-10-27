# 03 · Design system, card layouts and screens

**Source of truth:** the Claude Design prototype `reference/design/companion-mobile/DutyGraph_Companion_2.dc.html` and its captures in `reference/design/companion-mobile/screens/` (390 × 844, dark; files ending `-b` are the same screen scrolled to the bottom). The prototype's script at the bottom of the HTML is a working state machine for the hands-free group (`HF_Q` near line 1076, the `hf*` methods near lines 1208 to 1400). To click through it: `cd docs/reference/design/companion-mobile && python3 -m http.server 8123`, open `/DutyGraph_Companion_2.dc.html`.

**Tokens:** `seed/mobile/src/theme/tokens.ts` (taken from the prototype). The web app's tokens are in `seed/contracts/design-tokens.json` (same family: same light theme, a slightly bluer dark theme, "evidence blue"). The phone uses `tokens.ts`. Never add a colour in a screen; add a token if one is truly missing, and log it in `DECISIONS-LOG.md`.

---

## 1. Principles

1. **Calm and compact.** Small type scale, generous spacing, one primary action per screen. Hierarchy comes from weight and spacing, not size. Do not enlarge everything to fix hierarchy.
2. **Colour is meaning, never decoration.**
   - **violet** (`violet`, `violetBg`): DutyGraph's understanding, not yet confirmed or sent.
   - **sage** (`sage`, `sageBg`): confirmed, sent, heard, time returned.
   - **amber** (`amber`, `amberBg`): due, attention, offline, time box near its end.
   - **red** (`red`, `redBg`): overdue, failure, recording indicator.
   - **ready** (`ready`, `readyInk`): the lit Next on a covered card (green, until a brand colour is chosen).
   - Everything else is neutral (`bg`, `surface`, `raised`, `ink`, `muted`, `faint`, `line`, `soft`).
3. **The owner's design rules (strong, from his reviews):**
   - No coloured left-edge accent bars on cards ("fingernails"). Use a full border or a background tint.
   - No decorative strips or "map so far" bands.
   - Never shrink a preview (email, phone, card) until it is unreadable.
   - Lists of things are **rows**, not cards. Cards are for the one thing you act on.
   - Declutter by deleting. Remove a label, counter or button unless the screen fails without it.
4. **No shame mechanics.** No scores, percentages, streaks, rankings or "you are behind". States: Not started, In progress, Complete, Due, Overdue.
5. **Participant screens never show** AI terms, confidence, judgment labels, raw scores, or other people's answers.

## 2. Tokens (from `tokens.ts`)

### Colour

| Token | Dark | Light |
| --- | --- | --- |
| bg | #151515 | #f3f2ef |
| surface | #202020 | #fffefa |
| raised | #292929 | #ffffff |
| ink | #f0eeea | #252525 |
| muted | #b8b8b8 | #595959 |
| faint | #999999 | #6b6b6b |
| line | #3b3b3b | #d9d9d7 |
| soft | #2b2b2b | #eeede9 |
| nav | #101010 | #eeede9 |
| sage / sageBg | #9cccb7 / #23382f | #416e51 / #e7efe7 |
| amber / amberBg | #e3bd83 / #3b3020 | #815622 / #f5ecdf |
| violet / violetBg | #c6b5eb / #332b46 | #6a4c94 / #eee8f7 |
| red / redBg | #e5a09a / #322423 | #a3443e / #f8e8e5 |
| accent / accentBg | #dedbd4 / #303030 | #494640 / #e9e7e2 |
| primary / primaryInk | #e7e3db / #222222 | #303030 / #fffefa |
| ready / readyInk | #238636 / #ffffff | #1f883d / #ffffff |
| focus | #dedbd4 | #59564f |
| scrim | rgba(0,0,0,0.55) | rgba(0,0,0,0.35) |

### Spacing, radius, touch

Spacing: xxs 4, xs 6, sm 8, md 12, lg 16, xl 20, xxl 28; page gutter 20; card padding 16 vertical, 18 horizontal. Radius: chip 6, button 7, card 12, sheet 20, pill 999. Touch: minimum 44, primary 48.

### Type (DM Sans)

| Style | Font | Size / line | Use |
| --- | --- | --- | --- |
| display | 600 | 28 / 34, −0.8 | Screen hero (Sent, Meeting avoided) |
| title | 600 | 22 / 28, −0.4 | Screen titles |
| question | 400 | 19 / 28 | The question on a card |
| cardTitle | 600 | 17 / 23 | Card titles |
| bodyStrong | 600 | 16 / 22 | Emphasis |
| body | 400 | 16 / 24 | Body |
| button | 600 | 16 / 20 | Primary buttons |
| buttonSecondary | 500 | 15 / 19 | Secondary buttons |
| meta | 400 | 14 / 21 | Supporting text |
| metaStrong | 500 | 14 / 20 | Row labels |
| small | 400 | 13 / 18 | Notes |
| chip | 500 | 12 / 15 | Chips |
| label | 500 | 12 / 17, +1.3, UPPERCASE | Eyebrows ("QUESTION 2 OF 6") |
| brand | 600 | 17 / 20, −0.3 | The "DutyGraph" wordmark |

All text scales with Dynamic Type. Inputs are at least 16 pt (no iOS zoom).

### Motion

Card advance: the current card slides left with a slight tilt and the next springs in (`components/handsfree/CardDeck.tsx`, `anim.ts`). Chip covered: background eases to sage, the check scales in. Got it: border and background ease from surface to sage. Reduced motion (system setting) → cross-fades only. Never animate a waveform without a real level.

## 3. Card layouts

### 3.1 Question card (the flash card) — built, extend

Reference: `hf-05-ready.png` … `hf-18-anything-else.png`.

```text
┌──────────────────────────────────────────────┐  ← card: surface, 1px line border, radius 12, padding 16/18
│ QUESTION 2 OF 6                    [🔈]       │  ← label style, muted; speaker glyph while speaking (new)
│                                              │
│ What do you need from other people before    │  ← question style (19/28)
│ you can start?                                │
│                                              │
│ …which tools are they?                        │  ← nudge, violet, metaStrong (only on a nudge)
│                                              │
│ [✓ Who sends it] [ What you receive ]         │  ← chips: soft bg + muted when not heard;
│                                              │     sageBg + sage + check when heard; missing chip pulses once
└──────────────────────────────────────────────┘ ▏← next card peeks 12–16 px at the right edge
  State labels on the card: Got it (sage, check scales in) · Saved · Skipped · Paused · Speaking… (new)
```

Past card (swipe right or Previous): "You said: …" in muted body, **Add more** button.

### 3.2 Caption box (the live transcript) — built, extend

Reference: `hf-06-listening.png`, `hf-07-checking.png`. Dashed 1 px `line` border, radius 12. Label: LISTENING… / CHECKING / PAUSED / **SPEAKING** (new) in label style. The last 2 to 3 lines of words in body style, newest at the bottom. Waveform: 24 to 48 bars from the real microphone level, `muted` colour, `sage` while words arrive.

### 3.3 Deck bar — built

Reference: `hf-06`, `hf-15-typing.png`. Pause · Skip · Type instead; in typing mode a Next button; Next is quiet until every chip is heard, then filled with `ready` and the line "That covers it. Tap Next when you're ready."

### 3.4 Answer card ("Here's what we heard") — build in Phase 5

Reference: `hf-19-review.png` (base), extend.

```text
┌──────────────────────────────────────────────┐
│ WHAT YOU NEED TO START                        │  ← label: the question's `short`
│ I get the weekly carrier file from Priya in   │  ← body; tap to edit (TextInput, 16 pt)
│ finance, usually Monday morning.              │
│ Show what I said ▾                            │  ← link style (metaStrong, accent); expands raw words in muted
│ Transcribed from voice on your phone · Edited │  ← small, faint; nothing for typed answers
└──────────────────────────────────────────────┘
 Skipped card: "You skipped this: I don't know yet." (muted) with **Answer now**.
 Bottom: A note for later (optional) · primary button "Send to Alex" (full width, 48 pt).
```

### 3.5 Task Card — build in Phase 5

From the web `TaskCheckLink.tsx` and `TaskReviewCard.tsx` (in `reference/web-reference/`).

```text
┌──────────────────────────────────────────────┐
│ MY WORK · TASK DESCRIPTION                    │  ← label
│ Book carrier pickups                          │  ← cardTitle
│ Marcus Lee                                    │  ← meta
│ Ready for your review                         │  ← metaStrong; sage with check when "Confirmed · ready to send"
│ ─────────────────────────────────────────── │
│ Duty            Ship orders on time           │  ← rows: label (metaStrong, muted) above value (body)
│ Starts when     A pallet is packed            │
│ You receive     The packing list, from Dana   │
│ Steps           1. Open the carrier portal    │  ← numbered list
│                 2. Enter the pallet details   │
│ Systems         Carrier portal, Google Sheets │
│ Result          A pickup booked for today     │
│ Goes to         The dock team                 │
│ Checks          Dana approves over $5,000     │
│ ─────────────────────────────────────────── │
│ ( This is right ) ( Needs a change )          │  ← 4 choices as large radio rows (44 pt)
│ ( Not my work )   ( Not sure )                │
│ Add a note (optional)                         │
└──────────────────────────────────────────────┘
 Missing value: "Not stated in your answer. Review it with your advisor." (muted)
```

Field labels map to `TaskCardData`: duty → Duty, trigger → Starts when, inputs → You receive, instructions → Steps, systems → Systems, output → Result, destination → Goes to, humanGate → Checks and approvals. The web review card uses longer labels ("Purpose · why I do this task", "Trigger · when this task starts", …); use the short ones on the phone and the long ones as accessibility hints.

### 3.6 Proposal card (meeting results) — build in Phase 11

Same frame as the Task Card. Eyebrow by kind: DECISION · ACTION · OPEN QUESTION · TASK CARD CHANGE · RESPONSIBILITY CHANGE · CONTRADICTION. Body rows by kind (05 Section 11). Source block: speaker name (or "Unknown speaker"), the quote in muted body with a left quote mark (not a coloured bar), time stamp as a link that plays the audio from there. State: Proposed (violet label) / Accepted (sage) / Rejected (muted, struck) / Stale (amber, "The transcript changed. Check this again."). Actions: Accept · Edit · Reject.

### 3.7 Rows

Rows are the default list element: 56 pt minimum, title (bodyStrong) and one meta line, optional right meta (time, chip), chevron when it opens something, 1 px `line` divider inset by the gutter. Use for Meeting Center, attendees, agenda topics, parking lot, notifications, requests in Today (the seed's `RequestCard` is a card because it is the one thing to act on; keep it).

## 4. New components (Phase 2)

| Component | What | States |
| --- | --- | --- |
| `Row` | List row (3.7) | default, pressed, disabled |
| `SectionHeader` | Label-style header for a list section, with an optional count | |
| `SegmentedControl` | 2 to 4 options (mode picker: Capture / Copilot / Facilitator) | selected, disabled |
| `PersonChip` | Name + role chips (Decision maker, Influencer, Resource person, Executor, Needs to know) | selected, consented (sage check), declined (muted, struck) |
| `TimerRing` | Topic time box ring with minutes left | normal, 80 % (amber), over (red outline, "Time is up") |
| `RecordingIndicator` | Red dot + "Recording" + elapsed time; always text, not only colour | recording, paused, uploading, offline-saved |
| `SpeakingIndicator` | Speaker glyph + "Speaking…" | speaking, muted |
| `ConsentRow` | Attendee row with Consent / Declined toggles | pending, consented, declined |
| `ProposalCard` | 3.6 | proposed, accepted, rejected, stale |
| `TaskCardView` | 3.5 | review, confirmed, needs change, not mine, unsure |
| `AnswerCard` | 3.4 | answered, edited, skipped, recording pending, recording failed |
| `CoachPanel` | Copilot: topic, timer, next question for a named person, still needed, flags, Park it | normal, paused (offline), time up |
| `ParkedList` | Parking lot rows with speaker and time | empty, items |
| `EmptyState` | Plain sentence + one action | |

Every component: accessibility label and role, 44 pt targets, dark and light, Dynamic Type at the largest size without clipping, a Jest render test.

## 5. Screens and routes

Existing routes are in `seed/mobile/src/app/`. New ones in **bold**. Each screen gets a screenshot at 390 × 844, dark and light, in `docs/screens/`.

### Participant

| Route | Screen | Design reference |
| --- | --- | --- |
| `/invite`, `/identity`, `/permissions/*`, `/mobile/enroll` | Onboarding | `01-*`, existing |
| `/today` | Today (requests, Pulses, confirmations, outcomes) | `01-Today.png` |
| `/questions/[id]` · `/deck` · `/review` · `/sent` | Hands-free cards, voice-to-voice | `hf-03` … `hf-22` |
| `/confirmations/[requestId]` | Task Card check (4 choices) | **new layout 3.5** |
| `/pulse/[id]` · `/conversation` · `/review` · `/complete` · `/team-status` | Pulse (on the deck) | `02`–`07`, `30`, `31` |
| `/meetings`, `/meetings/[id]/{avoided,shortened,required,brief,live,wrap-up}` | Participant meetings | `08`–`13` |
| `/work`, `/work/commitments/[id]`, `/work/waiting/[id]` | Commitments | `14`–`16` |
| `/clarifications/[id]`, `/something-changed` | Continuous discovery | `17`, `18` |
| `/me`, `/me/{notifications,voice,privacy,appearance}` | Me | `21` |

### Advisor (new)

| Route | Screen |
| --- | --- |
| **`/advisor/pair`** | Scan the QR from the web app, or paste the code |
| **`/advisor/meetings`** | Meeting Center: Needs planning, Upcoming, Live now, Needs review, Recent (rows) |
| **`/advisor/meetings/new`** | Title, time, length, then the POWER cards on the deck |
| **`/advisor/meetings/[id]/attendees`** | Attendee picker with roles |
| **`/advisor/meetings/[id]/plan`** | Type with reason, agenda rows with minutes, gate card with three choices |
| **`/advisor/meetings/[id]/pulse`** | Pulse status: who is done, then the second gate result |
| **`/advisor/meetings/[id]/start`** | Mode, budget estimate, checks (space, battery) |
| **`/advisor/meetings/[id]/consent`** | Consent statement and one ConsentRow per attendee |
| **`/advisor/meetings/[id]/live`** | Recording, live transcript, topic list; CoachPanel in Copilot; facilitator controls in Facilitator |
| **`/advisor/meetings/[id]/closing`** | Closing ritual read-back and owner confirmations |
| **`/advisor/meetings/[id]/speakers`** | Speaker map |
| **`/advisor/meetings/[id]/results`** | Proposals by kind, Accept / Edit / Reject, parked items to follow-ups, export |
| **`/advisor/kickoff/[id]`** | Executive kickoff guide: 8 topics, speaker picker, attributed notes |
| **`/advisor/setup/[id]`** | Walkie-talkie setup topics on the deck, then setup proposals |
| **`/dev/gallery`** | Component gallery (mock data only) |

### Tabs

Participant (scope `questions`, default): Today, Me. Scope `full`: Today, Work, Meetings, Me. Advisor: Meetings, Capture (shortcut to start recording a meeting now), Me.

## 6. Copy rules

- **ASD-STE100 Simplified Technical English** for all app text: short sentences (at most 20 words for instructions), one instruction per sentence, active voice, common words, no idioms.
- Buttons are verbs that say what happens: "Send to Alex", "Start with voice", "Type instead", "Park it", "Accept", "Stop AI".
- Use the person's and the advisor's names. "Alex has 6 questions for you · about 3 minutes."
- Time estimates: about 30 seconds a question (`minutesFor`), "About 3 minutes" for 6.
- Never "audit", "monitor", "track you", "AI replacing", "score". In client copy: "leadership meeting", "look at first".
- Errors say what happened and what to do: "We couldn't send this. Your answers are saved on this phone. Try again."
- The plain-language state words only: Not started, In progress, Complete, Due, Overdue.

## 7. Accessibility

- Every state change on the deck and in a live meeting is announced (`AccessibilityInfo.announceForAccessibility`), using the deck's `announce` lines.
- When VoiceOver/TalkBack is on, the app does not speak announcements through its own voice; it still plays spoken questions only if Read questions aloud is on.
- Focus moves to the heading of each new screen and to the card on a new card.
- 44 pt minimum targets, 8 pt from destructive controls.
- Colour is never the only signal (labels on every state).
- Reduced motion → cross-fades.
