import { useLocalSearchParams } from 'expo-router';
import { ReviewScreen } from '@/features/conversation/ReviewScreen';

export default function SessionReviewRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <ReviewScreen sessionId={sessionId} />;
}
