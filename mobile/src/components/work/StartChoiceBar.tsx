import React from 'react';
import { BottomActionBar, Button } from '@/components/common';

/** "Start with voice" / "Type instead" (shared by Discovery and Something changed). */
export function StartChoiceBar({ onStart, busy }: { onStart: (input: 'voice' | 'text') => void; busy?: boolean }) {
  return (
    <BottomActionBar>
      <Button label="Start with voice" kind="primary" loading={busy} onPress={() => onStart('voice')} />
      <Button label="Type instead" kind="secondary" full disabled={busy} onPress={() => onStart('text')} />
    </BottomActionBar>
  );
}
