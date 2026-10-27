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
