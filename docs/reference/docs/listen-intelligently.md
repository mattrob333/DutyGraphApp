# Listen Intelligently — Participant Voice Capture V2

**Status: planned / not started.** Added September 12, 2026 at the owner's request. This item records future work; it does not authorize implementation, provider calls, rollout, or changes to participant consent.

Source: [DutyGraph Listen Intelligently — Design & Build Spec](specs/DutyGraph_Listen_Intelligently_Design_Build_Spec.pdf), supplied by the owner, 13 pages / 54 sections. The PDF is preserved unchanged. This page is a navigable implementation brief; use the source for complete copy, component suggestions, event names, and requirements.

## Objective and intended experience

**Listen intelligently. Map the work.** Let employees explain their work naturally, as if briefing a capable new teammate. DutyGraph handles documentation; the participant validates what it understood. The experience should listen patiently rather than become a constant AI interview.

Replace the visible recording/upload/transcription/extraction sequence with:

1. **Understand:** explain the purpose, audience, audio processing/retention, and review-before-send promise; show a few topics worth discussing.
2. **Talk:** one **Start** action opens a calm listening experience, local waveform, live transcript, and unobtrusive topic coverage. Dominant controls are **Pause / Continue** and **Finish**.
3. **Review:** show “Nice. Here's what we heard,” coverage and human-readable work cards first. Keep the transcript collapsed but editable/reviewable. Support **Add more**, **Looks right**, and **Change something**.
4. **Send:** one **Save & send** action submits the reviewed response and shows confirmation.

Typed responses remain supported. The new flow must preserve participant assignment/authentication, request expiry and due dates, consent, original evidence, draft recovery, task correction/approval, versioning, idempotent submission, and advisor review.

## Planned V1 scope

| Phase | Work | Acceptance focus |
| --- | --- | --- |
| 1. UX foundation | Intro/consent, listening state, local waveform, Pause/Continue/Finish, review shell | One calm Start action; clear keyboard/touch/status feedback; no manual upload/transcription controls in the normal path |
| 2. Realtime transcription | Provider abstraction, WebRTC session, partial and committed segments, scoped vocabulary, reconnect/errors | Live text without sacrificing existing batch fallback; only short-lived session authorization reaches the browser |
| 3. Audio recovery | Reuse MediaRecorder, IndexedDB, local drafts, SHA-256 checksums, resumable upload | Network or realtime failure does not destroy recoverable audio; interruption/reload recovery tested |
| 4. Coverage engine | Versioned request-specific rubric; analyze committed segments separately from extraction | Semantic coverage carries valid supporting segment IDs; no invented evidence or partial-word analysis |
| 5. Gentle prompts | Optional text prompt for meaningful missing context after a natural pause | No interruption of productive speech; one prompt at a time, dismiss on resumed speech |
| 6. Simplified review/send | Finalize transcript/audio, reconcile coverage, extract work, review/correct/add more, submit | Work understanding first; raw transcript optional; participant controls final submission |
| 7. Instrumentation | Capture lifecycle, latency, corrections, completion/abandonment, useful validated context | Measure discovery value and participant effort; define privacy-safe telemetry before collection |

These phases are a proposed sequence from source section 46, not separate completed features. Preserve the existing backlog order until the owner prioritizes this item.

## Listening and coverage contracts

- Drive 24–48 restrained waveform bars locally with Web Audio, independently of transcription. Support reduced motion and nonvisual status.
- Keep partial display text separate from committed transcript segments. Only stable committed text feeds coverage evaluation.
- Build a scoped terminology package from company/participant context, roles, systems, acronyms, and named entities the participant may access.
- Keep coverage analysis separate from final duty/task extraction. Covered dimensions require explicit transcript evidence and valid segment references.
- Rubric dimensions include purpose, trigger, inputs/source, actions/sequence, systems, dependencies, judgment/approvals, exceptions/failures, output/handoff, frequency/volume, frustrations, and workarounds. V1 starts with the smaller core set listed in source section 46.
- Internal states: unheard, emerging, covered, conflicted. Participant labels: Not discussed, Mentioned, Covered. Do not expose conflict judgments live.
- Evaluate after 10–20 seconds, a meaningful silence, or 2–4 new committed utterances. Avoid evaluating every partial word.
- Optional prompts require roughly 4 seconds of silence, at least 45 seconds of speech, a meaningful gap, and roughly 60 seconds since the previous prompt.
- Do not show completion percentages, missing-topic failure states, red recording UX, or require every topic. The source's subtle green interaction accent applies to this proposed participant control, not a redesign of Company Work Map.

The source's illustrative coverage JSON contains an excerpt; the implementation contract must retain the required supporting **segment IDs** and their revisions, not treat an unbound quote as provenance.

## Existing code to investigate before implementation

| Area | Current starting points |
| --- | --- |
| Participant capture and recovery | [capture.tsx](../client/src/capture.tsx), [request-capture.ts](../shared/request-capture.ts), [participant.css](../client/src/participant.css) |
| Transcript and work-card review | [TranscriptReview.tsx](../client/src/TranscriptReview.tsx), [ParticipantCards.tsx](../client/src/ParticipantCards.tsx), [task-review.ts](../server/task-review.ts) |
| Audio and transcription | [assets.ts](../server/assets.ts), [transcription.ts](../server/transcription.ts), [providers.ts](../server/providers.ts) |
| Authentication, routes, persistence | [app.ts](../server/app.ts), [auth.ts](../server/auth.ts), [db.ts](../server/db.ts) |
| Regression examples | [participant-delivery.test.ts](../tests/participant-delivery.test.ts), [discovery-api.test.ts](../tests/discovery-api.test.ts), [api.test.ts](../tests/api.test.ts) |

Suggested additions include a WorkCaptureExperience, capture/review components, microphone/realtime/recovery/coverage/session hooks, and backend capture-session/coverage services. Names and boundaries are design proposals, not files already delivered.

The PDF proposes capture-session, coverage, capture-checkpoint, and capture-complete endpoints plus CaptureSession, TranscriptSegment, and CoverageItem entities. Reconcile those with existing route prefixes, tenant transactions, migrations, evidence state, and API contracts before implementation; do not copy proposed paths into documentation as live endpoints.

## Decisions and prerequisites

- **Provider feasibility:** the PDF proposes “GPT-Live-Transcribe” over WebRTC and a later “GPT-Live-1” experiment. These are source proposals, not verified available model/API identifiers. Confirm current official capabilities, auth/session limits, vocabulary support, pricing, and privacy requirements before selecting a model or implementing the adapter.
- **Draft privacy:** background upload/checkpointing must not make an unfinished response visible to the advisor. Reconcile the “only after Save & send” promise with existing asset/evidence access and enforce it server-side.
- **Consent and retention:** make notices match real transmission, storage, retention, and provider processing. Decide explicit consent handling and preserve consent evidence before microphone/provider use.
- **Lifecycle and limits:** define session duration, upload/storage limits, retries, duplicate segments, transcript revisions, late provider events, and idempotent completion/submission.
- **Coverage evaluation:** create representative fictional fixtures and a review method for false coverage, unsupported citations, and missing context. Unknown/conflicting details must remain distinguishable from facts.
- **Measurement:** define useful validated context and employee-minutes before reporting the feature's proposed metric. Avoid transcript/audio/customer details in analytics; decide access, consent, retention, and instrumentation scope.
- **Rollout:** agree pilot cohort, fallback/feature enablement, operational monitoring, and rollback before replacing the current participant flow.

## Definition of done and validation

- [ ] A participant can understand the purpose in under 15 seconds and start with one clear action.
- [ ] Local waveform, partial/committed live text, semantic coverage, and optional prompts work without blocking natural speech.
- [ ] Pause/Continue, Finish, Add more, correction, and Save & send preserve a coherent session and evidence history.
- [ ] Finish stops transmission, finalizes segments/recording, completes remaining upload, reconciles coverage, and transitions to extracted work review.
- [ ] Advisor visibility begins only after submission; authorization, tenant isolation, expiry, consent, task versioning, and provenance tests pass.
- [ ] Realtime disconnect, offline capture, permission denial, provider failure, reload/interruption, and resumable upload have tested recovery paths and truthful status messages.
- [ ] Original audio and batch transcription fallback remain available; typed response remains a usable alternative.
- [ ] Keyboard/screen-reader operation, focus, contrast, touch targets, reduced motion, safe areas, and transcript scrolling are verified.
- [ ] Physical-device checks cover iPhone Safari, Android Chrome, mobile Gmail handoff, Bluetooth/AirPods, and noisy environments.
- [ ] Instrumentation measures capture progression, corrections, abandonment, and validated context per employee-minute without leaking participant content.
- [ ] Existing regression checks and the new capture/coverage/session tests pass; real-provider and participant acceptance are recorded separately.

Source performance targets, **not measured results**: waveform <300 ms after permission succeeds; perceived partial transcript <750 ms; committed-text-to-coverage <5 seconds; Finish-to-review <8 seconds on a healthy network. Resolve the coverage target against the batching cadence above and define the measurement window/percentile during design.

## Deferred experiment

After silent V1 acceptance, optionally compare it with a restrained spoken facilitator (source sections 39 and 52). Measure completion, duration, comfort, interruptions, corrections, useful facts, and abandonment. Spoken AI is not required for V1 and should not be assumed better.

[Current backlog](NEXT-STEPS.md) · [Source PDF](specs/DutyGraph_Listen_Intelligently_Design_Build_Spec.pdf)
