/**
 * Where a conversation's screens live. Pulse keeps its canonical PRD routes
 * (/pulse/:id/conversation, /review, /complete); every other mode uses the
 * generic /session/:id routes. Screens call these helpers instead of
 * building paths by hand.
 */
import type { Href } from 'expo-router';
import type { ConversationSession } from '@/types/domain';

export type InputModeParam = 'voice' | 'text';

export function conversationHref(s: Pick<ConversationSession, 'id' | 'mode' | 'source'>, input: InputModeParam): Href {
  if (s.mode === 'PULSE' && s.source) {
    return { pathname: '/pulse/[pulseId]/conversation', params: { pulseId: s.source.id, sessionId: s.id, input } };
  }
  return { pathname: '/session/[sessionId]', params: { sessionId: s.id, input } };
}

export function reviewHref(s: Pick<ConversationSession, 'id' | 'mode' | 'source'>): Href {
  if (s.mode === 'PULSE' && s.source) {
    return { pathname: '/pulse/[pulseId]/review', params: { pulseId: s.source.id, sessionId: s.id } };
  }
  return { pathname: '/session/[sessionId]/review', params: { sessionId: s.id } };
}

export function doneHref(s: Pick<ConversationSession, 'id' | 'mode' | 'source'>): Href {
  if (s.mode === 'PULSE' && s.source) {
    return { pathname: '/pulse/[pulseId]/complete', params: { pulseId: s.source.id, sessionId: s.id } };
  }
  return { pathname: '/session/[sessionId]/done', params: { sessionId: s.id } };
}
