import React, { useState } from 'react';
import { ErrorState, Heading, LoadingState, Screen, Text, errorMessage } from '@/components/common';
import { ChangeKindList, StartChoiceBar } from '@/components/work';
import { useStartFlow } from '@/features/conversation/useStartFlow';
import { useChangeKinds, useCreateChangeReport } from '@/hooks/queries';
import { showToast } from '@/state/ui';
import type { ChangeKind } from '@/types/domain';

export default function SomethingChanged() {
  const kinds = useChangeKinds();
  const create = useCreateChangeReport();
  const flow = useStartFlow();
  const [kind, setKind] = useState<ChangeKind | undefined>();
  const [busy, setBusy] = useState(false);

  const start = async (input: 'voice' | 'text') => {
    if (busy) return;
    setBusy(true);
    try {
      // Choosing a kind is optional; the participant may just start talking.
      const changeKind: ChangeKind = kind ?? 'OTHER';
      const { requestId } = await create.mutateAsync(changeKind);
      await flow.begin({ requestId, mode: 'CHANGE_REPORT', input, changeKind });
    } catch (e) {
      showToast({ title: "Couldn't start", body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (kinds.isPending) return <LoadingState />;
  if (kinds.isError || !kinds.data) return <ErrorState error={kinds.error} onRetry={() => kinds.refetch()} />;

  return (
    <Screen footer={<StartChoiceBar busy={busy || flow.isPending} onStart={start} />}>
      <Heading style={{ marginBottom: 12 }}>Something changed?</Heading>
      <Text variant="body" color="muted" style={{ marginBottom: 18 }}>
        Tell DutyGraph when:
      </Text>
      <ChangeKindList options={kinds.data} selected={kind} onSelect={setKind} />
      <Text variant="small" color="faint" style={{ marginTop: 16 }}>
        A sentence or two is plenty. We'll ask if we need more.
      </Text>
    </Screen>
  );
}
