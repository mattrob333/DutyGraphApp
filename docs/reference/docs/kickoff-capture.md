# Business-specific kickoff and participant capture

Implemented September 7, 2026 in response to the owner's request for a complete invitation/voice flow and more useful business-specific discovery context.

## The context chain

1. Company research and the selected business profile guide a light preliminary email to the point of contact. They do not create internal staff or duties.
2. Leadership validates the business model, each hybrid stream, goals, departments, reporting, responsibilities, a representative task, handoffs, systems, approval boundaries and missing information.
3. The advisor saves optional notes under eight guided sections, a transcript, or both. The combined 20,000-character limit is displayed and enforced before saving. Meeting excerpts retain the full allowed 20,000 characters in downstream discovery context.
4. Dossier extraction preserves each stated duty's outcome, examples, dependencies and software in its description. The advisor reviews people, roles, departments and duties before creating personal questions.
5. Interviews ask up to eight concise prompts about all recorded duties: recurring tasks, frequency, triggers, input fields and sender, ordered actions, tools, completion checks, outputs, recipients, exceptions and human decisions. They do not force a fixed task count.
6. The private participant page records/uploads audio or accepts text. A saved recording can be transcribed; the person checks and adds that text to their response. AI uses that response, their questions, role, department, full duty descriptions and selected business profile to propose granular cards.
7. The person approves or edits each card, then submits the answer and reviewed cards together. The advisor reconciles gaps and disagreements and may run the cross-team review. Participant approval records understanding, not corporate authority or agent permissions.

## Implementation

- `shared/kickoff-guide.ts`: eight guide sections, probes across all 11 business-template groups plus selected model-specific probes, custom/hybrid handling and note composition. Missing profiles prompt model identification. Proposed stage names are visible for leadership validation.
- `shared/discovery.ts`: stage-specific AI instructions and bounded structured outputs. `shared/work-granularity.ts` defines duty/task/action separation.
- `server/discovery.ts`: stage source selection and `captureGuide` context. Prompt version `discovery-context-v2` joins the fingerprint; old discovery drafts need regeneration before applying against current context.
- `server/participant-cards.ts`: participant-only context, full duty purposes, business profile and versioned input snapshot. Task purpose, trigger and reported human checkpoints are retained on the review card and saved task record; these remain the participant’s account, not verified authority. The added card fields are optional for older saved drafts. Citation IDs and owner/performer IDs are validated. Unknown IDs fail before cards are returned. The open request and its version are rechecked after generation.
- `shared/request-capture.ts`: common voice preference and steps used by the real invitation and response page. Work requests include card review; preliminary leadership requests do not ask executives to approve employee cards.
- `server/invitation-template.ts`: escaped HTML and plain text, personal questions, due date, private response link and access instructions. HTML keeps instruction paragraphs readable.
- `client/src/DiscoveryJourney.tsx`: guided kickoff worksheet. Unsaved notes are in component memory, clear on company switch and are lost on reload; save before leaving. Empty note sections may be covered by a transcript and are not automatically declared missing facts.

## Delivery and access

Existing invitation issuance, enrollment, email receipts, audio storage, transcription and submission routes remain in use. Creating a request is separate from sending its email. The private invitation is assigned to one participant, expires after seven days and requires account enrollment/sign-in. Enrollment returns the assigned request ID and opens `/respond?request=…`; refreshing or signing back in at that URL retains the requested form. The request ID is a selector, not a credential: the API still checks the authenticated participant and company. Recording requires the browser's microphone permission and a secure origin. Audio upload and typing remain alternatives.

Live email requires the account's enabled Resend configuration and a verified sender. Transcription and card extraction require the account's enabled OpenAI configuration. Failed/unconfigured AI offers sending the original answer for advisor review. This change does not provision provider accounts or claim a real email was delivered.

## Verification and acceptance

Synthetic tests cover the contact-email/private-enrollment/response/discovery chain, tenant isolation, audio upload/transcription contracts, participant submission and authority semantics. Added checks cover all business templates, hybrid/custom fallback, verbatim note preservation, long meeting-context retention, profile fingerprint invalidation, duty context reaching extraction, and rejection of foreign sources/people. UI checks and release results are recorded in the development log.

Provider outputs in automated tests are fixtures. No real microphone recording, paid model-quality evaluation or external email delivery is established by them. Pilot acceptance should measure missed tasks, invented details, incorrect handoffs, participant corrections and completion effort across representative business types.
