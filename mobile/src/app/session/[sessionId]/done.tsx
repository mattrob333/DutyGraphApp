import { useLocalSearchParams } from 'expo-router';
import { DoneScreen } from '@/features/conversation/DoneScreen';

export default function SessionDoneRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <DoneScreen sessionId={sessionId} />;
}
