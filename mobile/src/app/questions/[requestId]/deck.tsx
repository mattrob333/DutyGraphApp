import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DeckScreen } from '@/features/handsfree';

/** The question cards (hf-05 … hf-18). `mode=text` when the person chose Type instead; `blocked=1` when the phone refused the microphone. */
export default function QuestionsDeckRoute() {
  const { requestId, mode, blocked } = useLocalSearchParams<{ requestId: string; mode?: string; blocked?: string }>();
  return <DeckScreen requestId={requestId} mode={mode === 'text' ? 'text' : mode === 'voice' ? 'voice' : undefined} micBlocked={blocked === '1'} />;
}
