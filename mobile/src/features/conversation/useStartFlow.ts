/**
 * The one way screens start a conversation (Pulse, Discovery, Clarification,
 * Something Changed). It creates or resumes the server session, then:
 *
 * - text: opens the conversation directly;
 * - voice: opens the conversation if the participant already consented to
 *   the microphone disclosure on this device, otherwise the consent screen
 *   (/permissions/microphone?sessionId=…), which continues to the
 *   conversation or offers "Type instead".
 *
 * Microphone activation is always user-initiated: nothing here opens the
 * microphone; the conversation screen does, after the participant is there.
 */
import { router } from 'expo-router';
import { useStartConversation } from '@/hooks/queries';
import { usePreferencesStore } from '@/state/preferences';
import { showToast } from '@/state/ui';
import { errorMessage } from '@/components/common/States';
import { track } from '@/analytics/events';
import type { ChangeKind, ConversationMode, Id } from '@/types/domain';
import { conversationHref, type InputModeParam } from './routes';

export interface StartFlowInput {
  requestId: Id;
  mode: ConversationMode;
  input: InputModeParam;
  changeKind?: ChangeKind;
  clarificationOptionId?: Id;
  /** Replace the current screen instead of pushing (e.g. from an intro that should not stay in history). */
  replace?: boolean;
}

export function useStartFlow() {
  const start = useStartConversation();
  const consented = usePreferencesStore((s) => s.micConsented);

  const begin = async (i: StartFlowInput) => {
    try {
      const session = await start.mutateAsync({
        requestId: i.requestId,
        mode: i.mode,
        changeKind: i.changeKind,
        clarificationOptionId: i.clarificationOptionId,
      });
      if (i.mode === 'PULSE') track('pulse_started', { input: i.input });
      if (i.input === 'voice') track('voice_started', { mode: i.mode });
      const nav = i.replace ? router.replace : router.push;
      if (i.input === 'voice' && !consented) {
        nav({ pathname: '/permissions/microphone', params: { sessionId: session.id } });
      } else {
        nav(conversationHref(session, i.input));
      }
      return session;
    } catch (e) {
      showToast({ title: "Couldn't start", body: errorMessage(e) });
      return undefined;
    }
  };

  return { begin, isPending: start.isPending };
}
