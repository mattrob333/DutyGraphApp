import React from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/components/common';
import { formatElapsed } from '@/utils/time';
import { Waveform } from './Waveform';

export type VoiceControlsMode =
  /** DutyGraph is still asking; the microphone is not open yet. */
  | 'idle'
  | 'listening'
  | 'paused'
  /** An answer is being transcribed or understood. */
  | 'busy';

export interface VoiceControlsProps {
  mode: VoiceControlsMode;
  seconds: number;
  /** Label for the primary button (defaults per mode). */
  doneLabel?: string;
  onPause: () => void;
  onResume: () => void;
  onDone: () => void;
  onTypeInstead: () => void;
}

/** Bottom controls for voice answers: waveform, timer, Pause/Resume, Done answering, Type instead (03-Voice.png). */
export function VoiceControls({ mode, seconds, doneLabel, onPause, onResume, onDone, onTypeInstead }: VoiceControlsProps) {
  const open = mode === 'listening' || mode === 'paused';
  const label = doneLabel ?? (mode === 'busy' ? 'Understanding…' : mode === 'idle' ? 'DutyGraph is asking…' : 'Done answering');
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Waveform active={mode === 'listening'} />
        <Text accessibilityLabel={`${seconds} seconds`} variant="bodyStrong" color="muted" style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}>
          {formatElapsed(seconds)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={mode === 'paused' ? 'Resume' : 'Pause'}
          accessibilityLabel={mode === 'paused' ? 'Resume listening' : 'Pause listening'}
          onPress={mode === 'paused' ? onResume : onPause}
          disabled={!open}
          style={{ width: 104, minHeight: 48 }}
        />
        <Button label={label} kind="primary" onPress={onDone} disabled={!open} loading={mode === 'busy'} style={{ flex: 1 }} />
      </View>
      <Button label="Type instead" kind="link" full onPress={onTypeInstead} disabled={mode === 'busy'} style={{ marginTop: 2 }} />
    </View>
  );
}
