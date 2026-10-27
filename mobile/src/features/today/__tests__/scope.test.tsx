import React from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { config } from '@/api/config';
import { BottomNav } from '@/components/navigation/BottomNav';
import { ThemeProvider } from '@/theme';
import { requestInScope, visibleTabs } from '../scope';

const defaultScope = config.companionScope;
afterEach(() => {
  config.companionScope = defaultScope;
});

function renderNav() {
  const routes = ['today', 'work', 'meetings', 'me'].map((name) => ({ key: `${name}-key`, name }));
  const props = {
    state: { index: 0, routes },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as React.ComponentProps<typeof BottomNav>;
  return render(
    <ThemeProvider>
      <BottomNav {...props} />
    </ThemeProvider>,
  );
}

describe('Companion scope switch', () => {
  it('defaults to the questions scope', () => {
    expect(defaultScope).toBe('questions');
  });

  it('has Today and Me with the questions scope, all four tabs with the full app', () => {
    expect(visibleTabs('questions')).toEqual(['today', 'me']);
    expect(visibleTabs('full')).toEqual(['today', 'work', 'meetings', 'me']);
  });

  it('shows only Today and Me in the bottom navigation with the questions scope', async () => {
    config.companionScope = 'questions';
    await renderNav();
    expect(screen.getByRole('tab', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Me' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Work' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Meetings' })).toBeNull();
  });

  it('shows all four tabs with the full app', async () => {
    config.companionScope = 'full';
    await renderNav();
    for (const name of ['Today', 'Work', 'Meetings', 'Me']) expect(screen.getByRole('tab', { name })).toBeTruthy();
  });

  it('keeps question cards, old discovery links and task checks on Today', () => {
    expect(requestInScope({ route: '/questions/req-hf-cobalt' }, 'questions')).toBe(true);
    expect(requestInScope({ route: '/discovery/req-disc-north-dock' }, 'questions')).toBe(true);
    expect(requestInScope({ route: '/confirmations/r1' }, 'questions')).toBe(true);
    expect(requestInScope({ route: '/pulse/p1' }, 'questions')).toBe(false);
    expect(requestInScope({ route: '/clarifications/c1' }, 'questions')).toBe(false);
    expect(requestInScope({ route: '' }, 'questions')).toBe(false);
    expect(requestInScope({ route: '/pulse/p1' }, 'full')).toBe(true);
  });
});
