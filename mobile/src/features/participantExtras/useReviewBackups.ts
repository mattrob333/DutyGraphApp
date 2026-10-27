import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRecorded } from "@shared/hands-free/recorded";
import { useParticipantExtrasRepository } from "@/api/extras";
import { createCardBackup } from "@/features/voice/cardBackup";
import { backupReplacement, type BackupClip } from "@/features/voice/backup";
import {
  captureDraftOwner,
  isDraftOwnerCurrent,
  draftFits,
  saveDraft,
  useDraftStore,
} from "@/features/handsfree/draft";
import type { QuestionSet } from "@/types/handsfree";
/** A recording cannot silently disappear or be omitted from a participant's final review. */
export function useReviewBackups(set: QuestionSet) {
  const repo = useParticipantExtrasRepository();
  const owner = useRef(captureDraftOwner()).current;
  const backup = useMemo(
    () =>
      createCardBackup(set.requestId, (clip) =>
        repo.transcribeCardBackup(clip),
      ),
    [set.requestId, repo],
  );
  const [clips, setClips] = useState<BackupClip[]>([]);
  const [loading, setLoading] = useState(!!backup);
  const [transcribing, setTranscribing] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void backup
      ?.pending()
      .then((items) => {
        if (alive) {
          setClips(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [backup]);
  const retry = useCallback(async () => {
    if (!backup || transcribing) return;
    setTranscribing(true);
    setFailed(false);
    try {
      await backup.flush(
        async (clip, text, isCurrent) => {
          if (!isDraftOwnerCurrent(owner) || isCurrent?.() === false) return;
          const draft = useDraftStore.getState().drafts[set.requestId];
          const index = set.questions.findIndex(
            (q) => q.key === clip.questionKey,
          );
          if (!draft || !draftFits(draft, set) || index < 0)
            throw new Error(
              "The questions changed. Your recording is still saved.",
            );
          const range = await backupReplacement(
            clip,
            draft.answers[index]?.raw ?? "",
          );
          if (!isDraftOwnerCurrent(owner) || isCurrent?.() === false) return;
          if (useDraftStore.getState().drafts[set.requestId] !== draft)
            throw new Error("Your answer changed. Try the recording again.");
          const answers = [...draft.answers];
          answers[index] = applyRecorded(
            answers[index],
            set.questions[index],
            range.replace,
            text,
            "voice_device",
            range.before,
          );
          await saveDraft({ ...draft, answers, understood: undefined }, owner);
        },
        (clip) =>
          isDraftOwnerCurrent(owner) &&
          set.questions.some((q) => q.key === clip.questionKey),
      );
    } catch {
      setFailed(true);
    } finally {
      try {
        setClips(await backup.pending());
      } catch {
        setFailed(true);
      }
      setTranscribing(false);
    }
  }, [backup, transcribing, set, owner]);
  const remove = useCallback(
    async (id: string) => {
      if (!backup || transcribing) return;
      try {
        await backup.remove(id);
        setClips(await backup.pending());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [backup, transcribing],
  );
  return { clips, loading, transcribing, failed, retry, remove };
}
