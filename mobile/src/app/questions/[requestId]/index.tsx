import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { IntroScreen } from '@/features/handsfree';

/** Question cards intro (hf-03). Today's request card and the notification open this route. */
export default function QuestionsIntroRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  return <IntroScreen requestId={requestId} />;
}
