import { Redirect, useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function PulseConversationRoute() {
  const { pulseId, sessionId, input } = useLocalSearchParams<{ pulseId: string; sessionId?: string; input?: string }>();
  // Opened without a session (e.g. a stale link): start from the intro.
  if (!sessionId) return <Redirect href={{ pathname: '/pulse/[pulseId]', params: { pulseId } }} />;
  return <ConversationScreen sessionId={sessionId} initialInput={input === 'voice' ? 'voice' : 'text'} />;
}
