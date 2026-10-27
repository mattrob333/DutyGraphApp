import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function SessionConversationRoute() {
  const { sessionId, input } = useLocalSearchParams<{ sessionId: string; input?: string }>();
  return <ConversationScreen sessionId={sessionId} initialInput={input === 'voice' ? 'voice' : 'text'} />;
}
