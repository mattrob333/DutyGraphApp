import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SentScreen } from '@/features/handsfree';

/** You're done (hf-21), after the server acknowledged the send. */
export default function QuestionsSentRoute() {
  const { advisor, took } = useLocalSearchParams<{ requestId: string; advisor?: string; took?: string }>();
  return <SentScreen advisor={advisor} took={took} />;
}
