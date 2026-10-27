# Product writing standard

Use plain technical English informed by ASD-STE100 Simplified Technical English. Do not claim formal ASD-STE100 compliance without checking the full standard and approved vocabulary.

- Use short sentences. Give one instruction per sentence.
- Use active verbs and name the person or system that acts.
- Use the same term for the same thing. Define acronyms on first use.
- State the input, action and expected result.
- Label facts, assumptions, missing values and proposals.
- Prefer “possible constraint” to “candidate,” “saved record” to “authoritative artifact,” and “required earlier analysis” to “upstream artifact” in user-facing explanations.
- Retain established framework names and precise units. Explain them beside the name.
- Never simplify away a condition, limit, source requirement or human decision.

## Labels and instructions throughout the app

Company onboarding starts with the whole business. Ask for its name and website, then open research. Do not require a workflow or improvement goal. Offer department-first review as an optional choice for large companies. Scope and improvement questions below apply to later settings.

Apply this standard to forms, navigation, help text, errors, empty states and generated advisor instructions. Review visible copy before merging a UI change.

- Use "Add a company" for company creation.
- Use "What work will you review?" for the team, process or business area included in the review. Provide an example.
- Use "What do you want to improve?" for the intended result. Provide an example.
- Replace "bounded" with the actual limit or permitted action. Keep exact stored identifiers unchanged.
- Explain unfamiliar product terms where the user must make a decision. A placeholder must not be the only explanation.
- Keep procedural sentences at 20 words or fewer where possible. Give one instruction per sentence.

The September 14 company-setup pass aligns signup, creation and settings labels, engagement planning, and analysis limit explanations. This is not a claim that every existing string meets the full controlled dictionary.

Official reference: https://www.asd-ste100.org/about_STE.html. Existing copy should be reviewed as each page changes. This release updates the Strategy, Workflows and Weekly review explanations; it is not a completed compliance audit of all historical text.


2026-09-14: First-contact preparation now uses shared company-detail fields for website leads and manual entries. Original contact answers are prefilled, editable, and retained as response evidence for advisor review. Existing replies remain compatible. Build, typecheck, contracts and six focused tests passed. Database-backed end-to-end testing remains pending; no live messages or provider calls.
