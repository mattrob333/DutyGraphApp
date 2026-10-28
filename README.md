# DutyGraph Mobile

Expo SDK 57 app and a standalone development API for participant information gathering and advisor Meeting OS. Includes spoken/typed question decks, Task Card review, Pulse, POWER/Gate planning, consent, capture, Facilitator controls, source-linked proposals, speaker mapping, kickoff and setup. [PROGRESS.md](PROGRESS.md) records verification and remaining device/provider checks.

## Build status

The standalone app implements participant and advisor workflows with mock data and the local development API. The latest local verification passes **626 tests** (488 mobile, 78 shared, 60 API), **12 HTTP end-to-end flows**, typechecks, lint and web export. Native prebuild and module autolinking pass; native compilation, physical-device QA and real-provider testing remain outstanding. This repository has not been deployed to the production DutyGraph backend or released to app stores.

## Repository map

| Path | Contents |
| --- | --- |
| [mobile/](mobile/) | Expo app, participant and advisor screens, native voice module and browser test scripts |
| [dev-server/](dev-server/) | Local API, deterministic fake providers, optional provider adapters and contract tests |
| [shared/](shared/) | Pure question-deck logic, meeting rules and shared contracts |
| [server/companion/](server/companion/) | Facilitator prompt pack |
| [tests/](tests/) | Shared logic and policy regression tests |
| [docs/](docs/) | Product requirements, build plan, API/integration guidance, QA and screenshots |
| [.github/workflows/](.github/workflows/) | Automated verification and manually triggered native builds |

For the implementation handoff, read [PROGRESS.md](PROGRESS.md), [DEVLOG.md](DEVLOG.md), [DECISIONS-LOG.md](DECISIONS-LOG.md), [device QA](docs/DEVICE-QA.md) and [production porting guidance](docs/PORTING-TO-DUTYGRAPH.md).

## Run the fictional demo

Requires Node 24 and npm. From the repository root:

```sh
npm ci
npm --prefix mobile ci
npm --prefix dev-server ci
cd mobile
EXPO_PUBLIC_DATA_SOURCE=mock EXPO_PUBLIC_COMPANION_SCOPE=full npm run web
```

Use the demo invitation on the welcome screen. Me contains appearance, voice and demo controls. “Run meetings for a company” opens advisor pairing; use `DEMO` in mock mode. All demo names and records are fictional.

## Run against the development API

Start the server in a separate terminal, with provider keys unset for deterministic fake providers:

```sh
cd dev-server
env -u OPENAI_API_KEY -u OPENAI_LIVE_TRANSCRIBE_API_KEY npm start
```

Then start the app:

```sh
cd mobile
EXPO_PUBLIC_DATA_SOURCE=http EXPO_PUBLIC_COMPANION_SCOPE=full \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4417 \
EXPO_PUBLIC_MEETINGS_API_BASE_URL=http://127.0.0.1:4417 npm run web -- --clear
```

Enroll through `/mobile/enroll?t=` followed by 64 lowercase `d` characters. The fictional invitation is single-use; restart the in-memory server for a fresh run. Create a short-lived advisor code on the server's computer with `curl -X POST http://127.0.0.1:4417/dev/pairing-code`, then enter it on the advisor pairing screen. `/health` reports the active provider modes. The development server defaults to loopback. For a fictional-data phone test on a trusted network, explicitly set `HOST=0.0.0.0` and configure both app origins to the computer's LAN address; create pairing codes from localhost. A secure development connection is preferable for sensitive data.

The EAS `staging` profile reads both public API origins from the EAS `preview` environment; configure origins reachable from the phone before building. The `preview` profile uses mock data.

Copy [mobile/.env.example](mobile/.env.example) to an ignored `.env.local` if desired. Public app configuration contains origins and feature scope only. Provider keys stay on the server. Setting `DUTYGRAPH_ORIGIN` proxies the pinned participant v1 API; proposed meeting endpoints remain local and are not deployed to DutyGraph. See [the porting guide](docs/PORTING-TO-DUTYGRAPH.md) for server configuration and production requirements.

## Verify

```sh
npm run verify
npm run test:coverage:shared
npm --prefix mobile run verify -- --runInBand
npm --prefix mobile run test:coverage:handsfree
npm --prefix dev-server run verify
npm --prefix dev-server run coverage:check
npm --prefix mobile run export:web
```

[Device and browser QA](docs/DEVICE-QA.md) contains reproducible E2E commands and the device checklist. Browser captures at 390×844 in both themes are in [docs/screens](docs/screens). [The build plan](docs/01-BUILD-PLAN.md), [decision log](DECISIONS-LOG.md) and [development log](DEVLOG.md) explain scope and implementation choices.

Native recording, permissions, Bluetooth, interruptions, accessibility and long-session reliability still require device evidence. Native PCM streaming is implemented as a local Expo module; optional audio-only WebRTC uses `EXPO_PUBLIC_FACILITATOR_REALTIME=true`. Both require a new development build and native validation. Device recognition, typing and TTS remain fallback paths. One scripted real-provider rehearsal has run (PROGRESS.md); no upstream deployment or app-store release has occurred. POWER is Carson Tate’s framework from *Work Simply*.


The HTTP browser suite starts a fresh credential-free fake server for each flow. After exporting an HTTP bundle with both origins set to `http://127.0.0.1:4417` and full scope, run `npm --prefix mobile run test:e2e:http`. It covers participant send/retry, Task Cards, Pulse, meetings, declined consent, source correction, wrap-up and setup.

The [native build workflow](.github/workflows/native-build.yml) builds an installable Android APK (JavaScript bundled, debug-signed for sideloading) and, when run by hand, an unsigned iOS simulator app. Add the `build-android` label to a pull request, or run the workflow by hand and choose mock or http data. Download the `dutygraph-android-apk` artifact from the run and open it on an Android phone. iPhone builds need an Apple Developer account and EAS.

Rehearse with real providers (paid, never in CI): start the dev server with `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL` set, then run `npx tsx scripts/real-provider-rehearsal.ts` in `dev-server/` (needs ffmpeg).

The `codex/live-backend` draft branch includes an early proposal-source warning; real DutyGraph meeting integration remains in development and requires server work and device checks.

- **Backend profiles (draft PR):** `codex/live-backend` adds opt-in explicit mock/dev-server/local/preview/production origins. It does not deploy the new meeting API.

- **iOS recording privacy (draft PR):** meeting evidence now targets an iCloud-backup-excluded native directory; requires rebuilding the app and real-device QA before release.
