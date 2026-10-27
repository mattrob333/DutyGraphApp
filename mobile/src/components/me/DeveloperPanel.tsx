import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { asMock, useRepository } from '@/api';
import { Button } from '@/components/common';
import { usePreferencesStore } from '@/state/preferences';
import { useSimulationStore, type SimulationFlags } from '@/state/simulation';
import { useUiStore } from '@/state/ui';
import { SettingsGroup, SwitchRow } from './SettingsGroup';

const FLAGS: { key: keyof SimulationFlags; label: string; sub: string }[] = [
  { key: 'offline', label: 'Offline', sub: 'Show the offline banner and fail requests' },
  { key: 'micDenied', label: 'Microphone blocked', sub: 'Simulate a denied permission' },
  { key: 'holdSend', label: 'Hold on "Sending…"', sub: 'Keep submissions in flight' },
  { key: 'failSend', label: 'Sending fails', sub: 'Submission returns an error' },
  { key: 'pulseOverdue', label: 'Pulse overdue', sub: 'Move the Pulse past its due time' },
  { key: 'teamIncomplete', label: 'Team incomplete', sub: 'Some teammates have not finished' },
  { key: 'providerError', label: 'Provider error', sub: 'The understanding service is unavailable' },
];

/** Demo controls. Rendered only when the data source is the mock (see Me tab). */
export function DeveloperPanel() {
  const repo = useRepository();
  const qc = useQueryClient();
  const sim = useSimulationStore();
  const setOffline = useUiStore((s) => s.setOffline);

  const flip = (key: keyof SimulationFlags) => {
    const next = !sim[key];
    sim.set({ [key]: next });
    if (key === 'offline') setOffline(next);
  };

  const resetDemo = () => {
    asMock(repo)?.reset();
    qc.clear();
    usePreferencesStore.getState().reset();
    useSimulationStore.getState().reset();
    setOffline(false);
  };

  return (
    <>
      <SettingsGroup title="Developer (demo data)">
        {FLAGS.map((f) => (
          <SwitchRow key={f.key} label={f.label} sub={f.sub} value={sim[f.key]} onChange={() => flip(f.key)} />
        ))}
      </SettingsGroup>
      <Button label="Replay onboarding" onPress={() => router.push('/invite')} full style={{ marginTop: 12 }} />
      <Button label="Reset demo" onPress={resetDemo} full style={{ marginTop: 10 }} />
    </>
  );
}
