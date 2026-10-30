import React from 'react';
import { Platform } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useColors } from '@/theme';

/** DutyGraph symbol (client/public/brand/dutygraph-symbol.svg), tinted to the theme ink. */
export function BrandSymbol({ height = 22 }: { height?: number }) {
  const c = useColors();
  return (
    <Svg width={(height * 86) / 83} height={height} viewBox="0 0 86 83" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
      <G fill={c.ink}>
        <Path d="M24 0H62V24H25V61H8Q0 61 0 53V24Q0 0 24 0Z" />
        <Path d="M62 24H78Q86 24 86 32V59Q86 83 62 83H25V61H62Z" />
      </G>
    </Svg>
  );
}
