# Companion mobile design reference

The approved Claude Design prototype for the DutyGraph Companion app. It is the visual source of truth for [`mobile/`](../../../mobile/); the implementation's theme tokens (`mobile/src/theme/tokens.ts`) are taken from its `#app` custom properties. All content is fictional.

| File | What it is |
| --- | --- |
| `DutyGraph_Companion_2.dc.html` | The interactive prototype (markup, copy, and the scripted state logic at the bottom). |
| `support.js` | The prototype's generated runtime (`dc-runtime`). Do not edit. |
| `screens/*.png` | Screenshots of each prototype state at 390×844, taken with Playwright. Files ending `-b` are the same screen scrolled to the bottom. |

## Viewing the prototype

The runtime loads React 18 and Babel from unpkg, and the fonts and logo from an `assets/` folder that was not part of the export (the page falls back to Arial and hides the logo). Serve the folder over HTTP and open it in a desktop browser:

```sh
cd docs/design/companion-mobile
python3 -m http.server 8123   # then open http://localhost:8123/DutyGraph_Companion_2.dc.html
```

The left panel jumps between states (Today, Pulse, Voice, Follow-up, Understood, meetings, work, clarification…) and simulates conditions (offline, microphone blocked, send failure, overdue Pulse, incomplete team, light theme).

## Deliberate differences in the app

- **Privacy copy.** The prototype's consent screen says nothing is submitted before review but implies no processing before Send. The app follows PRD §13: answers may be processed on the server while the participant speaks; nothing is recorded as their confirmed answer until they review and send it.
- **"Simulated in this mockup"** notes are replaced by a small "Demo data" note shown only when the app runs on mock data.
- **Prototype controls** (the left panel) become the Developer section of the Me tab, shown only with mock data.
