import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** The prototype's check mark (cards, chips, Sent). */
export function CheckIcon({ size, color, stroke = 3 }: { size: number; color: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

/** Skipped: an arrow moving on. */
export function SkipArrowIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h13M13 7l5 5-5 5" />
    </Svg>
  );
}

export function PauseIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={5} y={4} width={5} height={16} rx={1} />
      <Rect x={14} y={4} width={5} height={16} rx={1} />
    </Svg>
  );
}
