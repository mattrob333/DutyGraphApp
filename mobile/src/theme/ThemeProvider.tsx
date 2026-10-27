import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorTokens } from './tokens';
import { usePreferencesStore } from '@/state/preferences';

export interface Theme {
  scheme: 'dark' | 'light';
  colors: ColorTokens;
}

const ThemeContext = createContext<Theme>({ scheme: 'dark', colors: darkColors });

/** Resolves the participant's appearance preference (system/dark/light). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const appearance = usePreferencesStore((s) => s.appearance);
  const scheme: 'dark' | 'light' =
    appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
  const value = useMemo<Theme>(
    () => ({ scheme, colors: scheme === 'light' ? lightColors : darkColors }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useColors(): ColorTokens {
  return useContext(ThemeContext).colors;
}
