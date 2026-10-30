# Meeting depth: app review findings

## 2026-10-29 — Meeting-depth review corrections

Five independent meeting reviewers found no High findings. App-owned Medium findings MR3-2/MR5-01 (optional AI gate suggestion absent), MR5-02 (linked card and created draft not inspectable), and MR5-03 (affected person/card not adjustable) are corrected in this draft. The optional suggestion remains separate from the deterministic result, the company setting defaults off, and requesting advice does not route the meeting. Scoped Task Card reads support title/id and read-only data inspection; person/card/owner selections remain explicit before acceptance.

MR2-1/MR3-1's linked-draft mismatch is mitigated by immutable accepted draft proposals. Follow-up MR2-2 is addressed by allowing only explicit rejection of a stale linked proposal, preserving the existing draft. Mock/development API regressions verify the preserved record and replay semantics; component tests verify the warning and action restrictions. Backend grounding MR4-1 is owned by the mobile API branch, with whitespace/name ambiguity regressions there.

Final correction checks: 47 focused mobile tests and 67 development API tests passed. Earlier complete suites: mobile 572, shared 78. Phone-width browser validation is recorded separately when completed; no native/device or paid-provider result is implied. Historical security/release findings above retain their stated limits.

Phone review: the fake-provider HTTP walkthrough passed at 390×844: linked-source inspection, target/person/owner adjustments, acceptance, read-only saved-draft inspection, and absence of mutation buttons after draft creation. Three screenshots are in `docs/day-run/screens/advisor-taskcard-*-light.png`. No horizontal document overflow or browser page errors were observed. The first harness attempts incorrectly waited on text in stacked question cards; waiting on the accessible current heading corrected the automation without changing gate checks.
