import { businessProfileSchema, businessTemplates } from "./business-types.ts";

export const discoveryPromptVersion = "discovery-context-v6-channel-models-v1";
const groupProbes: Record<string, string> = {
  General:
    "Identify the customer or beneficiary, the unit of work, the promise made and how completion is recognized.",
  Services:
    "Trace an engagement or service request from scope and scheduling to delivery acceptance, billing and repeat work. Separate expert judgment from preparation.",
  Technology:
    "Trace a customer from purchase through provisioning, service delivery, support and renewal. Distinguish recurring service work from product development and change approval.",
  Commerce:
    "Trace an order from demand and availability through fulfillment, returns and settlement. Separate buying, inventory, selling and approval responsibilities.",
  Production:
    "Trace a job or batch from forecast and materials through production, quality checks, release and delivery. Capture rework, traceability and maintenance dependencies.",
  "Built environment":
    "Trace a project or property request through scope, estimate, commitment, scheduling, delivery and acceptance. Identify changes, subcontractor dependencies and inspection decisions.",
  Transport:
    "Trace a shipment or fulfillment order through booking, capacity, dispatch, tracking, proof of delivery and billing. Identify custody transfers and exception owners.",
  "Consumer services":
    "Trace a booking or customer visit through preparation, service, payment and follow-up. Identify shift handovers, capacity limits and recovery from service failures.",
  "Care & education":
    "Trace a beneficiary journey through intake, eligibility, scheduling, service and outcome follow-up. Identify the limits of professional decisions. Use anonymized examples.",
  "Financial services":
    "Trace an application or transaction through checks, decision, execution and reconciliation. Separate evidence preparation, authorization and independent review. Do not use customer account data.",
  "Public & mission":
    "Trace a service or program from need and eligibility through funding, delivery and outcome reporting. Use beneficiary and mission outcomes, not an assumed sales funnel.",
};
const modelProbes: Record<string, string> = {
  "it-procurement-advisory":
    "Follow 1 closed client opportunity from origin and requirements through provider comparison, contracting, activation, support and renewal. Separate employees, independent agents, affiliates, suppliers and end clients. Confirm reporting lines separately from support relationships and real information handoffs. Agents can work independently in parallel. Do not invent agent-to-agent dependencies. Who owns the account, approves the selection, delivers the service and receives payment? Confirm fees, commissions, agent splits, earning events and exceptions. Do not assume client invoicing.",
  "technology-services-distributor":
    "Follow 1 advisor opportunity through supplier selection, engineering, quoting, deal registration, order acceptance, activation and renewal. Trace advisor onboarding and supplier portfolio management separately. Separate independent advisors, distributor employees, suppliers and end clients. Do not infer employee reporting lines for advisors or dependencies between advisors. Who contracts with whom, and who delivers the service? Trace supplier statements and receipts through reconciliation, disputed commissions and advisor payouts. Name the real inputs, recipients, approval owners and exceptions. Do not assume inventory fulfillment.",
  "custom-software":
    "Trace a commissioned build from requirements and scope through estimation, client approval, development, testing, release acceptance and maintenance. Separate advisory recommendations from an authorized build. Identify the scope, the acceptance criteria and the owner of that handoff. Do not assume subscription billing or SaaS provisioning.",
  saas: "What happens at signup, onboarding, provisioning, support escalation, release approval, usage billing and renewal? Which tasks belong to customer success, and which belong to engineering?",
  "managed-it":
    "Follow a service ticket, access request and change request separately. What are the triage rules, service commitments, escalation owners and approval checkpoints?",
  wholesale:
    "Follow a customer order and a supplier update separately. How do availability, purchasing, credit checks, picking, shipment and invoice matching depend on each other?",
  manufacturing:
    "Follow a production order through material readiness, scheduling, assembly, inspection, release and shipment. Where do bills of material, quality holds and rework change the task?",
  advisory:
    "Follow an engagement from diagnosis and proposal through evidence collection, analysis, client review, deliverable acceptance and follow-up. Which decisions remain with the client?",
};

/** What the kickoff plan already has (GET …/kickoff/plan `known`). */
export type KickoffKnown = {
  rosterCount?: number;
  departments?: string[];
  attendees?: string[];
  systems?: string;
  systemsList?: string[];
  streams?: string;
  goals?: string;
};
const listText = (xs: readonly string[], n = 6) =>
  xs.length > n ? `${xs.slice(0, n).join(", ")} and ${xs.length - n} more` : xs.join(", ");
/**
 * Topics start from what we already have (KICK-01-12): a returned roster,
 * systems list, streams or goals turn "provide the list" into "confirm it".
 */
function dynamicQuestions(id: string, fallback: [string, string], known?: KickoffKnown): [string, string] {
  if (!known) return fallback;
  if (id === "people" && known.rosterCount)
    return [
      `Confirm the imported team list (${known.rosterCount} ${known.rosterCount === 1 ? "person" : "people"}${known.departments?.length ? ` in ${listText(known.departments)}` : ""}). Is anyone missing, and who leads each department?`,
      "Which reporting lines in the team list are different from the people who do or approve the work? Who else outside the list must contribute?",
    ];
  if (id === "systems" && (known.systemsList?.length || known.systems))
    return [
      `Confirm the systems the sponsor listed (${known.systemsList?.length ? listText(known.systemsList) : known.systems}). Who owns each system, and which is the source of truth? What is missing?`,
      fallback[1],
    ];
  if (id === "goals" && known.goals)
    return [`The sponsor wrote: "${known.goals.slice(0, 200)}". Confirm or change these goals. For each goal, name its owner, measure, baseline and review date.`, fallback[1]];
  if (id === "business" && known.streams)
    return [`The sponsor named these business streams: "${known.streams.slice(0, 200)}". Confirm them and name any that are missing.`, fallback[1]];
  return fallback;
}
/** Templates guide questions, never establish facts about this company. */
export function kickoffGuide(profile: unknown, known?: KickoffKnown) {
  const parsed = businessProfileSchema.safeParse(profile);
  const streams = parsed.success ? parsed.data.streams : [];
  const models = streams.map((stream, index) => {
    const template = businessTemplates.find((t) => t.id === stream.templateId);
    return {
      id: stream.id,
      engagementFocus: index === 0 ? "primary" : "supporting",
      name: stream.name,
      model: template?.label || "Custom operating model",
      stages: stream.stages.map((s) => s.name),
      probe:
        modelProbes[stream.templateId] ||
        groupProbes[template?.group || "General"],
    };
  });
  const sections = [
    {
      id: "business",
      title: "Business model and value flows",
      questions: [
        "What do you provide, to whom, and what result do they value? Confirm or correct the proposed business type. Name any different business streams.",
        "Choose a recent order, engagement, service or program. Follow it from the first request to delivery, payment or funding, and support. What is the unit of completed work?",
      ],
    },
    {
      id: "goals",
      title: "Goals and evidence of success",
      questions: [
        "What should change in 1 month, 6 months and 1 year? For each goal, name its owner, measure, current baseline (if known), target and review date.",
        "Which problem matters most, and who feels it? What evidence can separate its cause from a symptom? Mark estimates and unknown baselines clearly.",
      ],
    },
    {
      id: "people",
      title: "Departments, people and reporting",
      questions: [
        "Name the purpose and leader of each department. Include support teams such as IT, finance and HR. Who is in scope, and who else must contribute?",
        "Provide names, work emails, job roles, departments and reporting managers. Bring the team list CSV if you have it. Separate reporting lines from responsibility for work.",
      ],
    },
    {
      id: "duties",
      title: "Responsibilities under each role",
      questions: [
        "For each department and role, list the ongoing duties and the outcomes they keep. Who is accountable, and who does the work? Identify shared or disputed responsibility.",
        "Which daily, weekly or event-driven tasks produce the outcomes of each duty? Include support work, exceptions and less visible administrative work.",
      ],
    },
    {
      id: "tasks",
      title: "One concrete task walkthrough",
      questions: [
        "Choose a typical task. Name its trigger, its input data or documents and their sender. Name its ordered actions, software, checkable result and recipient. What must a replacement colleague know?",
        "Where does preparation end and a decision, system update or handoff begin? What happens when information is missing, inconsistent or late? Ask employees to write the detailed procedures later.",
      ],
    },
    {
      id: "handoffs",
      title: "Dependencies and delays",
      questions: [
        "At each department boundary, who sends what to whom? Through which channel, by when and with which acceptance check? Who resolves a rejected or missing handoff?",
        "Where do work queues, duplicate checks, rework or unowned decisions appear? Ask for examples and timing or volume evidence. Do not record a possible constraint from opinion alone.",
      ],
    },
    {
      id: "systems",
      title: "Software, information and decision boundaries",
      questions: [
        "Which systems and records support each flow? Identify the source of truth, system owner, spreadsheets, manual transfers and types of sensitive information. Do not share secrets.",
        "Which steps need a named person, an independent check, an SOP or an approval? Who can check the access and delegation rules? Existing access does not give permission to delegate the step to an agent.",
      ],
    },
    {
      id: "followup",
      title: "Agree the discovery follow-up",
      questions: [
        "Confirm the department, role and duties of each participant for their voice-first interview. Who supplies the missing names, emails, SOPs, examples and workflow evidence, and by when?",
        "Agree on scope exclusions, completion timing and the findings meeting. An employee's task approval records their understanding. The advisor and the team resolve differences after that.",
      ],
    },
  ];
  return {
    version: discoveryPromptVersion,
    models,
    sections: sections.map((s) => ({ ...s, questions: dynamicQuestions(s.id, [s.questions[0], s.questions[1]], known) })),
    profileMissing: !parsed.success,
  };
}

export function composeKickoffNotes(
  profile: unknown,
  answers: Record<string, string>,
  transcript: string,
) {
  const guide = kickoffGuide(profile);
  const captured = guide.sections.filter((s) => answers[s.id]?.trim());
  const uncaptured = guide.sections.filter((s) => !answers[s.id]?.trim());
  if (!captured.length) return transcript.trim();
  return [
    "Executive kickoff — advisor-reviewed notes",
    ...captured.map((s) => `${s.title}\n${answers[s.id].trim()}`),
    transcript.trim()
      ? `Meeting transcript / additional notes\n${transcript.trim()}`
      : "",
    uncaptured.length
      ? "Coverage note: sections not separately captured may be present in the transcript. Check before treating them as missing: " +
        uncaptured.map((s) => s.title).join("; ")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
