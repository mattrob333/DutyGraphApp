import { Redirect, useLocalSearchParams } from 'expo-router';
import { ReviewScreen } from '@/features/conversation/ReviewScreen';

export default function PulseReviewRoute() {
  const { pulseId, sessionId } = useLocalSearchParams<{ pulseId: string; sessionId?: string }>();
  if (!sessionId) return <Redirect href={{ pathname: '/pulse/[pulseId]', params: { pulseId } }} />;
  return <ReviewScreen sessionId={sessionId} />;
}
