# DutyGraph Mobile

Read docs/PRD.md and docs/01-BUILD-PLAN.md. This standalone app extends the seed with company-scoped advisor features; the old participant-only rule applies to participant screens, not advisor routes. The current repository and branch are the authorized standalone workspace; do not modify the upstream DutyGraph web app.

Follow docs/10-RULES-AND-GUARDRAILS.md and docs/11-DECISIONS-AND-DEFAULTS.md. Preserve existing tests and the participant API contract. Screens use repository adapters, never direct network requests. Shared deck logic stays pure. Native capability claims require device evidence.

Keep README.md, PROGRESS.md, DEVLOG.md and DECISIONS-LOG.md current. Use fictional data only, no secrets or provider calls in tests. Coordinate file ownership between agents; the primary agent owns commits and integration.
