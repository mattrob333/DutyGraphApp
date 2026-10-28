# Decisions

| Date (UTC) | Phase | Decision | Reason |
| --- | --- | --- | --- |
| 2026-10-28 | Day-run D5 | Poll finish status for at most one minute; subsequent taps reuse the original command key and confirm completion through that receipt. | Keep UI waits finite without duplicating paid work or accepting another job's completion. |
| 2026-10-28 | Day-run D5 | Stop only local checks on leave/background/cancel. Ambiguous dispatch requires advisor review and retains its key. | Durable server work can finish independently; uncertain provider dispatch must not be repeated automatically. |
| 2026-10-28 | Day-run D2 | Save outcomes separately from Complete; Complete requires the current server session version/hash and no unsaved outcome changes. | Outcome review must not imply acknowledged meeting completion. |
| 2026-10-28 | Day-run D2 | Require an explicit timezone on deferred dates; preserve draft input after a failed save. | Avoid silent date/time conversion and retry data loss. |
| 2026-10-28 | Day-run D2 | Link a follow-up meeting explicitly with previousMeetingId; never create a meeting automatically. | Deferred work carries forward only when the advisor starts the next plan. |
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
| 2026-10-28 | Sprint 2 P4 (partial) | Show a non-blocking amber warning for instruction-like evidence quotes; retain human decision controls. | The app red team found injected words inside draft proposals. The warning makes the source risk visible without inventing or automatically applying a decision. Native and full-suite verification not yet run. |
| 2026-10-28 | Sprint 2 P2 | Keep `http` as backward-compatible dev mode; explicit real profiles use one origin and remote profiles enforce HTTPS. Do not change deployed EAS profiles until real endpoints pass. | Avoid cross-origin bearer leakage and preserve mock/dev-server demos while backend porting remains incomplete. |
| 2026-10-28 | Sprint 2 P4 | Fail closed for iOS meeting evidence if backup-excluded native directory is unavailable. Keep temporary recordings in Cache and migrate legacy Documents clips on restore. | Avoid silently writing private meeting audio into iCloud-backed Documents on older builds; preserve saved upload state during migration. |
| 2026-10-28 | Sprint 2 P4 | Use dutygraph.com HTTPS App Links only in explicitly selected production backend builds; retain existing invitation origin and custom scheme in mock/dev. | Avoid breaking demo links and avoid claiming iOS Universal Links work until the server AASA and signed app are verified. |
| 2026-10-28 | Actual backend P1/P3 | Generate separate advisor/extras wire types only from the running V2 server; keep participant v1 pinned. Bind browser traffic to served schema hashes. | Avoid treating the old proposed development contract as production evidence. |
| 2026-10-28 | Actual backend P3 | Use actual V2 createApp and PostgreSQL with injected test providers, fresh fictional tenants and private ephemeral manifests; serve SPA/API on one origin. | Exercise deployed-style routes/auth/storage without adding a public seed endpoint or relaxing production origin policy. |
| 2026-10-28 | Actual backend P4 | Clear advisor access before remote logout and fence every in-flight response/refresh by session generation. | An old request must not restore tokens or erase a later login. |
| 2026-10-28 | Actual backend P4 | Retain reviewed version/hash and exact-command identity through real-profile edits, routing, closing and kickoff acknowledgments; preserve legacy request shapes. | A retry cannot silently substitute a newer review or reuse a key with changed content. |
| 2026-10-28 | Actual backend P4 | Cache extensionless protected voice URLs only with declared WAV/MPEG format and exact same-origin path validation. | Correct native file formats without granting bearer credentials to arbitrary URLs. |
| 2026-10-28 | Actual backend P4 | Apply compatible audit patches; retain Expo CLI's declared Zod3 dependency pending an upstream fix. | A forced major override would create an unverified toolchain change; remaining advisory is documented. |
