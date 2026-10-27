# Leadership meeting workspace

Discovery follows research and outreach → returned preparation → leadership conversation → team review → individual interviews.

## Standard kickoff plan (September 24, 2026)

- **No AI needed.** Step two shows *Executive kickoff · standard plan* (`GET /api/v1/companies/:companyId/kickoff/plan`): a 120-minute agenda, questions ranked from Company Research gaps (importance × uncertainty × internal authority; client- or executive-verified fields are not asked again), objective and friction probes, the sponsor's chosen attendees and pilots, and "what we already have" from the returned preparation and roster.
- **Invitations.** *Send kickoff invitations* (`POST …/kickoff/meetings`) records the meeting (date, time zone, location, agenda) and sends one email per attendee from the workspace email provider with an `.ics` calendar file (stable UID; a reschedule increases SEQUENCE and withdraws the earlier pre-read links). Each email carries a password-free pre-read link (`/api/invitations/:token/executive`) with the agenda, labelled research facts, an attendance answer and up to three optional pre-work questions.
- **Attributed notes.** *Kickoff notes · who said what* saves statements with a speaker as leadership evidence (`POST …/kickoff/notes`). Answers to research gaps become proposed claim updates attributed to the speaker; the advisor accepts (recorded through `recordHumanVerification` as executive evidence citing the notes) or rejects each one. Nothing is applied automatically. Saving notes for a scheduled meeting marks it held. Unsaved notes are kept on the device and restored after a reload.

## Current behavior

- Opening Discovery with a returned or accepted contact response starts at Leadership meeting. A selected tab is not changed while the advisor is working. Research & contact retains a forward link to step two.
- Step two shows preparation, agenda and saved-outcome status first. Contact answers and the roster are available in a disclosure. Importing a roster is separate from reviewing its accuracy.
- Agenda topics expose their questions on demand. The call workspace presents eight conversation topics, a prominent question, optional follow-up, company-model flows and a notes field. The generated agenda remains available above it; it is not automatically sent to attendees.
- Notes remain in component memory until explicitly saved. They survive Discovery topic/step changes, but not leaving Discovery. A browser unload warning protects unsaved edits where supported. No durable autosave is claimed.
- Save outcomes & review team uses the existing meeting-evidence endpoint, then selects step three. With AI configured, the existing roster preparation runs from saved evidence. People and duties remain proposals. The step-three breakdown opens for review even if already saved; opening it does not approve it.
- Review roles, departments, reporting lines and ongoing duties before individual interview preparation. Employee interviews establish their detailed task procedures. Existing people and duties are not deleted.

## Next slice: evidence-backed conversation coverage

Reuse the separation described in [Listen Intelligently](listen-intelligently.md): capture, committed transcript segments, semantic coverage, participant review and extraction are separate responsibilities. This UI does not implement live recording, automatic coverage or agenda delivery.

Build a company-specific executive rubric from research, the contact preparation and selected business streams. Cover operating model and value delivery; goals with owners, measures, baselines, targets and dates; departments, people, reporting and duties; one real work example; handoffs and exceptions; systems and human decision boundaries; and follow-up owners/dates. Preserve unknowns and disagreements.

A proposed coverage finding must cite committed transcript segment IDs and revisions, identify the speaker where available, and invalidate when its evidence changes. Draft speech or merely typing a note must not yield a verified check. Distinguish mentioned, supported and conflicted context. Let the advisor review/correct the record before extraction into step-three proposals. Retain consent, interruption recovery, company isolation and evidence provenance. Acceptance tests must include missing/conflicting speakers, revised transcripts, unsupported assertions and a step-two-to-step-three provenance check.

## Validation and continuation

Local checks use fictional records and mocked APIs. Browser coverage includes response arrival, disclosure defaults, keyboard focus, note retention between topics/stages, narrow layouts, save payload and step-three transition, stale agendas and manual operation without a generated agenda. Unit tests cover arrival selection and the existing business-specific guide/note composition. Database and real-provider acceptance remain separate checks before release.
