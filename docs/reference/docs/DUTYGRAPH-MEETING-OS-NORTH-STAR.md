# DutyGraph Meeting OS
## North Star Vision, Carson Tate Framework, AI Facilitation Architecture, and Product Design Context

**Document type:** Product Vision / Architecture Context / Future Feature Specification  
**Project:** DutyGraph, Tier 4 Intelligence  
**Status:** North Star, intended future capability  
**Version:** 1.0  
**Date:** October 17, 2026  
**Recommended filename:** `DUTYGRAPH-MEETING-OS-NORTH-STAR.md`

---

# 1. Executive Summary

DutyGraph is building an AI-readable operating model of an enterprise.

The platform discovers how a company operates, including its strategy, organizational structure, responsibilities, duties, tasks, workflows, systems, dependencies, constraints, decision rights, and opportunities for improvement.

One of the most important ways to acquire this information is through conversations with the people who understand the business.

Traditionally, those conversations require consultants, business analysts, forward-deployed engineers (FDEs), or implementation specialists to conduct interviews, facilitate workshops, ask follow-up questions, document findings, and translate unstructured human knowledge into structured organizational information.

This process is expensive, slow, inconsistent, and difficult to scale.

**Our vision is to build an intelligent Meeting Operating System inside DutyGraph that can plan, conduct, evaluate, and learn from enterprise conversations.**

The system will combine:

1. **Carson Tate's meeting methodology**, particularly the POWER framework and meeting classifications described in Chapter 14 of *Work Simply*.
2. **Generative AI**, which conducts conversations, interprets natural language, and asks intelligent follow-up questions.
3. **TypeSafe Jev**, a specialized decision model that makes bounded, structured judgments about meeting necessity, relevance, completeness, evidence sufficiency, and appropriate next steps.
4. **Deterministic software**, which enforces meeting rules, state transitions, deadlines, permissions, approvals, and data integrity.
5. **The DutyGraph operating model**, which provides enterprise context to the facilitator and receives validated outputs from every conversation.

The result should be much more than an AI note-taking application.

The AI should behave like a disciplined professional facilitator that understands why a meeting exists, who should participate, what information is needed, when to ask follow-up questions, and when the meeting has accomplished its purpose.

Every conversation should either advance the organization's knowledge, produce an actionable business outcome, or establish that no further meeting is necessary.

## Fundamental product thesis

**An AI should not merely attend meetings. It should understand how to conduct them, know when they are unnecessary, and convert their outcomes into reliable organizational intelligence.**

We envision this as a reusable platform capability, with DutyGraph discovery as its first major application.

---

# 2. Background: Why DutyGraph Needs This

## 2.1 The enterprise knowledge problem

Every organization possesses enormous amounts of operational knowledge that is rarely captured in a usable format.

Employees know:

- What they are responsible for.
- What tasks they perform.
- Which systems they use.
- Who they depend on.
- Where bottlenecks occur.
- Which processes are undocumented.
- Where workarounds exist.
- Which approvals are required.
- Which tasks require human judgment.
- What exceptions occur in normal operations.

Leadership understands other dimensions:

- Strategic objectives.
- Revenue and cost priorities.
- Business constraints.
- Expansion or acquisition plans.
- Competitive pressures.
- Investment priorities.
- Desired outcomes over the next 6, 12, and 18 months.

This information is distributed across people, documents, software systems, and informal conversations.

DutyGraph exists to transform this fragmented knowledge into a connected, evidence-backed operating model.

A simplified representation is:

**Vision → Value Chain → Departments → Responsibilities → Duties → Tasks → Actions**

The model also captures systems, roles, dependencies, approvals, evidence, KPIs, exceptions, and relationships between organizational entities.

The ultimate goal is to create a machine-readable understanding of how the business works.

That understanding can support:

- Business process improvement.
- Technology consolidation.
- Operational efficiency analysis.
- AI automation opportunity discovery.
- Agent development.
- Agent permissions and governance.
- FDE implementation projects.
- Continuous organizational intelligence.

## 2.2 The discovery bottleneck

Human knowledge must be collected before it can be modeled.

Typical approaches rely on:

- Executive interviews.
- Departmental workshops.
- Employee questionnaires.
- Process-mapping sessions.
- Consultant-led discovery.
- Follow-up meetings.
- Manual transcript analysis.
- Repeated validation cycles.

An effective consultant uses judgment throughout this process.

For example, when an employee says:

"I handle vendor onboarding."

A strong interviewer recognizes that this statement is incomplete.

The interviewer might ask:

- What starts the onboarding process?
- Who requests a new vendor?
- What information do you receive?
- What systems do you open?
- Which approvals do you need?
- What happens when something is missing?
- Who takes over after your part is complete?
- What happened the last time onboarding went wrong?

The difference between a superficial answer and an operationally useful answer is the quality of the follow-up questions.

Our system should encode this interviewing skill.

## 2.3 Our strategic opportunity

DutyGraph could eventually conduct large portions of organizational discovery without requiring a consultant to personally interview every employee.

A single advisor could initiate discovery for an organization.

The Meeting OS would then coordinate executive sessions, department interviews, asynchronous conversations, evidence validation, and targeted follow-ups.

The advisor would review the results instead of manually conducting every conversation.

**This is how DutyGraph moves from a labor-intensive consulting methodology toward a scalable enterprise intelligence platform.**

---

# 3. Intellectual Foundation: Carson Tate

## 3.1 Who is Carson Tate?

Carson Tate is a productivity consultant, executive coach, and author of *Work Simply: Embracing the Power of Your Personal Productivity Style*.

Her work focuses on helping individuals and organizations become more productive by designing working practices around how people think, communicate, and execute.

A particularly relevant section of her book is Chapter 14, **Lead a Meeting Revolution**.

The central idea is that meetings should not be treated as automatic or obligatory.

Organizations should question whether a meeting is necessary, what it should accomplish, who must participate, and how the conversation should be structured.

This philosophy aligns directly with DutyGraph's goal of reducing organizational inefficiency.

### Important distinction

The following sections contain two kinds of material:

**Carson Tate concepts:** The POWER framework, six meeting categories, meeting-necessity evaluation, relevant participant roles, and productivity-style communication considerations.

**DutyGraph extensions:** AI judgment engines, software state machines, graph integration, evidence scoring, adaptive interviews, and automated outcome verification.

These extensions are our proposed product design, not claims that Tate's book describes AI software architecture.

---

# 4. The POWER Framework

Carson Tate's POWER framework provides the governing structure for effective meetings.

POWER stands for:

- **P: Purpose**
- **O: Outcomes**
- **W: Who**
- **E: Execution**
- **R: Responsibility**

Our objective is to translate each principle into explicit application behavior.

## 4.1 P: Purpose

Every meeting needs a legitimate reason to exist.

The purpose answers:

- Why are we meeting?
- What business problem are we addressing?
- What information or decision is needed?
- How does the meeting support a business objective?
- Could the same result be achieved without holding a meeting?

### DutyGraph implementation

Every meeting must have a structured `MeetingPurpose`.

Potential fields:

- Purpose statement.
- Linked business objective.
- Linked workflow, department, or task.
- Requested outcome.
- Source of the meeting request.
- Information already available.
- Information that remains missing.
- Reason synchronous participation is necessary.

The Meeting OS should reject, redirect, or flag meetings with insufficiently defined purposes.

An AI judgment can recommend whether a meeting is necessary, but the user should retain the ability to override the recommendation.

### Example

An advisor requests a meeting with the purchasing department to learn what software they use.

DutyGraph already has a verified inventory of the department's applications.

Instead of automatically creating a meeting, the system should evaluate whether specific information is still missing.

It might conclude:

"The software inventory is already documented. The remaining questions concern approval workflows and vendor exceptions. An asynchronous interview with the purchasing manager is more appropriate."

The meeting has been replaced with a more efficient information-gathering method.

This is a successful outcome for the Meeting OS.

## 4.2 O: Outcomes

A productive meeting has a defined result.

The outcome should not simply be "discuss vendor onboarding."

A stronger outcome would be:

"Document the vendor onboarding workflow, identify its decision points, and confirm the responsibility for each stage."

### DutyGraph implementation

Each meeting should define expected deliverables.

Examples:

- A documented process.
- A validated responsibility.
- An approved decision.
- A list of unresolved questions.
- A new Task Card.
- A confirmed dependency.
- A set of assigned actions.
- A clarified strategic objective.

The system should measure whether these outcomes were achieved.

An important distinction is that completing a meeting is not equivalent to achieving its outcomes.

Meetings may close with some objectives unresolved.

Those objectives must remain visibly open.

## 4.3 W: Who

The right participants should attend, and unnecessary participants should be excluded.

Carson Tate identifies four useful participant roles:

1. **Decision maker:** Has authority to make the required decision.
2. **Influencer:** Helps gain organizational alignment or support.
3. **Resource person:** Provides necessary knowledge or expertise.
4. **Executor:** Carries out the resulting work.

One person may fulfill multiple roles.

### DutyGraph implementation

The organizational graph can provide information about:

- Job roles.
- Reporting structures.
- Functional responsibilities.
- Decision authority.
- Process ownership.
- Task dependencies.
- Subject matter expertise.

The Meeting OS should use this information to recommend participants.

However, organizational position must not automatically be treated as decision authority.

For example, a department manager may understand a purchasing process but lack authority to change the enterprise purchasing policy.

The system must distinguish:

- Subject matter expertise.
- Process ownership.
- Decision authority.
- Execution responsibility.

Where authority is unknown, the meeting system must ask for confirmation rather than invent it.

## 4.4 E: Execution

Execution describes how the meeting progresses toward its intended outcomes.

The system should not merely generate an agenda and assume participants will follow it.

It needs a controlled facilitation process.

### DutyGraph implementation

The Meeting OS should manage:

- Opening the meeting.
- Establishing purpose and boundaries.
- Presenting relevant context.
- Asking initial questions.
- Gathering evidence.
- Identifying missing information.
- Asking follow-up questions.
- Managing disagreements.
- Confirming conclusions.
- Closing the session.

The agenda should be structured while allowing the conversation to adapt.

The AI must be able to investigate unexpected but relevant information without losing the original purpose.

A deterministic meeting controller should manage phases and transitions.

The generative AI should decide how to phrase questions within those boundaries.

## 4.5 R: Responsibility

Meetings often fail because participants leave without a clear understanding of who owns the next steps.

### DutyGraph implementation

Action items should include:

- Action description.
- Responsible person or role.
- Decision authority, where applicable.
- Due date or review trigger.
- Dependencies.
- Acceptance criteria.
- Evidence of completion.
- Current status.

A participant mentioning a possible action should not automatically create an accepted commitment.

The system should distinguish suggested, proposed, assigned, accepted, and completed actions.

For example:

AI facilitator:

"Before we finish, we identified a need to confirm which team owns vendor compliance reviews. Who should take responsibility for resolving that?"

The system records an assignment only after appropriate confirmation.

---

# 5. The Six Meeting Categories

Carson Tate identifies six broad meeting types.

Our system should represent these as distinct facilitation playbooks.

The classification is important because a brainstorming meeting should not be conducted like a decision-making meeting.

| Meeting Type | Primary Objective | Facilitation Behavior | Expected Output |
|---|---|---|---|
| Informational | Communicate knowledge | Present, clarify, confirm understanding | Information distributed or acknowledged |
| Decision-making | Select an option | Establish criteria, compare alternatives, confirm authority | Documented decision or explicit deferral |
| Problem-solving | Diagnose and resolve a problem | Gather facts, investigate causes, evaluate interventions | Problem definition and action plan |
| Brainstorming | Generate possibilities | Encourage divergent ideas before evaluation | Organized idea set |
| Team-building | Improve coordination and relationships | Facilitate participation and shared understanding | Agreements or team actions |
| Instructional / Skill-building | Transfer knowledge or build capability | Demonstrate, practice, verify understanding | Learning or competency evidence |

These are foundational categories, not mutually exclusive descriptions of every meeting.

A meeting might contain multiple phases.

For example, a problem-solving workshop might begin with information gathering, move into diagnosis, and conclude with a decision.

The application should support a primary meeting type and explicitly declared secondary phases.

## 5.1 Meeting-specific facilitation rules

### Informational

Before scheduling a synchronous meeting, determine whether an email, document, recorded explanation, or asynchronous briefing would achieve the outcome.

If synchronous discussion is required, reserve the conversation for clarification and alignment.

### Decision-making

The facilitator should establish:

- The decision to be made.
- Who has authority.
- Which criteria matter.
- What options exist.
- Which facts remain uncertain.
- Whether stakeholders have been heard.

A recommendation is not an approved decision.

The system must preserve the difference.

### Problem-solving

The facilitator should distinguish symptoms, evidence, hypotheses, possible causes, and interventions.

It should avoid prematurely proposing solutions before the problem is sufficiently understood.

### Brainstorming

Separate idea generation from evaluation.

Do not suppress unusual suggestions simply because they initially appear impractical.

Collect ideas before applying feasibility criteria.

### Team-building

Focus on shared understanding, participation, expectations, and collaboration.

The AI should not make psychological or personality diagnoses about participants.

### Instructional

Identify the learning objective and determine whether synchronous instruction is necessary.

Verify understanding through suitable exercises or confirmation rather than treating attendance as proof of competence.

---

# 6. Communication Styles and Adaptive Facilitation

Another useful component of Tate's work is her four productivity-style model.

The styles are:

- **Prioritizer:** Often emphasizes facts, goals, and results.
- **Planner:** Often emphasizes steps, structure, and execution.
- **Arranger:** Often emphasizes people, relationships, and collaboration.
- **Visualizer:** Often emphasizes strategy, connections, and the broader picture.

The meeting system can use this as inspiration for communication flexibility.

For example, an explanation can be structured around four dimensions:

| Dimension | Key Question |
|---|---|
| What | What are we accomplishing? |
| How | How will it work? |
| Who | Who is involved or affected? |
| Why | Why does it matter? |

The facilitator should understand all four dimensions.

It might adapt the level of detail based on a participant's expressed preferences.

However, it should not infer or permanently assign personality types based on brief conversations.

Any stored communication preference should be explicitly provided or confirmed by the participant.

**North-star behavior:** The AI communicates in a way that helps the participant provide clear, accurate information rather than forcing everyone through an identical interview style.

---

# 7. Meeting Necessity: The Meeting Gate

Before conducting a meeting, the system should determine whether one is required.

This is one of the highest-value opportunities for Jev.

## 7.1 Decision outcomes

The system should support at least these routes:

1. **No interaction needed:** The requested outcome is already satisfied.
2. **Asynchronous communication:** Send an update, question, or document.
3. **Individual AI interview:** Conduct a targeted conversation with one participant.
4. **Synchronous meeting:** Bring multiple participants together when real-time interaction is useful.
5. **Human escalation:** Route a sensitive, ambiguous, or high-stakes matter to an authorized person.

These routes are recommendations that must be evaluated against deterministic policy.

## 7.2 What the system evaluates

- Is the purpose sufficiently defined?
- Is relevant information already available?
- Is the information current?
- Is a decision required?
- Does the decision require discussion between multiple parties?
- Are multiple departments affected?
- Is there conflicting evidence?
- Is the matter sensitive?
- Can asynchronous responses satisfy the information need?
- Does the requester have authority to initiate the proposed interaction?

The system should optimize for the **least disruptive method that can achieve the required outcome**, subject to privacy, governance, and quality requirements.

This does not mean maximizing meeting avoidance at the expense of collaboration.

Sometimes the correct decision is to bring people together.

---

# 8. The Meeting Lifecycle

We envision a structured lifecycle controlled by an explicit state machine.

## 8.1 Pre-meeting states

### REQUESTED

A meeting or interview has been proposed.

Inputs include the requester, business context, expected outcome, and candidate participants.

### EVALUATING

The system evaluates necessity, meeting category, existing evidence, participant requirements, and policy constraints.

### ROUTED

The system selects an approved interaction format:

- No meeting.
- Asynchronous inquiry.
- AI individual interview.
- Facilitated group meeting.
- Human-led meeting.

### PREPARING

The system generates a meeting brief.

This includes:

- Purpose.
- Desired outcomes.
- Meeting type.
- Participants and roles.
- Known information.
- Evidence gaps.
- Agenda or interview plan.
- Expected output artifacts.
- Completion criteria.

### READY

Required preparation, authorization, and participant access are complete.

## 8.2 In-session states

### OPENING

Explain the purpose, expected duration, recording or transcription arrangements, and how the results will be used.

### CONTEXT

Confirm relevant background information.

Avoid repeatedly asking participants for information DutyGraph already possesses.

### ELICITATION

Ask planned and adaptive questions.

### PROBING

Explore specific ambiguities, exceptions, missing details, or potential contradictions.

### RECONCILIATION

Summarize what was learned and ask for corrections or clarifications.

### COMMITMENTS

Confirm decisions, next steps, and responsibility where appropriate.

### CLOSING

Verify whether the planned outcomes were met, explain outstanding questions, and conclude.

## 8.3 Post-meeting states

### EXTRACTING

Transform the transcript and other artifacts into structured candidate records.

### REVIEW_PENDING

Present proposed findings to the appropriate participant, advisor, or organizational owner.

### APPROVED / PARTIALLY_APPROVED

Commit authorized changes to the canonical DutyGraph model.

Unapproved changes remain proposed.

### COMPLETE

Store the meeting record, deliver the appropriate summary, and schedule authorized follow-ups.

## 8.4 Exception states

The design must also support:

- Paused.
- Rescheduled.
- Cancelled.
- Participant disconnected.
- Recording unavailable.
- Consent withdrawn.
- Requires human facilitator.
- Insufficient evidence.
- Technical failure.

Interrupted sessions should preserve authorized work without pretending the original objectives were accomplished.

Every state transition should be controlled and auditable.

---

# 9. The Intelligent Facilitator

## 9.1 What makes the AI different from a chatbot?

A conventional chatbot primarily responds to user messages.

Our facilitator should be driven by:

1. An explicit objective.
2. A structured meeting playbook.
3. Current meeting state.
4. Existing organizational knowledge.
5. Missing information.
6. Evidence sufficiency.
7. Permitted next actions.
8. Completion criteria.

The facilitator should not generate arbitrary questions.

It should pursue the information required to complete the meeting's objectives.

## 9.2 Core behavioral rules

The AI should:

- Speak naturally and professionally.
- Explain why information is being requested.
- Ask one focused question at a time when appropriate.
- Avoid overly long introductions.
- Allow participants to finish their thoughts.
- Distinguish facts from assumptions.
- Ask for concrete examples.
- Avoid leading questions.
- Recognize uncertainty.
- Avoid inventing missing details.
- Detect and investigate inconsistencies without becoming confrontational.
- Avoid repeatedly asking equivalent questions.
- Keep the meeting aligned with its purpose.
- Recognize when sufficient evidence has been obtained.
- Summarize conclusions for confirmation.
- End when the legitimate purpose has been fulfilled.

The AI should not try to extract every imaginable detail from every participant.

It should pursue the information most useful to the current discovery objective.

## 9.3 Dynamic follow-up behavior

Example:

**Facilitator:** "Walk me through the last time you onboarded a new vendor."

**Employee:** "Sales sends us a request, and we put the vendor into our system."

**Facilitator:** "What information is usually included in that request?"

**Employee:** "The vendor name, pricing, and contract."

**Facilitator:** "What happens when the contract is missing?"

**Employee:** "We send it back to sales."

**Facilitator:** "How do you send it back, and how do you track that it's been resolved?"

This sequence reveals:

- An upstream dependency.
- Required inputs.
- A software interaction.
- An exception path.
- A potential communication bottleneck.
- A possible workflow automation opportunity.

The application should capture these findings incrementally.

The facilitator may then transition to the next missing aspect of the workflow.

## 9.4 Question prioritization

The system should prefer questions that:

- Resolve important uncertainty.
- Establish task sequence.
- Reveal missing decision rights.
- Identify critical dependencies.
- Clarify exception handling.
- Validate conflicting claims.
- Support a downstream business decision.
- Reduce the need for future follow-up.

The system should avoid spending substantial time collecting low-value details while critical workflow gaps remain unresolved.

---

# 10. DutyGraph Discovery Playbooks

The general-purpose Meeting OS will support multiple meeting types.

Its first substantial integration should focus on DutyGraph's discovery process.

The current canonical discovery journey is:

**Public Research → Executive Kickoff → Team Discovery → Solution Analysis**

The Meeting OS primarily supports Executive Kickoff and Team Discovery, with possible later applications throughout the product.

It is a cross-cutting capability, not a replacement for the four-stage discovery model.

## 10.1 Executive Kickoff

### Purpose

Understand the organization's direction, priorities, operating structure, and major business constraints.

### Information sources

Before the kickoff, DutyGraph should review:

- Public company research.
- Company Snapshot.
- Sponsor Packet.
- Existing organizational information.
- Executive preparation responses.
- Known systems and business relationships.
- Existing strategic assumptions.

### Key topics

1. What is the company's primary business model?
2. What are its major sources of value?
3. What outcomes matter over the next 6, 12, and 18 months?
4. Is leadership primarily trying to grow, improve profitability, consolidate operations, prepare for acquisition, or pursue another objective?
5. Which departments or functions are most important to those goals?
6. Where does leadership believe operational friction exists?
7. Which current initiatives require investigation?
8. Who has the knowledge or authority needed for the next discovery stages?

These are discussion objectives, not a script the AI must read word for word.

### Expected outputs

- Strategic objective records.
- Initial value-chain hypotheses.
- Department and role confirmations.
- Known constraints.
- Priority areas.
- Discovery participants.
- Unresolved assumptions.
- Proposed next questions.

The system should distinguish executive beliefs about operations from confirmed observations of actual workflows.

## 10.2 Department Leader Interview

### Purpose

Understand what the department is accountable for and how its work connects to the larger organization.

### Investigation areas

- Department mission.
- Major responsibilities.
- Recurring duties.
- Key processes.
- KPIs.
- Software and vendors.
- Upstream inputs.
- Downstream outputs.
- Approval requirements.
- Internal dependencies.
- Known constraints.
- Improvement opportunities.

### Expected outputs

- Department responsibility map.
- Preliminary duty inventory.
- Workflow candidates.
- System relationships.
- Dependency records.
- Open questions requiring employee validation.

## 10.3 Employee Task Discovery

### Purpose

Discover how work is actually performed.

The interview should move through:

**Responsibility → Duty → Task → Trigger → Inputs → Actions → Decisions → Exceptions → Outputs → Handoffs**

The employee should be encouraged to describe a recent real example.

### Important interviewing principle

Do not rely exclusively on questions about what someone might do in a hypothetical situation.

Real examples provide stronger evidence of actual workflows.

### Example question progression

- What is a task you perform regularly?
- Tell me about the most recent time you completed it.
- What triggered that work?
- What did you receive?
- What was your first action?
- Which system did you use?
- What happened next?
- Did anyone need to approve something?
- What would cause the process to stop or fail?
- Who received your completed work?
- How did you know the task was finished?

### Expected outputs

- Task candidates.
- Action sequences.
- Input and output definitions.
- Exception paths.
- System interactions.
- Decision checkpoints.
- Human dependencies.
- Supporting evidence.
- Candidate Task Cards.

## 10.4 Targeted Verification Interview

### Purpose

Resolve specific uncertainties or conflicting claims.

Example:

The sales manager says vendor onboarding normally takes one day.

The operations manager says it takes four days.

Instead of silently selecting an answer, the Meeting OS should ask targeted questions to understand the discrepancy.

Perhaps the participants are measuring different start and end points.

The resulting model should preserve both claims until the discrepancy is resolved.

## 10.5 Continuous Refresh Interview

DutyGraph should not stop collecting information after initial discovery.

Future events might trigger targeted questions:

- A new employee joins.
- A process owner changes.
- Software is replaced.
- A new approval step appears.
- A workflow becomes obsolete.
- An AI agent assumes part of a task.
- A KPI deteriorates.
- The organization announces a new initiative.

The system should ask only the questions necessary to update affected parts of the operating model.

---

# 11. AI Architecture: Three Distinct Responsibilities

A critical design principle is the separation of conversational intelligence, judgment, and authority.

We do not want one generative model controlling every aspect of the application.

## 11.1 Layer One: Generative Intelligence

**Primary function:** Natural language interaction and synthesis.

Potential providers include Claude, OpenAI, and other models with suitable conversational or speech capabilities.

Responsibilities:

- Conduct dialogue.
- Generate conversational questions.
- Interpret participant responses.
- Extract candidate claims.
- Summarize evidence.
- Explain ambiguous concepts.
- Rephrase questions.
- Prepare proposed graph changes.
- Produce human-readable meeting summaries.

The generative model can propose actions but must not be the final authority for authorization, evidence approval, or persistent graph modification.

## 11.2 Layer Two: Jev / Decision Intelligence

**Primary function:** Bounded, typed judgments.

Jev is TypeSafe's System One model.

It is designed to evaluate explicit questions against supplied state and return structured answers.

Its relevant primitives are:

**Choice:** Selects from defined options.

**Score:** Evaluates a state against an ordered rubric.

**Noul:** Produces a probability for a yes-or-no judgment.

Jev does not need to generate the conversation.

It can evaluate the conversation.

Potential responsibilities:

- Determine meeting necessity.
- Classify meeting type.
- Evaluate question relevance.
- Assess answer specificity.
- Detect possible contradictions.
- Identify insufficient evidence.
- Classify missing information.
- Evaluate whether to ask a follow-up.
- Recommend the next authorized interview action.
- Assess readiness to close a meeting.

Each judgment should address one narrow question.

Complex decisions should be decomposed into smaller judgments and combined by application logic.

### Important architectural constraint

Questions submitted in the same Jev request are evaluated independently against their supplied state.

Do not assume that one answer in a batch influences another answer in the same batch.

For dependent decisions, compose the results in code and perform a subsequent evaluation when necessary.

## 11.3 Layer Three: Deterministic Application Services

**Primary function:** Enforce facts, rules, permissions, and state.

Examples:

- Meeting lifecycle transitions.
- Session time limits.
- Scheduling.
- User and organization permissions.
- Recording consent.
- Role-based access.
- Approval authority.
- Action assignment.
- Required-field validation.
- Source-reference validation.
- Graph mutation rules.
- Arithmetic.
- KPI calculations.
- Policy thresholds.
- Version control.
- Audit logging.

**The AI can judge. Software must enforce. Humans retain authorized decision rights.**

This separation is non-negotiable.

---

# 12. Jev Decision Inventory

The Meeting OS should maintain a versioned library of bounded judgments.

The following are proposed examples.

| Judgment | Primitive | Question |
|---|---|---|
| Meeting necessity | Noul | Does the requested outcome genuinely require synchronous interaction? |
| Meeting type | Choice | Which approved meeting category best describes the purpose? |
| Answer specificity | Score | How operationally specific is this answer? |
| Answer relevance | Noul | Does this response address the current question? |
| Clarification needed | Noul | Is a material ambiguity unresolved? |
| Contradiction suspected | Noul | Does this statement materially conflict with existing evidence? |
| Missing information | Choice | Which missing information category should be investigated next? |
| Follow-up priority | Score | How valuable is additional investigation of this gap? |
| Closure readiness | Noul | Have the defined information objectives been sufficiently addressed? |
| Human escalation | Noul | Does this situation require an authorized human facilitator or reviewer? |

These judgments should produce recommendations and evaluation signals, not unrestricted instructions to the AI.

## 12.1 Example: evaluating an employee answer

The facilitator asks:

"What starts the monthly reconciliation process?"

The employee replies:

"I usually just check everything at the end of the month."

The application may ask Jev to evaluate:

- Is the trigger explicit?
- Is the answer relevant?
- Does the answer specify the responsible role?
- Is a follow-up necessary?

The application could conclude that the trigger is not yet sufficiently documented.

It then permits the generative facilitator to ask:

"When you say the end of the month, is there a scheduled reminder, an incoming report, or something else that tells you to begin?"

The important distinction:

**Jev evaluates the evidence gap. The generative model phrases the question. Deterministic code controls what is permitted next.**

## 12.2 Example: proposed decision request

The following is an illustrative Jev-style request shape. Exact API compatibility must be checked against the chosen provider and SDK during implementation.

```json
{
  "state": {
    "meeting_type": "task_discovery",
    "question": "What triggers monthly reconciliation?",
    "answer": "I usually just check everything at the end of the month.",
    "required_field": "trigger",
    "known_evidence": []
  },
  "questions": {
    "trigger_is_explicit": {
      "type": "noul",
      "instructions": "Does the answer clearly identify the operational event or schedule that starts the task?"
    },
    "answer_specificity": {
      "type": "score",
      "instructions": "Rate how specific this answer is for documenting the task trigger.",
      "criteria": [
        "No usable information",
        "Vague description",
        "Partially specific",
        "Specific and actionable",
        "Specific with supporting example"
      ]
    },
    "missing_detail": {
      "type": "choice",
      "instructions": "Identify the primary unresolved detail.",
      "criteria": {
        "schedule": "The exact timing or recurring schedule is missing",
        "event": "The event that initiates the process is missing",
        "initiator": "The person or system initiating the process is missing",
        "none": "No material detail is missing"
      }
    }
  }
}
```

The application should interpret the responses using defined policy.

It should not treat a probability as proof that an employee's statement is true.

## 12.3 Confidence and evidence quality

We must distinguish three separate concepts:

1. **Model judgment probability:** The likelihood attached to a bounded Jev judgment.
2. **Evidence support:** How strongly available source material supports a proposed organizational claim.
3. **Discovery coverage:** How much of the required organizational information has been collected and reviewed.

These are not interchangeable.

A Jev model may be highly confident that an employee's answer contains a specific workflow step.

That does not prove the workflow is correct or officially approved.

Evidence support depends on the source, relevance, recency, corroboration, and contradiction status.

Coverage should be calculated from explicit requirements and their statuses.

Unknown information must remain unknown, not become zero or an assumed fact.

Thresholds should be calibrated against test cases, not chosen simply because a number looks reasonable.

---

# 13. The Meeting Controller

A dedicated service should govern the meeting lifecycle.

Suggested conceptual architecture:

```text
DutyGraph Business State
        |
        v
Meeting Planner
        |
        v
Necessity / Routing Decisions (Jev)
        |
        v
Deterministic Policy Gate
        |
        v
Meeting Brief and Playbook
        |
        v
Meeting State Controller
        |
        +--> Generative Voice/Text Facilitator
        |
        +--> Transcript / Evidence Capture
        |
        +--> Jev Judgment Service
        |
        +--> Deterministic Rules / Permissions
        |
        v
Structured Findings
        |
        v
Graph Delta Proposals
        |
        v
Participant Review / Authorized Approval
        |
        v
Canonical DutyGraph
        |
        v
Follow-ups / Task Cards / Opportunities
```

## 13.1 Controller responsibilities

The controller should know:

- Which meeting is active.
- Which phase is active.
- Which objectives have been addressed.
- Which required information remains missing.
- Which questions have already been asked.
- Which evidence has been captured.
- Which decisions need confirmation.
- Whether the session is permitted to close.

The generative facilitator should receive a bounded context capsule appropriate to the current moment rather than unlimited access to the entire organizational database.

## 13.2 Facilitator action vocabulary

Rather than allowing unrestricted actions, the application could expose a controlled action set:

```text
ASK_QUESTION
ASK_FOLLOW_UP
REQUEST_EXAMPLE
CLARIFY_AMBIGUITY
SUMMARIZE_FINDING
CONFIRM_FINDING
TRANSITION_TOPIC
FLAG_CONTRADICTION
REQUEST_HUMAN_REVIEW
PARK_TOPIC
RECOMMEND_CLOSURE
CLOSE_SESSION
```

The decision layer may recommend an action.

The policy layer validates whether that action is available in the current state.

The generative layer then executes the conversational portion.

## 13.3 Versioned facilitator policies

Every meeting should record which versions of the following were used:

- Meeting playbook.
- Facilitator instructions.
- Judgment configuration.
- Decision model.
- Generative model.
- Evidence rubric.
- Closure policy.

This allows us to compare facilitator performance over time and investigate unexpected behavior.

A global prompt change should not make old meeting results impossible to explain.

---

# 14. Canonical Data Model

The following is a conceptual schema, not an instruction to immediately create these database tables.

Claude Code should inspect the existing DutyGraph architecture before deciding which entities already exist.

## 14.1 MeetingDefinition

Represents a reusable meeting playbook.

Fields:

```text
id
name
meeting_type
version
purpose_template
required_inputs
required_participant_roles
agenda_stages
required_outputs
facilitation_policy
closure_policy
escalation_policy
```

## 14.2 MeetingSession

Represents an actual meeting.

```text
id
organization_id
meeting_definition_id
requested_by
purpose
linked_objectives
status
planned_start
actual_start
actual_end
participant_ids
meeting_brief_id
policy_version
```

## 14.3 MeetingObjective

Represents something the session is intended to accomplish.

```text
id
meeting_id
description
priority
required_evidence
coverage_status
completion_status
review_status
```

## 14.4 ConversationTurn

Represents a participant or facilitator utterance.

```text
id
meeting_id
speaker_id
speaker_role
timestamp_start
timestamp_end
content
input_modality
transcript_status
source_reference
```

Input modality might be voice, typed text, or another approved format.

Original wording should be preserved when it serves as evidence.

## 14.5 MeetingJudgment

Records a bounded evaluation.

```text
id
meeting_id
judgment_type
input_reference
model_provider
model_version
question_version
result
probabilities
policy_result
timestamp
```

## 14.6 EvidenceRecord

Represents information supporting a claim.

```text
id
organization_id
source_type
source_reference
speaker_id
claim_reference
captured_at
observed_at
evidence_status
review_status
```

Examples of evidence sources:

- Participant statement.
- Reviewed transcript.
- Document.
- Public research.
- Software system record.
- Authorized human verification.

## 14.7 GraphDelta

Represents a proposed change to the company's operating model.

```text
id
organization_id
target_entity
operation
proposed_value
supporting_evidence_ids
proposed_by
participant_review_status
advisor_approval_status
applied_version
```

A GraphDelta is a proposal, not an automatic change to the canonical operating model.

## 14.8 ActionItem

```text
id
meeting_id
description
owner
due_date
acceptance_criteria
status
approval_status
dependencies
```

All entities should respect organization, participant, and role boundaries.

---

# 15. Evidence Preservation and Human Approval

This is a core DutyGraph principle.

The AI must not convert statements directly into unquestionable organizational truth.

Consider the statement:

"We never require manager approval for refunds under $500."

The system should preserve:

- Who said it.
- When they said it.
- Where it was recorded.
- The surrounding context.
- Whether the speaker has authority.
- Whether the statement conflicts with existing policy.
- Whether a relevant owner has confirmed it.

The model should distinguish:

**Observed:** Directly recorded evidence exists.

**Inferred:** A model has proposed an interpretation.

**Participant-confirmed:** The speaker has confirmed the interpretation.

**Approved:** The appropriate organizational authority has accepted it into the canonical model.

These states must not collapse into one another.

Participant confirmation does not automatically equal organizational approval.

### Example

An employee explains an undocumented workaround.

The facilitator extracts the steps into a proposed Task Card.

The employee reviews and corrects the description.

The department owner then reviews the Task Card for formal acceptance.

Until approval, the proposed Task Card remains separate from the authoritative process definition.

This protects DutyGraph from silently institutionalizing mistakes or unauthorized workarounds.

---

# 16. Integration with Task Cards and Agent Development

One of the most valuable outputs of discovery interviews is the Task Card.

A Task Card should describe how a task is performed in enough detail that another person or an authorized AI implementation system can understand it.

Possible content:

- Purpose.
- Business context.
- Owner.
- Trigger.
- Preconditions.
- Required inputs.
- Systems used.
- Step-by-step actions.
- Decision rules.
- Approval requirements.
- Exceptions.
- Outputs.
- Handoffs.
- Completion criteria.
- Relevant KPIs.
- Supporting evidence.
- Known unknowns.

The Meeting OS should progressively collect the information needed to construct these artifacts.

### Why this matters

A conversation might begin with:

"I process expense reimbursements."

After intelligent interviewing, DutyGraph could possess a much more complete representation of the task.

That representation could reveal:

- Opportunities for automation.
- Controls requiring human approval.
- Existing software dependencies.
- A possible bottleneck.
- Potential consolidation opportunities.
- What an FDE needs to build an automation.
- What permissions a future AI agent would require.

This connects meeting facilitation directly to DutyGraph's broader goal of producing implementation-ready enterprise knowledge.

The Meeting OS is therefore both a discovery interface and a mechanism for creating structured operational assets.

---

# 17. Voice, Mobile, and Asynchronous Interaction

The ideal participant experience should not require employees to use a complex desktop application.

DutyGraph's broader discovery vision includes a mobile companion application.

Participants could receive a secure invitation and access their interview through a personalized link or QR-based onboarding flow.

The interface should support:

- Natural voice conversation.
- Typed responses.
- Transcript review.
- Pausing and resuming where allowed.
- Clarification of previous responses.
- Confirmation of extracted findings.
- Notifications for genuinely missing information.

## 17.1 Voice architecture

A possible pipeline:

```text
Participant Speech
        |
        v
Speech Recognition
        |
        v
Transcript and Source Capture
        |
        v
Meeting State / Context
        |
        v
Jev Evaluation + Policy
        |
        v
Generative Facilitator
        |
        v
Text-to-Speech
        |
        v
Participant
```

This is a conceptual pipeline.

Actual architecture may use streaming speech-to-speech or other low-latency approaches.

The important requirement is not a specific vendor.

It is the separation between conversational behavior, structured judgments, and application authority.

## 17.2 Asynchronous discovery

A participant should be able to complete targeted discovery without attending a live group meeting.

The facilitator could ask a few questions, record answers, assess sufficiency, and follow up when necessary.

Once the person's assigned objectives are satisfied, routine discovery notifications should stop.

Future re-engagement should be triggered by meaningful organizational changes, incomplete requirements, or approved refresh policies.

## 17.3 Connection reliability

Voice sessions require explicit handling of:

- Network interruption.
- Speech transcription errors.
- Participant interruption.
- Lost recording permission.
- Device changes.
- Backgrounded mobile apps.
- Audio capture cancellation.
- Session resumption.

The system must never claim to have captured speech that was lost.

Participant-edited answers must preserve provenance and must not silently validate other unreviewed fields.

---

# 18. Meeting Completion: Knowing When to Stop

A key differentiator will be the facilitator's ability to determine when further discussion provides diminishing value.

Meeting completion should depend on explicit objectives rather than a predetermined number of questions.

## 18.1 Closure evaluation

Before recommending closure, the system should evaluate:

- Were required objectives addressed?
- Was sufficient evidence collected?
- Are important contradictions unresolved?
- Were necessary participant confirmations obtained?
- Are decisions accurately recorded?
- Are responsibilities assigned where required?
- Is any additional information needed before downstream action?

Some objectives may remain incomplete.

The system should support partial completion with a documented follow-up plan.

## 18.2 Completion does not mean perfection

Not every interview needs to produce a complete, implementation-ready workflow.

An early discovery session might achieve its purpose by establishing:

- Which task exists.
- Who performs it.
- What the broad process looks like.
- Who should be interviewed next.

The system should recognize completion relative to the actual meeting's objectives.

## 18.3 Avoid endless interrogation

The AI must not continue asking questions simply because more questions can be generated.

It should recognize when:

- The answer is sufficient.
- The participant does not know.
- Another person is better positioned to answer.
- The question is outside the current scope.
- The remaining information is not worth the immediate interruption.

The desired behavior resembles an efficient, well-prepared human facilitator.

---

# 19. Example End-to-End Scenario

## Scenario: Vendor Onboarding Discovery

An advisor is mapping operations for a 1,000-employee company.

### Step 1: Existing knowledge

DutyGraph already knows:

- The company has procurement, finance, sales, and legal functions.
- A vendor-management platform is installed.
- Procurement owns part of vendor onboarding.
- The actual approval workflow is poorly documented.

### Step 2: Meeting request

The advisor requests:

"Map the entire vendor onboarding process."

### Step 3: Meeting Gate

The system determines that the objective cannot be satisfied from existing evidence.

Rather than scheduling a large workshop immediately, it recommends individual discovery interviews with the process owner and relevant operational participants.

### Step 4: Interview preparation

DutyGraph prepares a meeting brief.

Known facts and unresolved hypotheses are separated.

A discovery playbook is selected.

### Step 5: AI interview

The facilitator interviews the procurement manager.

It asks about a recent onboarding case.

The participant describes:

- A sales request.
- Procurement review.
- Legal approval.
- Finance system entry.
- Vendor activation.

### Step 6: Evidence assessment

The system identifies missing information about:

- Legal approval thresholds.
- Rejected requests.
- System permissions.
- Finance handoff requirements.

Jev evaluates which gaps require clarification.

### Step 7: Adaptive probing

The facilitator investigates the highest-priority gaps.

It discovers that certain vendors require additional compliance checks.

### Step 8: Contradiction

An existing document indicates that all vendors require legal review.

The procurement manager says small vendors are exempt.

DutyGraph records the conflict without inventing a resolution.

### Step 9: Targeted follow-up

The system proposes a short verification interview with an authorized legal representative.

### Step 10: Structured outputs

The meeting generates:

- Workflow nodes.
- Responsibility relationships.
- Approval checkpoints.
- Exception paths.
- System dependencies.
- Proposed Task Cards.
- Evidence references.
- Unresolved questions.

### Step 11: Review and approval

Participants review their statements.

The appropriate authority approves the accepted model changes.

### Step 12: Downstream use

DutyGraph identifies that repeated manual data entry may be an automation opportunity.

An FDE can review the associated Task Card, systems, permissions, exception cases, and evidence before preparing an implementation plan.

**The outcome is not merely a meeting summary. It is an improved, evidence-backed representation of how the company operates.**

---

# 20. Evaluation and Quality Assurance

The Meeting OS must be evaluated against human-reviewed cases before high-autonomy deployment.

We should not assume that conversational fluency equals facilitation competence.

## 20.1 Evaluation dimensions

### Meeting routing

- Correct meeting-versus-async recommendations.
- Unnecessary meetings avoided.
- Necessary human interactions preserved.
- Incorrect routing frequency.

### Interview effectiveness

- Required information captured.
- Relevant follow-up quality.
- Missing evidence detection.
- Question redundancy.
- Participant burden.
- Time required to reach objectives.

### Evidence integrity

- Unsupported claims introduced.
- Incorrect claim attribution.
- Missing provenance.
- Contradictions silently removed.
- Incorrect graph modifications.
- Participant confirmation accuracy.

### Governance

- Unauthorized decisions blocked.
- Approval requirements respected.
- Recording consent enforced.
- Cross-organization data isolation.
- Escalations handled correctly.

### Business outcomes

- Consultant discovery time reduced.
- Time to a validated workflow map.
- Number of follow-up meetings required.
- Percentage of reviewed Task Cards accepted.
- Time from discovery to an actionable improvement opportunity.
- Time required for FDE implementation preparation.

These metrics should be measured, not invented for product demonstrations.

## 20.2 Required test scenarios

At minimum, test:

- A clear answer.
- A vague answer.
- An incomplete answer.
- A contradictory answer.
- An employee who does not know.
- A participant who changes their answer.
- A process with multiple exceptions.
- A process with undocumented workarounds.
- A decision requiring absent authority.
- A meeting that should have been an email.
- A meeting that should be escalated to a human.
- A participant requesting that the session stop.
- A transcription failure.
- A voice disconnection.
- An attempted unauthorized graph update.
- A participant attempting to confirm information outside their authority.

Test cases should include genuinely ambiguous examples, not only easy demonstrations.

Jev decisions must be evaluated against independent human-reviewed labels.

Decision thresholds should be tuned against the consequences of incorrect routing.

---

# 21. Security, Privacy, and Enterprise Trust

The Meeting OS will handle sensitive organizational conversations.

A serious enterprise implementation requires appropriate controls.

Important requirements include:

- Authentication and participant-scoped access.
- Organization-level data isolation.
- Role-based authorization.
- Recording and transcription consent.
- Configurable retention rules.
- Audit trails for accepted changes.
- Separation of raw evidence from model interpretations.
- Restrictions on sensitive content exposure.
- Appropriate treatment of confidential business information.
- Human approval for consequential organizational decisions.

The AI must not interpret conversation content as instructions to override security policies.

For example, an employee saying "just update the workflow as approved" does not grant the AI permission to bypass the actual approval process.

Meeting content is evidence to analyze, not a trusted source of software authority.

---

# 22. Product Experience and Interface Vision

The Meeting OS should eventually have a dedicated experience within DutyGraph.

Possible screens include:

## Meeting Center

A view showing:

- Proposed meetings.
- Scheduled meetings.
- Active sessions.
- Asynchronous interviews.
- Pending participant reviews.
- Unresolved meeting outcomes.
- Completed sessions.

## Meeting Builder

The user defines:

- Desired outcome.
- Business context.
- Participants.
- Constraints.

The system recommends:

- Whether a meeting is necessary.
- Appropriate format.
- Meeting type.
- Participants.
- Suggested agenda.
- Expected outputs.

## Live Facilitator

A voice-first conversational interface with:

- Current meeting purpose.
- Facilitator voice interaction.
- Transcript access.
- Objective progress.
- Pending questions.
- Session controls.

The participant experience should remain simple.

Internal confidence assessments and complex state information belong primarily in an advisor or administrator view.

## Meeting Results

A structured output view presenting:

- Summary.
- Decisions.
- Responsibilities.
- New evidence.
- Proposed graph changes.
- Conflicting information.
- Open questions.
- Task Cards.
- Required approvals.

## Meeting Intelligence

A future analytics view could show where an organization spends unnecessary time in meetings and where collaboration fails to produce actionable results.

This could create additional opportunities for organizational improvement beyond the initial discovery use case.

---

# 23. Long-Term Strategic Expansion

Although the first application is DutyGraph discovery, the architecture should support broader use.

## 23.1 General enterprise meetings

A future version could facilitate:

- Process improvement workshops.
- Incident reviews.
- Operational planning sessions.
- Project kickoff meetings.
- Cross-functional decision meetings.
- Technology evaluation meetings.
- Continuous improvement reviews.

## 23.2 Meeting intelligence connected to enterprise intelligence

A major long-term opportunity is linking the content of meetings to the state of the business.

Consider an organization that holds a meeting about missed customer service targets.

DutyGraph already knows:

- Which department owns customer service.
- Which processes affect response times.
- Which systems are involved.
- Which employees own key tasks.
- Which KPIs are underperforming.
- Which prior interventions were attempted.

The Meeting OS can use this context to prepare a much more informed problem-solving meeting.

After the meeting, it can track approved actions and subsequent performance.

This closes the loop:

**Business State → Meeting → Evidence → Decision → Action → Measured Outcome → Updated Business State**

The meeting becomes part of the enterprise's continuous intelligence system.

## 23.3 Relationship to FDE execution

The system can also help FDEs prepare for implementation.

Instead of manually gathering requirements through repeated workshops, an FDE could request targeted clarification about a Task Card or workflow.

The Meeting OS would find the appropriate subject matter expert and conduct a focused interview.

The result would be a proposed update to the implementation specification.

This creates a reusable operational bridge between discovery and execution.

---

# 24. Implementation Roadmap

This is a north-star capability. It should be delivered incrementally.

## Phase 0: Preserve the vision and map existing capabilities

Before building new infrastructure:

1. Inspect the current DutyGraph repository.
2. Identify the existing discovery, interview, evidence, transcript, and Task Card functionality.
3. Identify the existing Jev/TypeSafe integration, if implemented.
4. Document reusable components.
5. Identify architecture gaps.
6. Produce an implementation plan without changing working functionality.

**Deliverable:** Current-state assessment and architectural roadmap.

## Phase 1: AI Discovery Facilitator

Focus on individual interviews.

Build or extend:

- Interview definitions.
- Meeting objectives.
- Question selection.
- Evidence extraction.
- Transcript provenance.
- Basic sufficiency evaluation.
- Participant review.
- Proposed graph changes.

**Success criterion:** An AI can conduct a targeted discovery interview and produce reviewed, usable workflow information.

## Phase 2: Jev-Guided Facilitation

Add typed decision support for:

- Answer relevance.
- Ambiguity detection.
- Missing information.
- Follow-up priority.
- Closure readiness.

Use human-labeled examples to evaluate performance.

**Success criterion:** The system asks better follow-up questions, avoids unnecessary repetition, and recognizes when objectives are complete.

## Phase 3: POWER Meeting Framework

Add the broader meeting-planning and management capabilities:

- Meeting necessity.
- Purpose definition.
- Outcome contracts.
- Participant selection.
- Meeting classifications.
- Structured execution.
- Responsibility capture.

**Success criterion:** The application can plan a meeting according to explicit rules rather than generating an arbitrary agenda.

## Phase 4: Multi-Participant Facilitation

Introduce:

- Group meeting orchestration.
- Participant roles.
- Turn management.
- Multi-party contradiction handling.
- Decision authority verification.
- Meeting-specific playbooks.

**Success criterion:** The AI can facilitate controlled multi-participant sessions while respecting human decision rights.

## Phase 5: Continuous Meeting Intelligence

Connect meetings to:

- Graph refresh.
- KPI changes.
- Approved actions.
- Operational outcomes.
- Automated follow-up.
- Enterprise improvement analytics.

**Success criterion:** Meeting outcomes are linked to observable organizational changes.

---

# 25. Architectural Non-Negotiables

The following principles should guide all future implementation decisions.

### 1. The graph is the permanent asset

The meeting engine is a way to build and maintain the DutyGraph.

It should not become an isolated transcript archive.

### 2. The facilitator must use existing context

Do not repeatedly ask questions that have already been sufficiently answered.

### 3. Never confuse fluency with factual correctness

A plausible AI-generated summary is not necessarily supported evidence.

### 4. Jev judges, but does not govern

Typed model judgments inform application decisions.

They do not grant authority.

### 5. Deterministic code enforces rules

Permissions, approvals, state transitions, calculations, and validation belong in application services.

### 6. Humans retain organizational authority

The application must preserve review and approval boundaries.

### 7. Unknown is a legitimate state

Missing information must not be filled in with fabricated certainty.

### 8. Contradictions are valuable signals

Disagreements may reveal real process differences.

Preserve them until properly reconciled.

### 9. Meetings must have explicit outcomes

A conversation without a meaningful purpose should not be automatically scheduled.

### 10. Favor minimal participant burden

Gather information efficiently and avoid unnecessary interruptions.

### 11. Preserve source provenance

Every meaningful claim should be traceable to its origin.

### 12. Build provider-neutral interfaces

Do not deeply couple the orchestration logic to a single generative model, speech provider, or decision model.

### 13. Version the rules

Meeting playbooks, prompts, judgment rubrics, and closure policies must be auditable and testable.

### 14. Do not manufacture ROI

All business impact calculations must distinguish estimated, observed, and realized results.

### 15. Design for reuse

The Meeting OS should be usable across discovery, operations, governance, and future enterprise meeting workflows.

---

# 26. Open Architectural Decisions

These decisions should be addressed through research and implementation planning rather than prematurely locked into this context document.

1. Which existing DutyGraph services should own meeting orchestration?
2. Which speech provider offers the best voice latency and transcription reliability?
3. Should the first meeting controller be a conventional state machine or a more specialized workflow engine?
4. Where should session state be persisted?
5. How should session recovery work after interruptions?
6. Which Jev judgments improve quality enough to justify their complexity?
7. Which judgments should run per answer, per topic, or per meeting?
8. What rubric defines sufficient task discovery?
9. Which meeting classifications require specialized human oversight?
10. How should the system handle sensitive or confidential employee disclosures?
11. Which outputs need participant confirmation versus formal owner approval?
12. When should the AI move from an individual interview to a multi-participant meeting?
13. How should meeting costs and measurable business impact be tracked?
14. How should we test multiple facilitator models against identical scenarios?
15. Should the broader Meeting OS eventually become a separately offered product?

These decisions should be documented when resolved.

---

# 27. Instructions to Claude Code and Future Development Agents

This document defines the intended long-term vision for the DutyGraph Meeting Operating System.

It is important product context.

It is not a directive to immediately build every feature described.

When working on related functionality:

1. **Read this document before making architectural decisions** affecting interviews, meeting orchestration, voice facilitation, evidence collection, or meeting-derived graph changes.

2. **Inspect the current repository.** Do not assume that proposed structures already exist or that earlier implementation notes describe the current state.

3. **Reuse existing architecture where appropriate.** Avoid unnecessary duplicate services, schemas, and screens.

4. **Preserve the existing discovery workflow.** The Meeting OS should complement DutyGraph's four-stage discovery journey.

5. **Separate vision from implementation status.** A described future capability is not evidence that it has been implemented.

6. **Maintain the three-layer AI architecture.** Generative intelligence, bounded judgment, and deterministic enforcement must remain distinguishable.

7. **Protect canonical data.** AI-extracted information must pass through the appropriate evidence and approval process before changing accepted organizational records.

8. **Favor incremental milestones.** Each implementation phase should produce independently testable value.

9. **Record significant design decisions.** When technical or product choices are made, update the relevant architecture or decision records.

10. **Preserve the north-star objective.** Do not reduce the feature to transcription, summaries, or a conventional chatbot simply because those features are easier to implement.

When asked to implement a specific part of the Meeting OS, first explain how it fits into the broader architecture and what existing components can support it.

---

# 28. What Success Looks Like

Imagine a business advisor who wants to understand how a company operates.

The advisor initiates discovery inside DutyGraph.

The system reviews available company information and identifies what it already knows.

It prepares the executive kickoff.

It interviews leadership.

It identifies the departments and people needed for deeper discovery.

It contacts those participants through a simple voice or text interface.

It asks intelligent, contextual questions.

It detects missing information.

It follows up only where necessary.

It records evidence.

It generates structured workflows and Task Cards.

It identifies contradictions and requests clarification.

It presents proposed changes for review.

It updates the company's operating model after appropriate approval.

It creates a foundation for diagnosing inefficiencies, comparing solutions, and implementing appropriately governed AI agents.

The entire experience should feel like the organization is being interviewed by a knowledgeable, well-prepared professional who learns from every interaction.

But unlike a human consultant who may leave the organization with scattered notes and slide decks, this system continuously contributes to an enduring, versioned operating model.

**This is the north-star feature: an intelligent meeting and interview engine that turns organizational conversations into a living, evidence-backed understanding of the business.**

---

# 29. The Principle to Remember

> The purpose of the Meeting OS is not to hold better meetings for the sake of better meetings.
>
> It is to help an organization acquire reliable knowledge, make better decisions, assign responsibility, and improve the way it operates.
>
> Sometimes the best meeting is one that never happens.
>
> Sometimes the best interview is a two-minute conversation.
>
> Sometimes a single carefully chosen follow-up question reveals an operational problem that has existed for years.
>
> DutyGraph should know the difference.

---

# 30. Reference Material

The following resources provide supporting context for the methodology and decision architecture.

**Carson Tate**

- Carson Tate, *Work Simply: Embracing the Power of Your Personal Productivity Style*, Chapter 14, *Lead a Meeting Revolution*.
- Carson Tate, "How to Have More Effective Team Meetings": https://www.linkedin.com/pulse/how-have-more-effective-team-meetings-carson-tate
- CIO, "How to Keep Meetings From Eating Into Your Bottom Line", discussion of Tate's POWER framework: https://www.cio.com/article/246250/how-to-keep-meetings-from-eating-into-your-bottom-line.html

**TypeSafe / Jev**

- Official TypeSafe documentation: https://docs.typesafe.ai/introduction
- Jev is a structured decision model that supports bounded questions and typed results.
- API versions, SDK behavior, limits, pricing, and model availability should be independently verified during integration.

**DutyGraph internal context**

Relevant companion documents should include:

- DutyGraph Master Vision.
- DutyGraph Discovery Architecture.
- Executive Kickoff specifications.
- Participant Interview / Mobile Companion specifications.
- Business State and Evidence Graph specifications.
- Task Card specifications.
- Agent Governance architecture.
- FDE Build Packet architecture.

The Meeting OS should evolve in alignment with these materials.

---

**End of document**

**North-star classification:** Strategic Product Capability  
**Primary initial use case:** DutyGraph Discovery  
**Long-term opportunity:** Enterprise Meeting Intelligence and Autonomous Facilitation  
**Implementation approach:** Incremental, evidence-backed, governed, and provider-neutral
