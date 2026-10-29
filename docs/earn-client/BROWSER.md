# Earn phone browser verification

## Scope

The browser journey uses the actual Expo web screens and existing participant enrollment/session adapter against a fresh, local development server with fake providers. It is not a native-device, hosted-backend, live-payment or external-AI acceptance run. Production builds must refuse the new Earn development fixtures; existing participant v1 enrollment remains separate.

The runner owns only a fake API process that it starts itself. Managed mode first refuses an occupied API port and never kills another process. It restarts that fresh in-memory service between widths because the enrollment invitation is one-use. Expo web must be started separately with the matching HTTP data source and API origin.

## Commands

Development web (after the parent confirms the code and dependencies are coherent):

```sh
EXPO_PUBLIC_DATA_SOURCE=http EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4510 npm --prefix mobile run web -- --port 4512
EARN_MANAGE_API=1 EARN_WEB_BASE=http://127.0.0.1:4512 EARN_API_URL=http://127.0.0.1:4510 node mobile/scripts/e2e-earn.mjs
```

Production guard after exporting/serving the HTTP bundle at4513:

```sh
EARN_MANAGE_API=1 EARN_PRODUCTION_ONLY=1 EARN_PRODUCTION_BASE=http://127.0.0.1:4513 EARN_API_URL=http://127.0.0.1:4510 node mobile/scripts/e2e-earn.mjs
```

`PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` are optional local tool overrides; the default imports the project's Playwright package. `EARN_WIDTHS=360,1280` selects the two widths. Without managed mode, only one width is run by default and the caller must supply a fresh fake server. No token values, session payloads or credential-bearing links are logged or captured in screenshots.

## Checks and result ledger

The actual development fake-HTTP journey passed at **360px and1280px**, using a fresh owned API process for each width. No page exceptions, React render warnings, document horizontal overflow or microphone calls occurred. It exercised real enrollment/tokenStore, Me/Scoreboard, manual detail/ticks, versioned confirmations including a local missing-slot edit, Copy success/refusal, stubbed Share, typed voice app-draft creation still waiting, explicit Not mine, typed gap fix, and the explicitly intercepted outage/off cases below. The actual production HTTP export also passed its360px guard check: existing enrollment worked, but the new Earn UI refused development capability data before requesting draft/summary seeds. A scan of exported JavaScript found no matches for the new seed strings Restock the service van, Shelf B3 or Top drawer of the red cabinet. `node --check mobile/scripts/e2e-earn.mjs` passed.

| Flow | Boundary to verify |
| --- | --- |
| Existing enrollment→Me | Actual participant session/tokenStore, no synthetic login injection |
| Scoreboard | Paid/waiting amounts with company pay rules; checked time; team counts in name order without card contents |
| From your AI | Manual steps, places, tools/materials/safety and local checkboxes; server-acknowledged versioned Confirm |
| Missing slot | Local Add detail is sent in the explicit Confirm body with current expectedVersion |
| Prompts | Copy success/refusal and stubbed browser Share; no external message or native share-sheet claim |
| Say a task | Browser speech interfaces deliberately unavailable; Type instead remains usable, reviewed words create an app draft that is still waiting |
| Not mine | Explicit versioned acknowledgement after opening the newly saved draft |
| Gaps | Voice-unavailable typed fallback; fix request and acknowledged Sent state |
| Error/off cases | Explicitly intercepted HTTP503 and summary enabled=false, clearly distinguished from real server decisions |
| Production guard | Actual release bundle refuses fake Earn capabilities before requesting drafts or summary seed data; legacy enrollment still works |

The browser test deliberately stubs Clipboard, Share and unsupported browser speech capability. It never opens a microphone. These stubs exercise UI states and preserve the privacy boundary; they do not establish native capability.

## Runtime corrections found before the final run

| Finding | Evidence and current status |
| --- | --- |
| Inherited SVG native accessibility props reached web DOM | React DEV warnings created an Expo error toast over Connect. Parent made BrandSymbol props platform-specific. Later enrollment passed without these warnings. |
| Explicit space directly under FixRows Card/View | React Native Web rejected the raw text child. Parent removed it and the UI owner ran a before/after host-View regression. Later Scoreboard passed. |
| Step checkbox lacked web checked semantics | The tick changed visually but aria-checked was absent because installed RN-web does not map accessibilityState.checked. Parent added explicit aria-checked; the later browser semantic assertion passed. |
| Empty-string error conditionals directly under the gap form Card | Opening the form emitted two raw-text warnings from inputError/command.error empty strings. Parent Boolean-coerced the string guards; the final gap form/fix submission passed without raw-text warnings. |

The Copy-negative browser stub was corrected to throw from both modern clipboard and legacy execCommand paths. Expo Clipboard57's fallback ignores execCommand(false); throwing makes its documented boolean result false so the actual app fallback message is exercised. This is harness setup, not a claim that the app's Copy handler failed. Share remains a local stub, and browser speech interfaces are deliberately unavailable.

## Final evidence

- Development fake-HTTP journey: both360px and1280px passed against fresh owned in-memory servers.18 screenshots plus journey-results.json are in screens/.
- Production HTTP web export: completed successfully. The static export at the owned local4513 server passed real enrollment followed by explicit new-Earn development-fixture refusal at360px. The browser observed zero draft/summary seed requests after the capability refusal. production-results.json and production-fixture-refused-360.png record this separate check.
- Exported JavaScript scan: zero matches for the three specific new Earn seed strings named above. This does not claim removal of pre-existing participant demo data elsewhere in the app.
- Node syntax and owned-file whitespace checks passed. The parent separately owns typecheck, unit/full suites, audit, red-team conclusions and the commits.

The deliberate HTTP503/error and enabled=false/off response interceptions are browser-controlled tests, not claims that a real company changed settings. Clipboard success/failure, Share and browser speech availability are also explicitly stubbed. Native recording, device privacy, OS share sheets, hosted backend/provider acceptance and live money were not run.

An early production-export attempt was intentionally stopped before completion to leave CPU free for the parent's unchanged timed-test rerun. The final export above completed after that pause; the interrupted attempt is not counted as passed.

## Post-review repeat

After the five phone reviews and their source corrections, the complete development journey was run again against fresh managed fake HTTP servers at both 360px and 1280px. Both passed with zero page exceptions, React render warnings, document horizontal overflow or microphone calls. Enrollment populated the actual participant session, including the new client session identity, and writes used the actual pending-command helper without authentication or storage stubs. This browser result does not verify native SecureStore encryption or OS backup behavior; those remain outside browser coverage.

The first repeat stopped on the runner's stale exact Scoreboard accessible name. Rows now expose their description as part of the accessible name. The runner now uses narrow title prefixes for these rows and draft/gap entries; no product change or runtime error was involved. The subsequent full runs passed. Existing missing-slot Add, local detail and explicit Confirm still passed after the slot UI corrections.

A fresh production HTTP export then completed successfully. Its actual static release bundle again enrolled through the legacy flow and refused new Earn development fixtures before any draft or summary seed requests. The exported JavaScript scan again found zero matches for the three named Earn seed strings. All 19 screenshots and both results JSON files were refreshed from these post-review runs. Node syntax and owned-file whitespace checks passed. No real phone, native microphone or live provider was tested.

## Final cross-enrollment fence repeat

After the additional R2-03 capability-read/write generation fence correction, the complete actual-enrollment development journey passed again at 360px and 1280px. The runner required no changes. Both runs used the real participant tokenStore and pending-command helper, with no authentication or storage stubs, and reported zero exceptions, React render warnings, horizontal overflow or microphone calls. This full-journey repeat confirms normal writes still work; the parent's focused regression covers the cross-enrollment interleaving itself.

The release HTTP export completed again, and its actual static bundle passed legacy enrollment followed by Earn fixture refusal before any draft or summary seed request. The same three-string exported-JavaScript scan again found zero matches. Screenshots and both results JSON files were refreshed. Syntax and owned-file whitespace checks passed. Only owned Expo/static process groups were stopped afterward; local ports 4510, 4512 and 4513 were verified clear. Native device behavior and live providers remain not run.
