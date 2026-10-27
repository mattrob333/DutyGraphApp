import type { FacilitatorTrigger } from "./facilitator";
export type AutomaticTurnSnapshot = {
  now: number;
  lastHumanAt: number;
  lastPlaybackEnd: number | null;
  playbackActive: boolean;
  hasLine: boolean;
  topicId: string | null;
  timeboxEnded: boolean;
};
/** A silence follow-up is eligible once per topic, after the actual question has finished. */
export function automaticFacilitatorTurn(
  snapshot: AutomaticTurnSnapshot,
  requested: ReadonlySet<string>,
): { key: string; trigger: FacilitatorTrigger } | null {
  if (snapshot.playbackActive) return null;
  const topic = snapshot.topicId ?? "no-topic";
  const candidates: { key: string; trigger: FacilitatorTrigger }[] = [];
  if (snapshot.timeboxEnded)
    candidates.push({ key: `timebox-${topic}`, trigger: "timebox_end" });
  if (!snapshot.hasLine)
    candidates.push({ key: "opening", trigger: "opening" });
  if (
    snapshot.hasLine &&
    snapshot.lastPlaybackEnd !== null &&
    snapshot.now - Math.max(snapshot.lastHumanAt, snapshot.lastPlaybackEnd) >=
      8000
  )
    candidates.push({ key: `silence-${topic}`, trigger: "silence" });
  return candidates.find((candidate) => !requested.has(candidate.key)) ?? null;
}
