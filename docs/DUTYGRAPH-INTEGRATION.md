# Actual DutyGraph backend integration

The opt-in `dutygraph-local`, `dutygraph-preview` and `dutygraph-production` profiles use one origin for participant and advisor APIs. `mock` stays the default. The legacy `http` profile and `test:e2e:http` still exercise the development server. Selecting a profile does not deploy endpoints or publish an app.

## Served contracts

Start the selected DutyGraphV2 application, then run from `mobile/`:

```sh
DUTYGRAPH_API_URL=http://127.0.0.1:4317 npm run contract:dutygraph
```

The generator fetches `/api/mobile/meetings/v1/openapi.json` and `/api/mobile/v1x/openapi.json`, checks their route scope and local references, and runs pinned `openapi-typescript@7.13.0`. It writes separately named contract snapshots, generated TypeScript and `contracts/dutygraph-served-contracts.json` with source paths and SHA-256 hashes. It fetches and compiles both contracts before replacing artifacts. Participant v1 remains pinned at 1.3.0 and its existing generated file stays separate. Runtime adapters consume the generated meeting/auth/Pulse/config shapes; fields the server declares unknown are narrowed before entering app DTOs.

## PostgreSQL browser suite

Prerequisites: Node 24, installed root/mobile/V2 dependencies, Chromium, a migrated local PostgreSQL database and the actual V2 checkout. Use an isolated development database. The fixture script refuses non-local database hosts. Credentials belong in the existing private V2 `.env` or a private file selected with `DUTYGRAPH_ENV_FILE`; never copy values into this repository.

```sh
cd /workspace/DutyGraphApp/mobile
DUTYGRAPH_BACKEND_ROOT=/workspace/DutyGraphV2-mobile npm run test:e2e:dutygraph
# Optional subset:
DUTYGRAPH_BACKEND_ROOT=/workspace/DutyGraphV2-mobile npm run test:e2e:dutygraph participant advisor
```

The runner refuses an occupied port (4317 by default; `E2E_API_PORT` can select another), starts the real V2 `createApp` against PostgreSQL and injects fake providers into that process. It does not start `dev-server`. It serves the exported SPA and unchanged V2 API on one localhost origin, preserving the server's browser-origin checks. Provider credentials are removed from the test server's environment. No provider availability, audible output or device capability is established by a fake adapter.

Each flow creates a fresh fictional tenant using V2 domain writers, invitation issuance and web-session creation. Pairing codes come from the actual authenticated company pairing endpoint with cookie, CSRF and idempotency key. Ephemeral invitation/session credentials live only in mode-0600 manifests inside a private `/tmp` directory; the runner removes them on exit. Fixtures append synthetic data to the selected local database; they do not reset or delete other data. Reset that isolated database using its existing workflow when desired.

The suite regenerates wire types from its running server and exports a full-scope `dutygraph-local` bundle. Every observed meeting/extra request and response is checked against the served schema; hashes must match the generated artifacts. Twelve paths cover participant review/send, offline retry, Task Cards, Hybrid, Pulse, advisor capture, Facilitator, declined consent, corrected sources, private wrap-up, kickoff and setup. A nonzero child status makes the suite fail. Current-run results go to ignored `mobile/test-results/dutygraph-v2-e2e-*.json`; passed, failed and unrun flows remain distinct.

The manual [Actual DutyGraph mobile integration workflow](../.github/workflows/dutygraph-integration.yml) checks out an explicit V2 ref, migrates a fresh PostgreSQL16 service and runs this suite. Its default GitHub repository token may not read a private sibling repository; it reuses `DUTYGRAPH_BACKEND_READ_TOKEN` if that existing read-only binding is configured. Cross-repository authorization and a successful hosted run have not been verified here. It uploads only the current-run JSON report, never private fixture manifests or database configuration.

## Review and release boundaries

Real-profile meeting edits, route choices, proposal decisions and closing confirmations bind the version/hash the person reviewed. Kickoff note acknowledgments retain the server revision for the next edit. Legacy development payloads retain their original shape.

Advisor logout clears local access before remote revocation completes. A late refresh or in-flight response cannot restore old tokens or clear a later login. Audio caches accept only the selected origin and exact protected audio paths, using declared WAV/MPEG formats for extensionless URLs.

Batch finish uses a 210-second transport budget for the server's bounded 180-second provider operation. A lost response, timeout or `COMMAND_PENDING` retains the same durable command key across restart. Only an authoritative `COMMAND_FAILED` retires that attempt's key; the app asks for another explicit tap before creating a new attempt. Simulated server silence is skipped, displays a notice and uses device speech or the visible text fallback.

iOS fallback recordings use Cache for temporary audio and the native backup-excluded Application Support directory for retained evidence; legacy Documents clips migrate before deletion. The native behavior still needs compilation and device/iCloud evidence. Signing, AASA/App Links, provider acceptance, deployment and EAS release remain separate checks in [DEVICE-QA.md](DEVICE-QA.md) and [EAS-RELEASE.md](EAS-RELEASE.md).

Meeting budget labels describe estimated dispatch limits and estimated reserved use, including failed requests; actual provider cost may differ. Facilitator defaults use the server's $15 estimate for both TTS and realtime, with $2 for other meeting modes. These are enforcement estimates, not billing evidence.

## Dependency audit

The 2026-10-28 local audit identified high findings in `node-forge` and `source-map-js`; compatible lock updates move them to 1.4.2 and 1.2.2. Audit high findings fell from eight to three. The remaining advisory is GHSA-mrhx-c7xc-m3w5 on Expo CLI's nested Zod 3.25.76, propagated to CLI/Expo. The latest SDK 57 CLI still declares Zod 3.25.76; forcing a Zod 4 override would break its declared major-version contract. The app's direct Zod stays 4.6.7. This toolchain advisory remains open for an upstream-compatible fix; it is not presented as a clean audit.
