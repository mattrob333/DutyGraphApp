# DutyGraph Mobile

Standalone Expo app and development API for DutyGraph information gathering and Meeting OS. The participant seed is being extended according to [the build plan](docs/01-BUILD-PLAN.md). See [PROGRESS.md](PROGRESS.md) for verified status and limitations.

Requires Node 24 and npm. Install root dependencies with `npm install`, then `cd mobile && npm ci`. Run `npm run web` in `mobile` for the fictional demo. Run root checks with `npm run test:shared && npm run typecheck:shared`; run mobile checks with `npm run verify`.

Public configuration: `EXPO_PUBLIC_DATA_SOURCE` (`mock` or `http`), `EXPO_PUBLIC_COMPANION_SCOPE` (`questions` or `full`), `EXPO_PUBLIC_API_BASE_URL`, and `EXPO_PUBLIC_MEETINGS_API_BASE_URL`. Provider credentials belong only on the development server. No app-store release or upstream deployment is part of this build.

POWER is Carson Tate’s framework from *Work Simply*. Proposed meeting and voice features in this repository are not claims about the production DutyGraph service.
