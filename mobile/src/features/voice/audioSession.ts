import type { CompanionRepository } from '@/api/repository';
import { simulationFlags } from '@/state/simulation';
import type { AudioSession } from './RecordedClipCapture';

/** Loaded lazily so mock mode, web and unit tests never touch the native recorder module. */
export function loadExpoAudio(): typeof import('expo-audio') {
  return require('expo-audio') as typeof import('expo-audio');
}

/** expo-audio backed session used by RecordedClipCapture (SDK 57 API). */
export const expoAudioSession: AudioSession = {
  async requestPermission() {
    const res = await loadExpoAudio().requestRecordingPermissionsAsync();
    return res.granted;
  },
  async setRecordingMode(on) {
    await loadExpoAudio().setAudioModeAsync({ allowsRecording: on, playsInSilentMode: on });
  },
};

export type MicPermission = 'granted' | 'denied';

/**
 * Asks the OS for microphone permission (only ever called from an explicit tap
 * on the consent screen). Mock mode honours the "Microphone blocked"
 * simulation toggle and never touches the OS.
 */
export async function requestMicPermission(repo: Pick<CompanionRepository, 'kind'>): Promise<MicPermission> {
  if (repo.kind === 'mock') return simulationFlags().micDenied ? 'denied' : 'granted';
  try {
    const res = await loadExpoAudio().requestRecordingPermissionsAsync();
    return res.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Current permission without prompting. */
export async function getMicPermission(repo: Pick<CompanionRepository, 'kind'>): Promise<MicPermission | 'undetermined'> {
  if (repo.kind === 'mock') return simulationFlags().micDenied ? 'denied' : 'granted';
  try {
    const res = await loadExpoAudio().getRecordingPermissionsAsync();
    return res.granted ? 'granted' : res.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}
