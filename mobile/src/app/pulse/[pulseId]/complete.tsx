import { Redirect, useLocalSearchParams } from 'expo-router';
import { DoneScreen } from '@/features/conversation/DoneScreen';

export default function PulseCompleteRoute() {
  const { pulseId, sessionId } = useLocalSearchParams<{ pulseId: string; sessionId?: string }>();
  if (!sessionId) return <Redirect href={{ pathname: '/pulse/[pulseId]', params: { pulseId } }} />;
  return <DoneScreen sessionId={sessionId} pulseId={pulseId} />;
}
