# DutyGraph Companion (mobile app)

The participant app for DutyGraph: the phone version of the emailed "answer the questions" link, grown into the Companion described in the PRD. It lets a participant see what DutyGraph needs today, run a short voice or text Pulse instead of a status meeting, check "Here's what we understood" before anything counts, see meeting outcomes (avoided, shortened, required) with a pre-meeting brief, track commitments, and report when something changed.

- Product and architecture: [../docs/companion-app.md](../docs/companion-app.md)
- Server contract: [../docs/companion-mobile-api.md](../docs/companion-mobile-api.md) (`/api/mobile/v1`, v1.2 on branch `matt/companion-hands-free`)
- Hands-free question cards spec: [../docs/specs/COMPANION-HANDS-FREE.md](../docs/specs/COMPANION-HANDS-FREE.md)
- Design source of truth: [../docs/design/companion-mobile](../docs/design/companion-mobile/README.md)
- Rules for coding agents: [AGENTS.md](AGENTS.md)

Stack: Expo SDK 57 · React Native 0.86 · Expo Router (typed routes) · TypeScript · TanStack Query · Zustand · expo-secure-store · expo-audio · expo-notifications. This folder is its own npm project; it is not part of the web app's build or Vercel deploy.

## Run it in two minutes (demo data)

Prerequisites: Node.js 22 or 24 and npm. For a phone: the Expo Go app, or an iOS Simulator / Android emulator.

```sh
cd mobile
npm ci
npm start          # scan the QR code with Expo Go, or press i / a for a simulator
npm run web        # or open it in a desktop browser (use the device toolbar at ~390 px wide)
```

The app starts on **demo data** from the Claude Design prototype. Nothing is sent anywhere and no audio is recorded.

### Question cards (the default scope)

`EXPO_PUBLIC_COMPANION_SCOPE` picks what the app shows (see [docs/ENVIRONMENT.md](../docs/ENVIRONMENT.md)). The default, `questions`, mirrors the web team page: the tabs are Today and Me, and Today lists the advisor's question requests (and task checks). The fictional participant is Noah Reed at Cobalt, answering Alex Rivera's questions.

1. **Today → Questions about your work → Start**: the intro lists the 6 questions. **Start with voice** shows the microphone explanation once; **Type instead** opens the cards in typing.
2. **The cards**: read the card and talk. In demo mode the "microphone" plays the prototype's sample answers. Chips turn sage as they are heard; the card says Got it, holds briefly with **Keep talking**, and the next one slides in. Pause, Skip and Type instead are in the bar; swipe right or tap **Previous** to look back and **Add more**.
3. **Here's what we heard**: every answer is editable, with **Show what I said**. **Send to Alex** sends it; **Finish later** keeps it on the phone.

To see a state directly in a browser (`npm run web`, about 390 px wide): open `/questions/req-hf-cobalt` for the intro, `/questions/req-hf-cobalt/deck?mode=voice` (or `?mode=text`) for the cards, and use **Me → Developer** for offline, microphone blocked and a failing send. Reduced motion follows the system setting. The bell opens Notifications, which lists question items only in this scope.

```sh
EXPO_PUBLIC_COMPANION_SCOPE=questions npm run web   # the default
EXPO_PUBLIC_COMPANION_SCOPE=full npm run web        # PR #48's app
```

Set `EXPO_PUBLIC_COMPANION_SCOPE=full` for PR #48's app (Dana Okafor at a fictional logistics company), described below.

### A walkthrough (`full` scope)

1. **Today**: the Monday Operations Pulse, a confirmation from Friday's review, and a clarification.
2. **Start Pulse → Start with voice**: read the microphone disclosure, then answer. In demo mode the "microphone" types a sample answer as a live transcript; tap **Done answering**. Tap **Type instead** at any point. Answer with one or two words and DutyGraph asks you to say more (a dynamic follow-up).
3. **Here's what we understood**: mark items **Looks right** or **Change wording**, then **Submit Pulse**.
4. **See team status**: colleagues finish one by one. When everyone is in, a toast says you no longer need to join the 11:00 meeting, and Today shows the time returned.
5. **Meetings → Project review**: shortened to 15 minutes → **Read the brief** → **I'm ready** (joins the call) → live companion → **Wrap up** → confirm the outcome. The new commitment appears in **Work**.
6. **Me → Something changed in my work**: report a change; it becomes a *proposed* update, not a fact.
7. **Me → Developer** (demo only): simulate offline, microphone blocked, a stuck or failing send, an overdue Pulse, an incomplete team or a provider error, replay onboarding, or reset the demo.

## Connect to a DutyGraph server

The app can talk to the real participant API (the same one the web answer link uses).

1. Run the web app locally from the repository root (`npm run setup && npm run dev`, see the root [README](../README.md)); it serves `http://localhost:4317`.
2. Create `mobile/.env.local` (see [.env.example](.env.example)):

   ```sh
   EXPO_PUBLIC_DATA_SOURCE=http
   EXPO_PUBLIC_API_BASE_URL=http://localhost:4317   # a phone needs your computer's LAN address
   ```

3. `npm start`, then open an invitation. As an advisor, send team questions to a fictional participant and use the Companion QR code or link (`/mobile/enroll?t=…`). In a development build, the link opens the app's `/invite` screen; in Expo Go, paste the path into the dev menu's "Open URL" or open `exp://<host>:8081/--/mobile/enroll?t=<token>`.

What works against the server today: enrollment, profile, discovery questions from the advisor (voice or text), "Here's what we understood" from the server's understanding step (or sending your own words when AI is unavailable), submit, and task-card checks. Pulses, meetings, commitments, clarifications and Something Changed need server endpoints that are not built yet; those tabs show empty states and detail screens say "not available on your account yet". The full table is in [docs/companion-app.md](../docs/companion-app.md#what-works-against-the-real-server-today).

Only `EXPO_PUBLIC_*` variables reach the app, and anything in the app bundle is readable: never put secrets in them. No provider keys live in the app; transcription and understanding run on the server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` / `npm run ios` / `npm run android` / `npm run web` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (jest-expo): state machine, repositories, HTTP adapter, screens |
| `npm run verify` | Typecheck and tests |
| `npm run export:web` | Static web build into `dist/` (demo data) |
| `node scripts/screenshot-web.mjs [--light] [--out dir] /today /work …` | Screenshots of the web build at 390×844 for design review (needs Playwright) |
| `npm run contract:types` | Regenerate `src/api/generated/` from `../contracts/companion-mobile.openapi.json` (CI fails if it is stale) |
| `npm run doctor` | `expo-doctor` dependency check |

CI: [.github/workflows/companion-mobile.yml](../.github/workflows/companion-mobile.yml) runs on changes under `mobile/` or to the contract: contract types, typecheck, tests and a web export.

## Project layout

```text
src/app/          Routes (Expo Router). (tabs)/ = Today, Work, Meetings, Me; (auth)/ = onboarding
src/features/     conversation/ (state machine, conversation/review/done screens, pending-submission sync,
                  start flow, routes), voice/, notifications/, auth/, profile/, today/, pulse/,
                  meetings/, commitments/
src/components/   common/ primitives, navigation/, voice/, review/, requests/, pulse/, meetings/, work/, me/
src/api/          repository.ts (interface), mock/ (demo data + scripted engine), http/ (server adapter),
                  generated/ (contract types), config.ts
src/hooks/        TanStack Query hooks for every screen
src/state/        Zustand: preferences, session, ui, simulation
src/storage/      Secure storage: tokens, pending submissions, drafts
src/theme/        Design tokens (dark/light) and ThemeProvider
```

Adding a feature: add the operation to `src/api/repository.ts`, implement it in both `src/api/mock` and `src/api/http` (reject with `NOT_AVAILABLE` until the server has it), add a hook in `src/hooks/queries.ts`, then build the screen from `src/components/common` and theme tokens.

## Build for devices (EAS)

The app uses native modules (audio recording, secure storage, notifications), so beyond Expo Go you use a development build. EAS builds in the cloud; no Xcode or Android Studio is needed.

```sh
npx eas-cli@latest login
npx eas-cli@latest init                                         # once: links the project, writes extra.eas.projectId
npx eas-cli@latest build --profile development --platform ios   # dev client, demo data
npx eas-cli@latest build --profile preview --platform android   # internal demo build (demo data)
npx eas-cli@latest build --profile production --platform all    # real server: https://dutygraph.com
```

Profiles are in [eas.json](eas.json). `staging` needs `EXPO_PUBLIC_API_BASE_URL` set to an origin phones can reach (the `develop` Vercel preview sits behind Vercel login). Push tokens are only issued once `extra.eas.projectId` exists.

Identifiers: iOS bundle and Android package `com.dutygraph.companion`. App Links / Universal Links cover only `https://respond.dutygraph.com/mobile/enroll` and `https://dutygraph.com/mobile/enroll` (decision D16). Android verification needs `respond.dutygraph.com` to serve `/.well-known/assetlinks.json` without a redirect, and the release certificate's SHA-256 fingerprint added to `client/public/.well-known/assetlinks.json` (see [HOSTING](../docs/HOSTING.md)). iOS Universal Links additionally need an `apple-app-site-association` file on those hosts; it is not in this repository yet.

## Privacy and behavior guarantees

- The microphone opens only after the participant chooses voice, shows a visible "Listening…" state, and stops on pause, leaving the screen or backgrounding the app. There is no background listening.
- Copy never promises that nothing leaves the device: answers may be processed on the server while the participant speaks; nothing is their confirmed answer until they review and send it.
- Completion is shown only after the server acknowledges. Reviewed answers are saved in secure storage with their idempotency key before sending and retried until acknowledged; a retry cannot create a duplicate.
- Tokens are stored only in the iOS Keychain / Android Keystore. Analytics events carry ids and counts, never words.
- Team status shows completion only, never other people's answers. No rankings, streaks or scores.

## Known limitations

- Not yet run on physical devices: real microphone recording and upload, live speech recognition for the question cards (`expo-speech-recognition`), push delivery and notification taps, App Link verification, VoiceOver/TalkBack, Dynamic Type on the cards. Everything was verified on the web build and in Jest.
- The question cards' coverage check and "Here's what we heard" have not been run against a real AI provider; without one the local check and the person's own words stand.
- Against the real server there is no live transcript while speaking (the server's streaming endpoint returns 501): the recorded answer is transcribed after "Done answering" and shown for editing before it is sent.
- No dynamic follow-ups against the real server yet: it has no facilitator endpoint. The prompt pack for it exists in `server/companion/`.
- The push token is captured but not registered: `PUT /me/push-token` is not in contract 1.1.
- Jest sometimes prints "a worker process has failed to exit gracefully" at the end of a full run; all suites pass.
