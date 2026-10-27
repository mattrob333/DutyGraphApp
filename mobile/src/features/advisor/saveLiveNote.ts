import type { AdvisorRepository, TranscriptInput } from "@/api/advisor/types";
import { loadAdvisorDraft, saveAdvisorDraft } from "@/storage/advisor";
import { newId } from "@/utils/id";

/** Persist exact input before sending so a lost acknowledgment cannot duplicate evidence. */
export async function saveLiveNote(
  repository: Pick<AdvisorRepository, "transcript">,
  sessionId: string,
  text: string,
  personKey: string,
  atMs: number,
  commandKey: string,
): Promise<void> {
  const storageKey = `live-note.${sessionId}`;
  let pending = await loadAdvisorDraft<{
    commandKey: string;
    segment: TranscriptInput;
  }>(storageKey);
  if (!pending || pending.commandKey !== commandKey) {
    const id = newId();
    pending = {
      commandKey,
      segment: {
        id,
        sessionId,
        revision: 1,
        startMs: atMs,
        endMs: atMs + 1,
        text,
        personKey,
        speakerCluster: `N_${id}`,
        source: "live",
        committed: true,
      },
    };
    await saveAdvisorDraft(storageKey, pending);
  }
  await repository.transcript(sessionId, [pending.segment], commandKey);
  // Keep the receipt until a different command replaces it. If local command
  // acknowledgment fails after the HTTP response, retry must retain the same body.
}
