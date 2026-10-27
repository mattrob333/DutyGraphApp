import React from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import NotificationsScreen from '@/app/notifications';
import { RepositoryProvider } from '@/api';
import { MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';
import { config, type CompanionScope } from '@/api/config';

const defaultScope = config.companionScope;
let qc: QueryClient | null = null;
afterEach(async () => {
  await cleanup();
  config.companionScope = defaultScope;
  // The notifications query refetches on an interval: stop it so jest can exit.
  qc?.clear();
  qc = null;
});

async function renderNotifications(scope: CompanionScope) {
  config.companionScope = scope;
  const repo = new MockCompanionRepository({ scope });
  repo.latency = 0;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>
        <ThemeProvider>
          <NotificationsScreen />
        </ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

describe('Notifications screen and the scope switch', () => {
  it('lists question items only with the questions scope', async () => {
    await renderNotifications('questions');
    await waitFor(() => expect(screen.getByText('Alex Rivera has 6 questions for you')).toBeTruthy());
    expect(screen.queryByText('Your Monday Operations Pulse is ready')).toBeNull();
    expect(screen.queryByText(/Meeting/)).toBeNull();
    expect(screen.queryByText('Due at 4:00 PM')).toBeNull();
  });

  it('lists everything with the full app', async () => {
    await renderNotifications('full');
    await waitFor(() => expect(screen.getByText('Your Monday Operations Pulse is ready')).toBeTruthy());
    expect(screen.getByText('Due at 4:00 PM')).toBeTruthy();
  });
});
