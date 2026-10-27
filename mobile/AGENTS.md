# DutyGraph Companion (mobile) — agent instructions

The repository-wide rules in [../AGENTS.md](../AGENTS.md) apply here too (fictional data only, no secrets, README + DEVLOG updates in the same change set, branch from `develop`). App overview and how to run it: [README.md](README.md). Product spec summary and architecture: [../docs/companion-app.md](../docs/companion-app.md).

## DutyGraph rules for this app

- **Participant-only.** No advisor tools, company-wide graph admin, raw Jev scores, confidence percentages, evidence-state terms or broad directory browsing. Translate judgments into plain language on the server.
- **Proposals are not truth.** Nothing a participant says becomes canonical until they review and send it; Something Changed produces a *proposed* graph delta.
- **Server is authoritative.** Never show completion before the server acknowledges. Final submits and commitment completion carry an idempotency key; keep pending submissions in secure storage until acknowledged.
- **Privacy copy is accurate.** Answers may be processed on the server while the participant speaks (transcription, follow-ups). Never claim "nothing leaves the device before Send".
- **Microphone is user-initiated**, visibly indicated, stopped on pause/leave/background. "Type instead" is always available.
- **No shame mechanics.** Factual states only: Not started, In progress, Complete, Due, Overdue.
- **Design is the source of truth.** `../docs/design/companion-mobile/` holds the Claude Design prototype and per-screen screenshots. Use theme tokens (`src/theme`), never screen-specific colors.
- **Screens use the repository, never `fetch`.** Add operations to `src/api/repository.ts`, implement them in both `src/api/mock` and `src/api/http`. Server shapes come from `src/api/generated` (`npm run contract:types`), which is generated from `../contracts/companion-mobile.openapi.json` — never hand-edit it.

Checks before you finish: `npm run typecheck`, `npm test`, and for UI changes `npm run export:web && node scripts/screenshot-web.mjs <routes>` compared with the design screenshots.

---

## Expo notes

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
