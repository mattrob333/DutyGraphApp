import type { CompanionRepository } from "../repository";
import { mapPulse, pulseQuestionSet } from "./http";
import type {
  ParticipantExtrasRepository,
  TaskDecisionInput,
  TaskCardRecord,
  VoiceLinesInput,
  PulseDto,
} from "./types";
import {
  pendingTaskDecisions,
  removeTaskDecision,
  saveTaskDecision,
} from "./pending";
export const DEMO_TASK_CARDS: TaskCardRecord[] = [
  {
    id: "task-pickups",
    title: "Book carrier pickups",
    version: 1,
    hash: "a".repeat(64),
    state: "proposed",
    needsAttestation: true,
    reviewed: false,
    data: {
      duty: "Ship orders on time",
      purpose: "Get packed orders to the customer",
      trigger: "A pallet is packed",
      inputs: "The packing list from Dana",
      instructions:
        "1. Open the carrier portal\n2. Enter the pallet details\n3. Confirm the pickup window",
      systems: ["Carrier portal", "Google Sheets"],
      output: "A pickup booked for today",
      destination: "The dock team",
      humanGate: "Dana approves unusual freight charges",
    },
  },
  {
    id: "task-check-orders",
    title: "Check incoming orders",
    version: 1,
    hash: "b".repeat(64),
    state: "proposed",
    needsAttestation: true,
    reviewed: false,
    data: {
      duty: "Keep orders moving",
      trigger: "A new order arrives",
      inputs: "Customer order",
      instructions: "Check stock, delivery address and requested date.",
      systems: ["Order system"],
      output: "An order ready for the warehouse",
      destination: "Priya in the warehouse",
    },
  },
  {
    id: "task-records",
    title: "Keep shipment records",
    version: 1,
    hash: "e".repeat(64),
    state: "proposed",
    needsAttestation: true,
    reviewed: false,
    data: {
      duty: "Keep shipment details available",
      trigger: "A pickup is confirmed",
      inputs: "The booking reference",
      instructions:
        "Save the reference and pickup window in the shipment sheet.",
      systems: ["Carrier portal", "Google Sheets"],
      output: "A saved shipment record",
      destination: "The dock team",
    },
  },
];
export function demoPulseDto(id: string, complete = false): PulseDto {
  return {
    id,
    title: "Monday Operations Pulse",
    meetingId: "meeting-ops",
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    estimateMinutes: 3,
    version: 1,
    contentHash: "c".repeat(64),
    state: complete ? "complete" : "sent",
    companyName: "Cobalt",
    advisorName: "Alex Rivera",
    questions: [
      {
        text: "Last Monday you said the carrier API was blocking rollout. Is that still unresolved?",
        short: "Your earlier blocker",
      },
      { text: "What changed in your work this week?", short: "What changed" },
      {
        text: "What does the team need from you next, and when?",
        short: "Your next step",
      },
    ],
  };
}
export class MockParticipantExtrasRepository implements ParticipantExtrasRepository {
  async getConfirmation(id: string) {
    return {
      id,
      meetingId: id,
      title: "Operations review",
      items: [
        {
          id: "confirm-pickup",
          proposalId: "proposal-pickup",
          text: "Confirm the carrier pickup window by Tuesday.",
          kind: "action",
          version: 1,
          hash: "d".repeat(64),
        },
      ],
    };
  }
  async decideConfirmation(
    _input: import("./types").ConfirmationDecisionInput,
  ) {}
  async checkCoverage() {
    return { available: false as const, reason: "LOCAL_ONLY" };
  }
  async getConfig() {
    return {
      speakQuestions: true,
      followUps: "table" as const,
      autoAdvance: false,
      liveTranscription: false,
    };
  }
  private decisions = new Set<string>();
  constructor(private repo: CompanionRepository) {}
  async transcribeCardBackup() {
    return {
      text: "I check the carrier portal, then share the pickup window with Priya.",
    };
  }
  async getVoiceLines(_input: VoiceLinesInput) {
    return { lines: [] };
  }
  async getVoiceDownloadHeaders(): Promise<Record<string, string>> {
    return {};
  }
  async createLiveTranscriptionGrant() {
    return { available: false as const, reason: "MOCK_DEVICE_VOICE" };
  }
  async getTaskCards(_id: string) {
    return DEMO_TASK_CARDS.map((c) => ({ ...c, data: { ...c.data } }));
  }
  async decideTaskCard(input: TaskDecisionInput) {
    await saveTaskDecision(input);
    await removeTaskDecision(input.idempotencyKey);
    this.decisions.add(input.taskCardId);
    if (DEMO_TASK_CARDS.every((c) => this.decisions.has(c.id)))
      (
        this.repo as CompanionRepository & {
          markTaskCardReviewComplete?: () => void;
        }
      ).markTaskCardReviewComplete?.();
    return { acknowledged: true, pending: false, taskCardId: input.taskCardId };
  }
  getPendingTaskDecisions = pendingTaskDecisions;
  async retryPendingTaskDecisions() {
    return Promise.all(
      (await pendingTaskDecisions()).map((i) => this.decideTaskCard(i)),
    );
  }
  async getPulse(id: string) {
    try {
      return await this.repo.getPulse(id);
    } catch {
      return mapPulse(demoPulseDto(id));
    }
  }
  async getPulseQuestions(id: string) {
    return pulseQuestionSet(demoPulseDto(id));
  }
  getTeamStatus(id: string) {
    return this.repo.getTeamStatus(id);
  }
  submitPulse: ParticipantExtrasRepository["submitPulse"] = (input) =>
    this.repo.submitAnswers(input);
}
