import { useEffect, useMemo } from 'react';
import { asMock, useRepository } from '@/api';
import { simulationFlags } from '@/state/simulation';
import { SimulatedVoiceCapture } from './SimulatedVoiceCapture';
import { RecordedClipCapture } from './RecordedClipCapture';
import { expoAudioSession, loadExpoAudio } from './audioSession';
import type { VoiceCapture } from './types';

/**
 * The voice capture for a conversation, picked by the repository kind. The
 * data source is fixed for the life of the app, so exactly one branch runs on
 * every render and hook order is stable.
 */
export function useVoiceCapture(sessionId: string): VoiceCapture {
  const repo = useRepository();
  const capture = repo.kind === 'http' ? useRecordedCapture(sessionId) : useSimulatedCapture(sessionId); // eslint-disable-line react-hooks/rules-of-hooks
  // Never leave the microphone open when the screen goes away.
  useEffect(() => () => capture.cancel(), [capture]);
  return capture;
}

function useSimulatedCapture(sessionId: string): VoiceCapture {
  const repo = useRepository();
  return useMemo(
    () =>
      new SimulatedVoiceCapture({
        sampleAnswer: () => asMock(repo)?.sampleAnswerFor(sessionId) ?? '',
        isDenied: () => simulationFlags().micDenied,
      }),
    [repo, sessionId],
  );
}

function useRecordedCapture(sessionId: string): VoiceCapture {
  const repo = useRepository();
  // expo-audio is loaded only for the http data source (it has no jest/web recorder and mock mode never records).
  const { RecordingPresets, useAudioRecorder } = loadExpoAudio();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  return useMemo(() => new RecordedClipCapture(recorder, expoAudioSession, repo, sessionId), [recorder, repo, sessionId]);
}
