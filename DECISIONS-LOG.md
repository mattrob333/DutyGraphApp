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
