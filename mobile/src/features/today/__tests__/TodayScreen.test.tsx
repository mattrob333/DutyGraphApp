import React from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import TodayScreen from '@/app/(tabs)/today';
import { RepositoryProvider } from '@/api';
import { MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';
import { config, type CompanionScope } from '@/api/config';

const defaultScope = config.companionScope;
afterEach(() => {
  config.companionScope = defaultScope;
});

async function renderToday(scope: CompanionScope) {
  config.companionScope = scope;
  const repo = new MockCompanionRepository({ scope });
  repo.latency = 0;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>
        <ThemeProvider>
          <TodayScreen />
        </ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

describe('Today screen (mock repository)', () => {
  it('renders the greeting, due-now and later sections and no scoring language (full app)', async () => {
    await renderToday('full');
    await waitFor(() => expect(screen.getByText(/^Good (morning|afternoon|evening), /)).toBeTruthy());
    expect(screen.getByText('Monday Operations Pulse')).toBeTruthy();
    expect(screen.getByText('Later')).toBeTruthy();
    expect(screen.getByText('Vendor rollout decision')).toBeTruthy();
    expect(screen.getByText('Done today')).toBeTruthy();
    expect(screen.queryByText(/streak|score|rank/i)).toBeNull();
  });

  it('lists question requests only with the questions scope', async () => {
    await renderToday('questions');
    await waitFor(() => expect(screen.getByText(/^Good (morning|afternoon|evening), Noah$/)).toBeTruthy());
    expect(screen.getByText('Questions about your work')).toBeTruthy();
    expect(screen.getByText('Two follow-up questions')).toBeTruthy();
    expect(screen.queryByText('Monday Operations Pulse')).toBeNull();
    expect(screen.queryByText('Vendor rollout decision')).toBeNull();
    expect(screen.queryByText('Your 2:00 review is now 15 minutes')).toBeNull();
    expect(screen.queryByText('Something changed?')).toBeNull();
  });
});
