import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ReviewScreen } from '@/features/handsfree';

/** Here's what we heard (hf-19), with Sending and Send failed in place (hf-20, hf-22). */
export default function QuestionsReviewRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  return <ReviewScreen requestId={requestId} />;
}
