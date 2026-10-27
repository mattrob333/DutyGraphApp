import React from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(),
}));

import { useLocalSearchParams } from 'expo-router';
import WorkScreen from '@/app/(tabs)/work';
import CommitmentDetail from '@/app/work/commitments/[commitmentId]';
import WaitingDetail from '@/app/work/waiting/[dependencyId]';
import ClarificationScreen from '@/app/clarifications/[clarificationId]';
import SomethingChanged from '@/app/something-changed';
import { RepositoryProvider } from '@/api';
import { MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';

const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

async function setup(ui: React.ReactElement, repo = new MockCompanionRepository()) {
  repo.latency = 0;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(qc);
  const utils = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <RepositoryProvider repository={repo}>
          <ThemeProvider>{ui}</ThemeProvider>
        </RepositoryProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { repo, ...utils };
}

const params = useLocalSearchParams as unknown as jest.Mock;

describe('Work tab', () => {
  it('groups commitments and shows empty copy only where empty', async () => {
    await setup(<WorkScreen />);
    await waitFor(() => expect(screen.getByText('Confirm carrier cutoff times')).toBeTruthy());
    expect(screen.getByText('My commitments')).toBeTruthy();
    expect(screen.getByText('Due today')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Waiting on someone')).toBeTruthy();
    expect(screen.getByText("You're waiting on this")).toBeTruthy();
    expect(screen.getByText("From Friday's Operations Review")).toBeTruthy();
    expect(screen.queryByText('Later')).toBeNull();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.queryByText('Nothing due today.')).toBeNull();
  });
});

describe('Commitment detail', () => {
  it('completes once with one idempotency key on double tap, and only after the server answers', async () => {
    params.mockReturnValue({ commitmentId: 'c-cutoff' });
    const { repo } = await setup(<CommitmentDetail />);
    const spy = jest.spyOn(repo, 'completeCommitment');
    const button = await screen.findByRole('button', { name: 'Mark complete' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('hides Mark complete when the server does not authorize it', async () => {
    params.mockReturnValue({ commitmentId: 'c-cutoff' });
    const repo = new MockCompanionRepository();
    const orig = repo.getCommitment.bind(repo);
    jest.spyOn(repo, 'getCommitment').mockImplementation(async (id: string) => ({ ...(await orig(id)), canComplete: false }));
    await setup(<CommitmentDetail />, repo);
    await screen.findByText('Confirm carrier cutoff times');
    expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull();
  });
});

describe('Waiting detail', () => {
  it('shows facts and no actions', async () => {
    params.mockReturnValue({ dependencyId: 'w-creds' });
    await setup(<WaitingDetail />);
    await screen.findByText('Production credentials');
    expect(screen.getByText('Samir Patel, IT')).toBeTruthy();
    expect(screen.getByText('What happens next')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Clarification', () => {
  it('records a normal answer and shows the resolved card', async () => {
    params.mockReturnValue({ clarificationId: 'clar-invoice-exceptions' });
    await setup(<ClarificationScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finance owns them' }));
    await screen.findByText('Thanks — that settles it');
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeTruthy();
    expect(screen.queryByText('Which is accurate today?')).toBeNull();
  });
});

describe('Something changed', () => {
  it('lists change kinds as radios with none selected', async () => {
    await setup(<SomethingChanged />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.length).toBeGreaterThan(3);
    expect(radios.every((r) => !r.props.accessibilityState?.checked)).toBe(true);
    await fireEvent.press(radios[1]);
    await waitFor(() => expect(screen.getAllByRole('radio')[1].props.accessibilityState.checked).toBe(true));
  });
});
