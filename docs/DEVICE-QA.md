# Device QA

Status: **not run on a device**. Use iPhone and Android development builds with fictional data and a fake server. Record device, OS, app build, date, result and evidence for each check; do not record answer text, tokens or audio. These checks cannot be established by a web build or simulated providers.

| Check | iPhone | Android | Evidence / notes |
| --- | --- | --- | --- |
| Permission prompt names the app and accurately explains microphone use; denial offers typing | Not run | Not run | |
| Device recognizer shows live words after explicit consent and stops on pause, typing, leave and background | Not run | Not run | |
| Spoken questions play through speaker and Bluetooth headphones; test routing | Not run | Not run | |
| Barge-in on speaker stops audio promptly; no spoken prompt is captured as the answer | Not run | Not run | |
| Silent switch still permits chosen question playback | Not run | N/A | |
| Incoming call interrupts a card safely and can be resumed | Not run | Not run | |
| Incoming call during recording preserves the session and clearly reports interruption | Not run | Not run | |
| Background recording shows the iOS indicator / Android foreground notification and returns safely | Not run | Not run | |
| 60-minute recording: measure size and battery use, verify segments and recovery | Not run | Not run | |
| Airplane mode interrupts upload; reconnect resumes without duplicate chunks | Not run | Not run | |
| VoiceOver / TalkBack: deck and live meeting controls, reading order, announcements, no duplicate speech | Not run | Not run | |
| Largest Dynamic Type: controls and content remain usable without clipping | Not run | Not run | |
| App Link `/mobile/enroll` opens the intended enrollment route with a test invitation | Not run | Not run | |
| Push tap routes to the intended screen without exposing question or answer content on the lock screen | Not run | Not run | |

Run the Maestro flows in `mobile/e2e/` on development builds after supplying their fictional fixture values. They are acceptance procedures; their presence does not establish a pass. For recording, consent and exclusion must be checked with every simulated attendee. Record failures and limitations in `PROGRESS.md`; do not describe native behavior as verified until there is device evidence.

## Acceptance flows

`mobile/e2e/` contains Maestro drafts A–I. They are **not run**. Use a fresh fake server for each HTTP enrollment, because the fictional invitation is single use. Flow A needs a mock build, which uses scripted speech; flow B needs an HTTP build. C starts at an unsent review and changes device network state. D–I require the indicated test scenario or current screen; complete the server-side checks in their comments. Decline/exclusion with actual recording and three-topic kickoff restart persistence still need device verification; the draft scripts do not by themselves prove those outcomes.

For web acceptance, run from `mobile/`. Export separately for each mode, clearing Metro's cache when changing build-time settings. The HTTP run checks that `/health` reports fake mode and fake providers, and it needs a fresh fake server on localhost:

```sh
# Terminal 1, from dev-server/; stop and restart for a fresh participant invitation.
env -u OPENAI_API_KEY -u OPENAI_LIVE_TRANSCRIBE_API_KEY npm start

# Terminal 2, from mobile/.
env -u OPENAI_API_KEY -u OPENAI_LIVE_TRANSCRIBE_API_KEY \
  EXPO_PUBLIC_DATA_SOURCE=http EXPO_PUBLIC_COMPANION_SCOPE=full EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4417 \
  EXPO_PUBLIC_MEETINGS_API_BASE_URL=http://127.0.0.1:4417 \
  npx expo export --platform web --clear
node scripts/e2e-web.mjs --mode http --flow all

# Mock bundle and fake local repository; no server required.
env -u OPENAI_API_KEY -u OPENAI_LIVE_TRANSCRIBE_API_KEY \
  EXPO_PUBLIC_DATA_SOURCE=mock EXPO_PUBLIC_COMPANION_SCOPE=full npx expo export --platform web --clear
node scripts/e2e-web.mjs --mode mock --flow all
```

The `all` option runs participant and advisor paths. Other independently runnable paths are `--flow offline` (HTTP), or `--flow task`, `pulse`, `facilitator`, `hybrid`, or `kickoff` (mock or HTTP), and `setup` (mock). Each needs a fresh fixture where applicable. `--base-url` uses an already served web export; otherwise the script serves `mobile/dist` on an ephemeral localhost port. `--api-url` selects the localhost fake server, and the bundle must have been exported with that same address. `--screens ../docs/screens --theme light` captures advisor checkpoints; repeat with `--theme dark`. Use `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The fake server's in-memory store resets on restart; do not use a persistent store for repeat tests.

## Web evidence (2026-10-27)

These are local Chromium runs against mock data or the in-memory fake server. They do not establish native audio, operating-system permission, background recording or device storage behavior.

| Flow | Observed on web | Still to verify |
| --- | --- | --- |
| A | Mock scripted recognizer: six cards, else, edited review and send | Audible output, real microphone and device barge-in |
| B | Mock and HTTP: six typed cards, one nudge on each, edit, acknowledged send; HTTP body contains typed source | Native keyboard and accessibility |
| C | HTTP: browser offline at send, no Sent before acknowledgment, retry with same idempotency key | Device reconnect and restart with pending data |
| D | HTTP: three choices (right, change with note, not my work); version/hash and all three acknowledgments checked | Device screen and accessibility |
| E | HTTP: Hybrid gate, released-person message, Pulse creation and two selected recipients | Voice entry and device use |
| F | HTTP: typed three-question Pulse, review, send, completion-only status and leader's second NO_MEETING gate | Spoken Pulse and native capture |
| G | HTTP: plan, one consent and one decline, typed note, closing and accepted sourced proposal; declined speaker is not selectable and no proposal source belongs to them | Native recording exclusion and consent changes on device |
| H | HTTP: Facilitator opening trigger, mute, stop, note and sourced acceptance with fake providers | Actual spoken output, time-box/closing audio and uninterrupted native recording |
| I | HTTP: three attributed topics and acknowledged notes; mock also exercised topic navigation | Kill/relaunch persistence and proposal quote review on device; web storage is intentionally memory-only |

To repeat individual web flows, export the appropriate bundle as above and run `node scripts/e2e-web.mjs --mode mock --flow spoken`, or `--mode http --flow offline`, `task`, `hybrid`, `pulse`, `advisor`, `facilitator`, or `kickoff`. For HTTP Pulse, export with `EXPO_PUBLIC_COMPANION_SCOPE=full`; restart the fake server before any participant flow so the one-use invitation and fixtures are fresh. The fake-server check blocks real providers. Maestro is not installed in this environment; the device flows have not been executed.

Additional HTTP web checks: all eight setup answers were individually reviewed and confirmed with source quotes; a corrected transcript made an accepted proposal stale and blocked acceptance until the reviewer checked the current source, then the proposal was reaccepted with revision 2. The participant wrap-up showed only the participant's own item; confirming it sent version and hash and assigned that action while another person's item stayed proposed. Run these independently with `--flow setup`, `--flow stale`, `--flow decline`, and `--flow wrapup`; restart the fake server before the participant wrap-up to restore the one-use invitation. These use fictional data and do not establish device storage, audio, or native permission behavior.


## Native completion follow-up

The local PCM module and optional realtime facilitator are now implemented. Native autolinking and isolated prebuild pass for Android and Apple; neither native compilation nor physical-device execution was run here. Run `.github/workflows/native-build.yml` manually for compile evidence, then test the resulting development builds against the checklist.

Additional device checks: same-engine WAV backup across microphone interruption and process restart; five-minute rollover and header repair; OS backup exclusion/file protection; no question/nudge audio in recovered answers; permission cancellation during card transitions; realtime connection expiry, Mute/Stop/consent/role changes; and the explicit recording/realtime microphone ownership switch. The default `tts_lines` mode is unchanged. Realtime is opt-in through `EXPO_PUBLIC_FACILITATOR_REALTIME=true`.

Raw room audio and live room input now require every attendee’s consent. With a declined attendee, keep explicitly attributed typed notes; those notes can finish and produce sourced proposals. Realtime input and native recording currently run separately.

For the complete local HTTP regression suite, export full-scope HTTP with both origins set to `http://127.0.0.1:4417`, then run `npm run test:e2e:http` in `mobile/`. The runner owns a fresh fake server per flow and removes provider credentials from its environment. Do not start another server on that port. The twelve paths cover participant, offline, Task Cards, Hybrid, Pulse, advisor, Facilitator, declined consent, stale-source review, wrap-up, kickoff and setup.
