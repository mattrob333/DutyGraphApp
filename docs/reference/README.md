# Reference material (read-only)

Copied from the DutyGraph repository on October 27, 2026. Each doc's own status line wins over this table. Read these for behaviour, copy and design. Do not edit them; build in `mobile/`, `shared/` and `dev-server/`.

## docs/

| File | What | Status |
| --- | --- | --- |
| COMPANION-HANDS-FREE.md | The card deck rules (phases, timings, nudges, Next ends a card) | Built (web and mobile) |
| companion-app.md | The Expo Companion app as built | Built |
| companion-mobile-api.md | The participant mobile API v1.3 | Built |
| companion-mobile-north-star.md | Where the Companion app should go | Proposed |
| voice-interviews-local-pilot.md | Realtime voice interviews (gpt-realtime, voice marin) | Built as a local pilot (web) |
| voice-walkie-talkie.md | Meeting recording, Copilot, Facilitator, consent, budgets | Draft spec (Sept 29), not built in DutyGraph. The PRD tells you what to build from it here |
| listen-intelligently.md | Listening for topics while a person speaks | Planned, not started (the built coverage check is in COMPANION-HANDS-FREE.md) |
| leadership-meeting-workspace.md | The leadership kickoff meeting workspace | Built in part (web) |
| kickoff-capture.md | Kickoff notes and claim proposals | Built in part (web) |
| advisor-react-native-app.md | An earlier advisor mobile app plan | Proposed |
| DUTYGRAPH-MEETING-OS-NORTH-STAR.md | Meeting OS: Carson Tate's POWER framework, roles, gate, lifecycle | Proposed |
| VISION.md | DutyGraph's master vision (north star, not a list of built features) | Mostly roadmap |
| WRITING-STANDARD.md | ASD-STE100 writing rules for all UI copy | Rule |

## design/companion-mobile/

HTML click-through prototype (`DutyGraph_Companion_2.dc.html` with `support.js`; the "before hands-free" version for comparison) and phone screenshots in `screens/`. Use for layout and tone; the tokens in `seed/mobile/src/theme/tokens.ts` win where they differ.

## web-reference/

The web app's hands-free deck (`handsfree/`: deck screen, intro, review, flow model, speech adapters, CSS) and the Task Card check UI (`TaskReviewCard.tsx`, `TaskCheckLink.tsx`) and kickoff guide (`KickoffCallGuide.tsx`). Built. Match their behaviour on mobile.

## server-reference/

Server code for the built endpoints: live transcription session minting, voice interviews, coverage checks, link voice, the mobile participant routes and mobile auth. Built. The dev server mirrors their request and response shapes; the real server stays the source of truth.

## shared-reference/

Kickoff guide topics, team question templates and work granularity (unit of work, how often, how long). Built.
