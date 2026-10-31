# DutyGraph Mobile

Expo SDK 57 app and a standalone development API for participant information gathering and advisor Meeting OS. Includes spoken/typed question decks, Task Card review, Pulse, POWER/Gate planning, consent, capture, Facilitator controls, source-linked proposals, speaker mapping, kickoff and setup. [PROGRESS.md](PROGRESS.md) records verification and remaining device/provider checks.

The October 28 day-run adds a structured closing review and explicit server-acknowledged completion. Deferred outcomes can seed a linked follow-up meeting. Queued finish jobs keep the original retry key while the app checks server progress; stopping local checks does not stop the server job. The meeting gate can show an optional AI suggestion beside its rules result; the company setting stays off by default. See the dated entry in [PROGRESS.md](PROGRESS.md) for checks on this change; earlier suite counts below are historical.

Task Card proposal review now includes the linked source and saved draft, attendee/card/owner adjustments, and an explicit way to reject stale proposals while preserving their existing draft. Current checks and limits are in [PROGRESS.md](PROGRESS.md).

## Build status

The app supports mock/development workflows and opt-in actual DutyGraphV2 integration. Current local checks pass **538 mobile tests**, **78 shared tests**, **64 development API tests**, typechecks/lint, web export and **all twelve PostgreSQL browser paths against the actual V2 application** (219 schema-validated exchanges). Handsfree/meeting line coverage is **94.37%**. Native prebuild/autolinking evidence is from the prior run; native compilation and physical-device QA remain outstanding. The continuation used injected providers; no deployment or app-store release occurred. See [PROGRESS.md](PROGRESS.md) for current versus historical provider evidence.

One client app (2026-10-29, branch `claude/voice-client-app`): voice interviews, Earn, Connect your AI (MCP connector steps) and company Files in the phone app. See DEVLOG.md.

Upload (2026-10-30): take a photo, scan several pages to one PDF, or choose a file, and send it to the advisor's review. Needs a device test. See DEVLOG.md.

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

Earn phone B2 adds a generated contract adapter and a separate fictional development server; [details](docs/earn-client/README.md). Review/verification is in progress; not released or device-tested.

Earn phone core screens and typed voice fallback now pass527 mobile tests and360/1280px local development browser journeys. Production export and independent phone review are in progress; [verification](docs/earn-client/BROWSER.md).

## 2026-10-28 — Earn phone B2.2: browser and release boundary

Development fake-HTTP journeys passed at360/1280; production HTTP export and actual static-release fixture refusal passed before any Earn seed request. Nineteen screenshots and two result files are linked in docs/earn-client/BROWSER.md. Exported JavaScript contained none of the three checked Earn seed strings. No physical phone, native microphone or hosted backend was tested. Five fresh-context reviews follow at this committed freeze.

## 2026-10-28 — Earn phone B2.3: five reviews and corrections

Pushed review freeze79c890dabcdf5587b9c31b86266994c11e4a3ef7. Five fresh-context reviewers completed independently. No confirmed High; all five confirmed Medium and the reported Low findings are corrected: durable scoped retries, atomic local confirmation/receipt, quoted-secret removal, accessible row summaries, reopenable slot corrections, precise rejection copy and fail-closed hints. See docs/REDTEAM.md for evidence and the independent persistence correction review. Local enrollment identity is explicit client metadata retained on refresh; current server contract has no sessionId and was not changed. Web storage is memory-only; native secure storage/device behavior remains unverified. Existing root decisions log now contains browser choices; the accidentally named duplicate DECISIONS.md is removed. Final full checks and post-correction browser/export follow.

Post-review verification: whole mobile **552/552** (65 suites,36.997s), dev-server **76/76**, shared **78/78**; mobile/dev/shared TypeScript and whole lint passed. An integrated typecheck first caught new test-only Jest imports/literal/tuple types; those were corrected, final TypeScript exit0, and affected four suites28/28 passed. No product type bypass, skipped test or timeout increase. Mobile high-threshold audit rerun exits1 with20 findings (14low,3moderate,3high) in the documented SDK tool chain; root/dev audits0. Review freeze CI40824655411 passed including legacy browser/HTTP/coverage checks. Corrected-head CI and post-correction browser/export follow.

Earn B2 final local checks:552 mobile/76 dev-server/78 shared tests plus TypeScript/lint passed; post-review360/1280 browser and release fixture guard passed. Both red teams and contract/audit/device limitations are in [PROGRESS.md](PROGRESS.md), [REDTEAM.md](docs/REDTEAM.md) and the linked cross-repository handover. Both PRs remain draft, unmerged.

## 2026-10-28 — Earn phone B2.5: final enrollment boundary

A final independent transport probe reproduced R2-03: capability discovery and the following POST each captured a different session generation, allowing old reviewed words to be posted after replacement enrollment. Generation now spans the whole repository operation, the outer spoken-draft capability check and synchronous pending callback dispatch. The actual ApiClient regression failed before and21 focused tests passed after; full mobile553/553, TypeScript and whole lint passed. Dev-server76/shared78 remain unchanged and passing. This sixth confirmed Medium is fixed; original review reports and exact counterexample are in docs/REDTEAM.md. Final repeated browser/export and corrected-head CI follow. Audit/device/backend limitations remain unchanged.

## 2026-10-28 — Earn phone final close

Final corrected code `f01d76a1e355df41af990cab9e7e2619ddfaa436`:553/553 mobile tests (65 suites), TypeScript/lint passed. Unchanged development-server76/shared78 checks remain passing. After R2-03, actual-enrollment fake-HTTP360/1280 journeys passed again with no page/render errors, overflow or microphone calls. Fresh release export/static fixture refusal passed before seed reads; normal legacy enrollment still worked. Evidence refreshed in docs/earn-client/BROWSER.md. Browser normal flow checks compatibility; the focused actual-transport regression verifies the hostile enrollment interleaving. Only owned QA servers were stopped and ports4510/4512/4513 verified clear.

Six confirmed Medium findings and all reported Lows are corrected, no confirmed High. Audit remains failed on the documented Expo toolchain path; no native/device/provider/payment acceptance was run. Final shared handover and both draft PR links above are authoritative; neither PR is merged.
The `codex/live-backend` draft branch now integrates with the separately implemented V2 mobile backend in local PostgreSQL tests. Hosted deployment and physical-device acceptance remain separate.

- **Backend profiles (draft PR):** `codex/live-backend` adds opt-in explicit mock/dev-server/local/preview/production origins. It does not deploy the new meeting API.

- **iOS recording privacy (draft PR):** meeting evidence now targets an iCloud-backup-excluded native directory; requires rebuilding the app and real-device QA before release.

- Draft iOS recording storage includes a source-review correction for legacy-path normalization; native and device verification is still pending.

- **HTTPS invitations (draft branch):** production-profile app links target dutygraph.com; real iOS Universal Link acceptance and release signing remain pending. See `docs/EAS-RELEASE.md`.

- CI follow-up corrections to test imports and the Expo File annotation are now covered by the passing local mobile suite. Hosted CI on the final commit remains a separate check.

The `codex/live-backend` continuation now includes actual DutyGraphV2 served-contract generation and a PostgreSQL browser runner: `npm --prefix mobile run test:e2e:dutygraph`. It starts the actual V2 app with injected test providers and fresh fictional tenants, and validates observed API traffic against the served contracts. See [DUTYGRAPH-INTEGRATION.md](docs/DUTYGRAPH-INTEGRATION.md) for prerequisites, private fixture handling and the separate mock/dev-server workflow. Current run evidence belongs in [PROGRESS.md](PROGRESS.md); no deployment, signing or device acceptance is implied.
