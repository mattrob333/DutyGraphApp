import React from 'react';
import { View } from 'react-native';
import { useColors } from '@/theme';

export function Divider({ inset = 0 }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: 1, backgroundColor: c.line, marginVertical: 12, marginHorizontal: inset }} />;
}
