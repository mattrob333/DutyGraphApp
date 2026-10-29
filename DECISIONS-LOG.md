# Decisions

| Date (UTC) | Phase | Decision | Reason |
| --- | --- | --- | --- |
| 2026-10-27 | 0 | Use the existing DutyGraphApp Git repository and work branch as the standalone mobile repo. | User opened this repo; it contains only the uploaded brief/archive and no upstream app. |
| 2026-10-27 | 0 | Extract the original archive, rather than copying generated setup artifacts. | Preserve the supplied seed exactly and make installs reproducible. |
| 2026-10-27 | 0 | Interpret participant-only seed instructions as applying to participant screens. | The approved PRD explicitly adds company-scoped advisor workflows. |
| 2026-10-27 | 0 | Continue with Astra and GPT-6.1 Sol while Gemini review is unavailable. | Requested CLI/skill/auth are absent; no invented model substitution or credentials. |
| 2026-10-27 | 0 | Use installed SDK 57 source/types if versioned docs are inaccessible. | Proxy denied docs.expo.dev; no bypass attempted. Device behavior remains unverified. |
| 2026-10-27 | All | Develop independent components in parallel after the seed baseline, then gate integrated milestones with full checks. | User explicitly requested a team; shared contracts establish dependencies before integration. |
| 2026-10-27 | 14 | Serialize secure-record operations and commit chunk pointers last. | Preserve drafts across write failures; keep legacy chunk reads compatible. |
| 2026-10-27 | 6–14 | Keep existing v1 logout keyless; require keys for new commands. | Preserve the pinned participant client while enforcing new command idempotency. |
| 2026-10-27 | 9 | Upload audio as JSON/base64 512 KiB chunks with per-chunk and whole-segment SHA-256. | A transport-neutral resumable contract works in Expo and the local server. |
| 2026-10-27 | 11 | Keep unknown owners null and resolve confirmed speaker maps separately from source text. | No inferred ownership or mutation of evidence; acceptance checks the current confirmed map. |
| 2026-10-27 | 1 | Proxy participant additions return NOT_AVAILABLE for unresolvable real upstream identities. | Local fixture authorization must not accept arbitrary upstream bearers. |
| 2026-10-27 | 14 | Exclude only erased type declaration files from executable coverage. | Type-only files have no runtime statements; shared executable line coverage is 96.73%. |
| 2026-10-27 | 4, 10 | Expose unavailable native PCM/WebRTC adapters honestly; retain device recognition, typing and TTS. | No native build/device/provider session is available to establish those transports. |
| 2026-10-27 | 5 | Keep the pinned Task Card attestation payload exact; send change/not-mine/unknown notes through the proposed extras API. | Adding note fields to the existing correct-attestation schema would violate the deployed contract. |
| 2026-10-27 | 6, 14 | Clear local advisor state even when remote logout fails; scope queries and drafts to identity. | Offline logout and company replacement must not expose previous session data. |
| 2026-10-27 | 14 | Read staging origins from the EAS preview environment; preview builds use mock data. | An example placeholder must not override configured reachable origins. |
| 2026-10-27 | Extra | Keep demo-tour steps explicit and mock-only; route to real screens without automatic consent or submission. | A guided demo must retain the application's human review boundaries. |

| 2026-10-27 | Continuation | Remove Gemini review from required scope; continue native adapter and end-to-end implementation. | The owner explicitly waived Gemini and authorized further build work. Lack of a device limits verification, not source implementation. |

| 2026-10-27 | Continuation | Implement native PCM as a local Expo module with a same-engine WAV tee. | Avoid a second microphone owner; retain bounded recoverable audio without storing transcript text in backup metadata. |
| 2026-10-27 | Continuation | Require all attendees to consent for raw room audio; preserve explicitly attributed typed notes when someone declines. | A single-phone microphone cannot separate a declined person’s voice. |
| 2026-10-27 | Continuation | Keep native meeting recording and optional realtime input mutually exclusive pending device validation. | Prevent unverified microphone contention; default TTS facilitation remains supported with recording. |
| 2026-10-27 | Continuation | Use actual recording durations for playback and recording-local speaker clusters. | Interrupted segments are shorter than five minutes and provider speaker IDs cannot be assumed stable across files. |

## 2026-10-28 — Earn phone client defaults

Use Agent A's generated eight-operation mobile contract independently of participant v1. Share the existing participant ApiClient/context; independent refreshers can rotate the same refresh token twice. Missing settings and financial authority never come from screen input. No new Earn data is embedded in the phone bundle; release builds refuse a fixture-advertising backend. The real contract has no standalone draft-creation route, so spoken task saving uses only the authenticated development capability on loopback, not an invented production route. Voice uses existing native recognition with no provider grant; all unknown task slots remain Not stated. Clipboard uses the installed SDK57-compatible package; native acceptance remains unverified. Keep the current SDK rather than apply audit's proposed breaking downgrade; remaining tooling findings are an explicit release limitation.
