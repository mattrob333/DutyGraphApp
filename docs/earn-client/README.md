# Earn phone client

Draft phone screens for the Earn contract. The web handover is [DutyGraphV2 Earn client progress](https://github.com/mattrob333/DutyGraphV2/blob/codex/earn-client/docs/earn-client/PROGRESS.md).

Me opens From your AI, Gaps and, when enabled, the Scoreboard and Earn rules. Drafts show complete hands-on steps and local tick boxes. Missing slot details stay local until the person confirms with the optional card body. There is no invented PATCH route.

The pinned `contracts/earn-mobile.openapi.json` comes from Agent A749f3318 and generates `mobile/src/api/generated/earn-mobile.ts` with `mobile/scripts/generate-earn-types.mjs`. Existing participant v1 and meeting contracts stay unchanged. Earn uses the same participant HTTP client, refresh single-flight and logout generation as the existing app.

## Fictional development server

Run the existing phone development server without an upstream origin. It mounts authenticated Earn fixture routes. Run Expo in development with `EXPO_PUBLIC_DATA_SOURCE=http` and `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4510` (match the local server port). No new Earn seeds are bundled with the phone app. Existing legacy mock mode shows Earn as unavailable and makes no Earn network calls. Release builds refuse a backend advertising development fixtures; this is checked separately from the development browser flow.

The optional local `/earn/capabilities` discovery advertises development-only draft creation. It is not a production contract route. Standalone spoken/typed draft creation is enabled only in development for authenticated loopback fixture connections. Agent A's real mobile contract does not yet define POST/drafts, so that action stays unavailable there. Normal reads, confirmation, Not mine and fixes use the real contract.

Voice reuses the existing native recognizer without a provider grant or new speech provider. It starts only after a tap and stops on typing, navigation, background and unmount. Words must be reviewed; unknown details remain Not stated. Device speech/clipboard and hosted backend acceptance have not been run.

Verification details and actual browser status are in [BROWSER.md](BROWSER.md) and the dated section of the repository PROGRESS.md.
