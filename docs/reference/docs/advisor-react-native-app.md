# Spec: advisor React Native app — requirements

**Status:** not built (owner: "we will build that next"). Today every advisor action is web-only (cookie + CSRF); the only mobile auth is the participant Companion bearer (`contracts/companion-mobile.openapi.json`), and push is a no-op provider. This spec collects the advisor-app requirements from every segment; GAP-04 consolidated them per screen after walking the web app at phone size (the practical stand-in).

## Principles

1. **Contract first:** a pinned `contracts/advisor-mobile.openapi.json` wrapping the **same server functions** as the web (no second business or commercial path). Every command takes an Idempotency-Key and, where the web uses it, an expected version.
2. **Inbox first:** the home screen is the Inbox projection (`shared/inbox.ts`), one action per item, and every lifecycle state has an item (see [advisor notifications and Inbox](advisor-notifications-and-inbox.md)).
3. **Server enforces everything:** suppression, frequency caps, request-language and link policies, sender identity, activation evidence, research budgets. The app only displays the server's reason.
4. **Bearer hygiene and lock-screen privacy:** no prospect or participant bearer URLs in push payloads, logs, analytics or caches; lock-screen text is company + reason only.
5. **No Jev or AI keys on the device.**

## Dependencies on web/server work

The app is only as useful as the server it wraps. Build first: advisor notification outbox and push provider (ADV-01-04, ADV-03-19, GAP-01-V3); Inbox reasons for every state (PAY-01-12, OUT-01-02); non-AI templates (ONB-01-01, TEAM-01-01); preview/test-send routes (ADV-03-11); payment offers (PAY-01); kickoff meeting resource (ONB-01-19); report delivery (OUT-01-15).

## Per-segment requirement lists

The numbered lists R1–R14 (ADV-01), R1–R10 (ADV-03), PAY-01 §S11, GAP-01 R1–R8 and GAP-03 RN-G1–G12 are in the segment files; the consolidated per-screen version follows.

## Source spec (copied from the GAP-04 notes)

> Copied from `/opt/rt/notes/gap-04.md` lines 873–1040. Paths under `/opt/rt` are on the red-team machine. Where this copy and the header above differ, the header (which folds in the verification pass and other segments) wins.

### Platform (applies to every screen)

- **Sources:** ADV-01 R1/R13/R14, ADV-03 R1/R2/R10, TEAM-01 1/9, ONB-01 security, PAY-01 §S11 guardrails, X-DATA contract hygiene, X-JEV (no Jev
  on device), ABUSE-01 (same server guards, bearer hygiene, lock-screen privacy), GAP-02 (contract-first), GAP-04-01/-02/-04/-08.
- **Auth & contract:** new pinned `contracts/advisor-mobile.openapi.json` served at `/api/advisor-mobile/v1` wrapping the same server functions
  (no second business model). Session: email + password or a magic link / QR hand-off from the signed-in web app → device-bound opaque bearer +
  rotating refresh (idempotent refresh, TEAM-01-14), role `advisor_mobile` distinct from `participant_mobile`, same tenant RLS and runtime
  role; device list and revoke in Workspace settings; logout revokes the device and its push token. *Missing today:* all of it —
  `server/mobile-auth.ts` only knows participants.
- **Push:** a real provider (Expo → APNs/FCM) replacing `noopPushProvider` (`server/mobile-notifications.ts:25`); an **event outbox** written in
  the same transaction as the account/inbox events, one push per Inbox item key (`reason:subject:trigger`), collapsed digests, quiet hours,
  per-type preferences, escalation to email when unacknowledged; delivery state (sent / failed / no device) stored and shown on the item.
  Lock-screen text = company + reason only (no emails, goals, notes, findings, amounts); payload = ids only, never bearer tokens.
- **Deep links:** one route scheme for push and email: Universal/App Links `https://<app>/login#inbox/request/<id>`,
  `…#accounts/<id>/<tab>`, `…#discovery/<stage>/<section>` with the app registered for those paths only (never `/account-link/*` or `/invite/*`,
  CLI-02-15). Web fallback already works: the hash survives sign-in (step A1). **Use `/login#…`, not `/app#…`: `/app` has no Vercel rewrite.**
- **Secure storage & offline:** bearer/refresh in Keychain/Keystore; biometric app lock; read cache (Inbox, accounts, packages, notes drafts)
  encrypted at rest, cleared on logout, with "last synced"; queued commands replayed with the same idempotency key and shown as "not sent yet";
  **never auto-send an email that was queued offline** without re-confirmation (ADV-03 R10); no bearer URL, roster PII, answer text or findings
  in logs, crash reports, analytics or push payloads; "Copy link" only at issue time, clipboard cleared after 60 s, screenshot protection on
  reveal screens.
- **Ergonomics baseline (from this walk):** 44 pt minimum targets and ≥ 8 pt from destructive controls (GAP-04-02); system text sizes with
  16 pt+ inputs and Dynamic Type (GAP-04-01); content ≥ 75 % of the screen (GAP-04-04); every long text field autosaves a local draft
  (GAP-04-08); dark/light themes.

### Screens

**1. Notifications + Inbox (home)** — *web today: usable at 390 px once signed in; no notification reaches the advisor.*
- Sources: ADV-01 R2–R8, ADV-01-16, ADV-03 R3, GAP-01 R1–R3/R7/R8, GAP-02, KICK-01 (Inbox parity), ONB-01 (push + Inbox parity), TEAM-01 2,
  X-DATA (next-action model), X-JEV (triage chips, Filtered tab), ABUSE-01 (Filtered, bulk spam), CLI-01 (push within seconds), GAP-04 A1.
- Data & API: exists `GET /v1/inbox`, `POST /v1/inbox/dismissals`. Missing: per-item route (`GET /inbox/items/{key}`), snooze, undo of a
  dismissal, ageing ("waiting 2 h"), unseen counts for the badge, Filtered group, `POST /me/push-token` for advisors.
- Push: new audit request (to operator/assignee), prospect viewed (digest) / engaged / submitted Set Up / answered review, offer viewed /
  accepted / paid / payment failed, preparation returned, participant answered or stuck, follow-up due, outcome review due, report viewed,
  bounce / complaint / unsubscribe, lead waiting past the promised response time.
- Offline: cached list read-only with "last synced"; dismiss/snooze queued.
- Acceptance: a website submission produces a push on the operator's device within 60 s; tapping it opens that lead's card with Accept visible
  without scrolling; Inbox order and wording equal `GET /v1/inbox`; the badge counts unseen items only.

**2. Lead card and triage (website requests)** — *web today: usable with friction (role/size/website are 3,800 px lower; no decline).*
- Sources: ADV-01 R9–R12, ADV-01-08/-09, CLI-01 (scope/package/size on the request), X-JEV-14, ABUSE-01 (email confirmed chip, never
  auto-accept), GAP-04 A2.
- Data & API: exists `GET /v1/pilot-inbox`, `PATCH /v1/pilot-inbox/:id`, `POST /v1/pilot-inbox/:id/open`. Missing: decline / not a fit /
  spam / assign / reassign commands, duplicate hints (same domain), prior submissions (CLI-01-08).
- Push: see 1. Offline: accept queued only with an explicit "will send when online" state.
- Acceptance: the card shows name, role, company, website (tappable), size, goal, source, received time and duplicate hints on one screen;
  Accept → welcome composer in one tap; decline/spam/assign available with undo.

**3. Accounts list, add and import** — *web today: usable (14 px fields zoom; duplicate-domain warning is one inline line).*
- Sources: ADV-03 R4, ADV-03-02/-03, PAY-01 §S11 (deals pipeline), GAP-02 (journey health), GAP-04 A3.
- Data & API: exists `GET/POST /v1/accounts`, `PATCH /v1/accounts/:id`, `POST …/contacts`. Missing: `POST /accounts/import` (contacts / CSV
  share sheet, per-contact selection, work email only), relationship "Existing client" on the book tab, blocking confirm on duplicate domain.
- Offline: create queued with idempotency key; duplicate check re-run on sync.
- Acceptance: add one account in ≤ 8 taps; importing 10 contacts takes < 2 min; a duplicate domain needs an explicit "This is a different
  company" confirmation.

**4. Account detail: golden thread, journey rail, timeline** — *web today: usable but the drawer leaves 61 % of the screen (GAP-04-04).*
- Sources: GAP-02 ★ journey rail + golden-thread card, X-DATA (one timeline with true actor kinds, X-DATA-19), CLI-01 (per-account timeline,
  what the client opened), CLI-02 (link state, revoke), ADV-03 R8/R9, GAP-04 A4 (11 identical activity lines).
- Data & API: exists `GET /v1/accounts/:id` (links with view counts, events), `POST …/links/:linkId/revoke`. Missing: merged paginated
  timeline, golden-thread projection (facts that started the conversation, client's goal and notes, purchased scope/package, sponsor, roster
  status), view counts that mean visits (GAP-04-10).
- Push: any client action on this account. Offline: read cache.
- Acceptance: one screen shows where the account is, what is waiting and on whom, and the one next action; every item shows its source
  (client, advisor, research, simulated).

**5. Research (Preview / Snapshot)** — *web today: usable.*
- Sources: ADV-03 R5, ADV-03-04, CLI-01 (one-tap Start Snapshot), GAP-04 A3/A3c.
- Data & API: exists `POST /v1/accounts/:id/research-authorizations`, `POST /v1/companies/:cid/research-runs`,
  `GET …/research-runs/:runId`, `GET /v1/companies/:cid/claims`. Missing: bulk run for selected accounts with maximum cost shown first,
  run-finished push.
- Acceptance: cost shown before confirming; progress by push or polling; the result lists findings with their provenance labels
  ("Simulated", "Client provided").

**6. Compose and send (cold email, welcome, follow-up, company-picture review, first touch)** — *web today: cold/welcome/review usable
with friction (no preview, one-tap send); first touch unusable on a phone (AI-only + 5 screens down, GAP-04-07).*
- Sources: ADV-03 R6/R7/R8/R9 and §8.1 (template spec), ADV-03-11, ABUSE-01 (send confirmation sheet, server guards, biometric step-up),
  CLI-02 (identity preview, test-send, reminders that do not break links), GAP-01 R3/R4, ONB-01 (first touch with sponsor/scope prefilled,
  link status), X-JEV (`…/outreach/:kind/check` flags), GAP-02, GAP-04 A2/A3/A5, GAP-04-13/-14.
- Data & API: exists `GET /v1/accounts/:id/outreach`, `POST …/outreach/:kind/draft`, `PUT …/outreach/:kind`, `POST …/outreach/:kind/send`
  (mode `email` | `manual`), `GET/POST /v1/companies/:cid/requests/:rid/email-preview|email`. Missing: `POST …/outreach/:kind/preview` →
  `{html, text, subject, warnings, checks}`, `POST …/test-send`, `advisor_follow_up` and `engaged_follow_up` kinds, a **template (non-AI) path
  for the first-touch request** (ONB-01-01), bulk send, send-at-local-time, sender identity settings.
- Push: bounce/complaint, first view, answer.
- Offline: drafts cached encrypted and synced with `expectedVersion`; sends only online, never auto-sent later.
- Acceptance: from a push "Imani Brooks answered your preview" the advisor opens the account, drafts the follow-up, previews the rendered HTML
  (phone + dark mode), confirms "Send to Imani Brooks <…> from Alex Rivera" and sends in < 60 s; manual mode opens the native mail composer with
  the HTML body; no bearer URL recoverable after the reveal screen closes.

**7. Deal: options, payment status, record a commitment** — *web today: recording a commitment is usable (4 large method cards, one-line
note); client choice and payment not built.*
- Sources: PAY-01 §S3/§S11, PAY-01-15, CLI-01 (send proposal, record approval), CLI-02 (send offer link), ABUSE-01 (no card marking from the
  app, verified webhooks only), GAP-04 A4, GAP-04-06.
- Data & API: exists `GET /v1/accounts/activation-options`, `POST /v1/accounts/:id/engagement/activate` (method, reference, note). Missing:
  price book, offer (scope: full company vs departments; plan: one-time vs Living + cadence; price, validity), offer link, Stripe checkout
  and webhooks, offer events (viewed / accepted / paid / failed), receipts, refunds (`billing_admin` + biometric).
- Push: sponsor submitted review, options viewed, accepted, paid, payment failed, invoice overdue, cancellation, dispute.
- Acceptance: prepare two options from the sponsor's answers and send them in ≤ 6 taps; a paid offer moves the engagement to active and puts
  "Send first-touch" at the top of the Inbox; the app never marks a card payment itself.

**8. Preparation review and roster import** — *web today: usable with friction (import button at y 1,295; the roster table hides whose row
you tick, ONB-01-12).*
- Sources: ONB-01 (review package, per-row conflicts, one-tap import), X-DATA-14/-15, X-JEV-15 (mapping confirm one card per column), GAP-02
  (executives and pilots as data), GAP-04 A6/B4.
- Data & API: exists `GET /v1/companies/:cid/workspace`, `POST …/responses/:rid/kickoff-roster`, `POST …/roster/preview|apply`. Missing:
  per-row conflict resolution, executive/pilot flags kept on people, a "preparation returned" item that resolves (ONB-01-18).
- Push: preparation returned (with counts), sponsor asked a question. Offline: read-only cached package, no roster PII cached unencrypted;
  biometric re-auth before exporting a roster.
- Acceptance: import 25 people with 1 conflict resolved in place in ≤ 5 taps; executives and pilots remain selectable as data afterwards.

**9. Kickoff: schedule, live notes, after the call** — *web today: live note-taking on a phone is unsafe (GAP-04-08) and the save is 7 screens
down; agenda/guide AI-only.*
- Sources: KICK-01 (kickoff card, invite, pre-work, live call mode with speaker picker, after-call proposed updates, handoff), ONB-01-19
  (schedule + .ics), X-DATA-16 (relay what someone said), X-JEV-16 (executive correction proposals), GAP-04 A6, GAP-04-08.
- Data & API: exists `POST /v1/companies/:cid/discovery/meeting` (save outcomes), `POST …/claims/verifications` (relay a statement with a
  source record). Missing: kickoff meeting resource (attendees, time, RSVP), invitations with `.ics`, pre-work requests, **notes draft
  autosave** (`PUT …/meeting-notes/draft`), speaker-attributed notes, a non-AI company-specific guide (from objectives, scope, gaps).
- Push: kickoff tomorrow, pre-work returned, follow-ups due.
- Offline: notes written offline-first to encrypted local storage and synced; optional on-device recording with consent capture.
- Acceptance: notes typed during a call survive app switching, a phone call and a restart; saving creates accepted leadership evidence and
  moves the account to team discovery with the pilots pre-selected.

**10. Team discovery campaign** — *web today: sending works once requests exist; creating question sets is AI-only (TEAM-01-01); the
participant page works in WebKit.*
- Sources: TEAM-01 2–8 (campaign monitor, nudge/re-issue, QR full-screen, question sets without AI, review answers, approve cards, people
  hygiene), TEAM-01-17, KICK-01 handoff, GAP-02, GAP-04 B5, GAP-04-09.
- Data & API: exists `POST /v1/companies/:cid/records` (request), `POST …/requests/:rid/email`, `GET …/requests/:rid/emails`. Missing: default
  question templates (no AI), `POST …/requests/:rid/remind`, per-person status (emailed / opened / phone connected / responded / expired),
  manual task-card creation from an answer (TEAM-01-20), participant device list and revoke (TEAM-01-28).
- Push: participant answered, stuck (understanding failed, link expired), due tomorrow without an answer.
- Acceptance: send 3 pilots their questions from the phone without AI in ≤ 6 taps; "Remind" re-sends the same valid link and is rate-limited.

**11. Results and Living DutyGraph** — *web today: not walked on a phone in this segment (coverage gap).*
- Sources: OUT-01 (weekly review, results, account stage, renewal), GAP-01 R5/R6 (follow-up health, monthly update approval), X-DATA (report
  preview and approval), CLI-01 (notify results ready).
- Data & API: exists `/v1/companies/:cid/reports`, `/audit-brief`. Missing: Living update cadence and events, report viewed/acknowledged
  events, renewal records.
- Push: outcome review due, weekly update returned, report viewed, re-confirmation needed, renewal due.
- Acceptance: approve a prepared update and send it to the sponsor from a push in < 60 s.

**12. Settings** — notification preferences and quiet hours (ADV-01 R6, GAP-01 R7), sender identity (ADV-03-09), devices and revoke
(TEAM-01 1), provider keys stay desk-only. Missing routes: `GET/PUT /me/notification-preferences`, `GET/DELETE /me/devices`.

### Web flows on a phone today (390 px, from this walk)

| Flow | Phone status today | Why (finding) |
| --- | --- | --- |
| Lead notification → Inbox | **Unusable** (no notification) / Inbox itself usable | ADV-01-04, GAP-01-01; hash deep link works (A1) |
| Triage and accept a website lead | Usable with friction | ADV-01-08/-09 (A2) |
| Accept → welcome note → send | **Usable** (best phone path) | A2 |
| Add account, Preview research | Usable | GAP-04-01 zoom (A3) |
| Signal picker → draft → send cold email | Usable with friction | GAP-04-04, ADV-03-11 (A3) |
| Snapshot → company-picture review email | Usable | A3c |
| Record a commitment (activation) | Usable with friction | GAP-04-06 (A4) |
| Client chooses package and pays | **Not built** | PAY-01-01/-02 |
| First-touch roster/executives request | **Unusable on a phone** without an AI key; 5 screens down with one | ONB-01-01, GAP-04-07 (A5) |
| Returned preparation → roster import | Usable with friction | ONB-01-12, GAP-04-07 (A6) |
| Kickoff agenda / guide | **Unusable** without AI; generic guide only | KICK-01-11/-13 |
| Live kickoff notes | **Unusable for live use** (lost on tab discard; save 7 screens down) | GAP-04-08, GAP-04-07 (A6) |
| Team question sets | **Unusable** without AI | TEAM-01-01 |
| Send team questions (requests exist) | Usable | B5 bridge |
| Research Findings relay, Work Map, reports | Not walked on a phone | coverage gap |
| Client pages (form, preview, Set Up, review, kickoff prep, team link) | Usable in WebKit, same as Chromium | GAP-04-01, GAP-04-05 (B1–B5) |

---

## Segment result

