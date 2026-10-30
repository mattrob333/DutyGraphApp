# EAS signing and invitation link readiness

**Status:** Draft checklist for `codex/live-backend`. No app-store submission, production app version, native signing certificate or iOS Universal Link acceptance is claimed.

## Build choices
- `mock` is the safe development/default profile; `dev-server` uses the local fake-provider server; `dutygraph-local` and `dutygraph-preview` require a fully ported server before advisor flows work.
- Use `EXPO_PUBLIC_DATA_SOURCE=dutygraph-production` and `EXPO_PUBLIC_API_BASE_URL=https://dutygraph.com` **only after** the real advisor meeting API has been verified and deployed. The repository's existing EAS production profile is intentionally not changed by this draft.
- All `EXPO_PUBLIC_*` values are readable inside the app. Never put API keys, bearer tokens, Apple credentials, Google keys or signing secrets into them.
- EAS project access, Apple distribution certificates/profiles and Android app signing keystore must be provisioned through Expo/Apple/Google credential managers by an authorized human. Do not commit them.
- Use the normal `eas build --platform ios --profile production` and `eas build --platform android --profile production` flows only after reviewing the environment and credentials. Verify that production Android uses an actual release signing key, not the debug key used by the internal APK workflow.

## HTTPS invitations
The app already declares `applinks:dutygraph.com` and an Android `https://dutygraph.com/mobile/enroll` intent filter. In a production backend build, invitation URL creation now chooses `https://dutygraph.com/mobile/enroll?t=...`. Mock/dev builds retain their original invitation URL and the custom `dutygraph-companion://` demo scheme.

**Server action still required:** host the correct `/.well-known/apple-app-site-association` response on `dutygraph.com`, without redirect, with the app's real Apple Team ID and `com.dutygraph.companion` identifier and the `/mobile/enroll` path. Validate Android's `/.well-known/assetlinks.json` against the final release-signing certificate. Never publish sample team IDs, fingerprints or placeholder keys as if they were real.

## Device acceptance before release
1. Build and install signed iOS and Android release candidates. Open an invitation from email and QR. Verify correct app routing and no token in analytics or logs; test expired and used tokens.
2. On iOS, verify the Associated Domains entitlement and the live AASA response on device; check the link opens the installed app rather than Safari. Confirm that custom-scheme demo links still work only as intended.
3. Verify microphone permissions, interrupted meeting recording, legacy recovery, and that the native evidence directory and its files are excluded from iCloud backup.
4. Run Jest, typecheck, lint, web export, HTTP regression tests and the real-PostgreSQL integration runner against a non-production environment. Record observed outcomes in `docs/DEVICE-QA.md`.

Until these pass, `docs/REDTEAM.md` iOS links and signing findings remain open.
