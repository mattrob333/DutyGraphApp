import React, { useRef } from 'react';
import { BottomActionBar, Button, errorMessage } from '@/components/common';
import { useCompleteCommitment } from '@/hooks/queries';
import { showToast } from '@/state/ui';
import { track } from '@/analytics/events';
import { newIdempotencyKey } from '@/utils/id';
import type { Commitment } from '@/types/domain';

/**
 * "Mark complete". Rendered only when the server says the participant may
 * (canComplete) and the commitment is open. The idempotency key is created once
 * per screen so a double tap or a retry never completes it twice, and the
 * commitment only changes state after the server responds.
 */
export function CompleteCommitmentBar({ commitment }: { commitment: Commitment }) {
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const complete = useCompleteCommitment();

  if (!commitment.canComplete || commitment.status !== 'OPEN') return null;

  const onPress = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    key.current ??= newIdempotencyKey();
    try {
      await complete.mutateAsync({ commitmentId: commitment.id, idempotencyKey: key.current });
      track('commitment_completed', { commitmentId: commitment.id });
      showToast({ title: 'Marked complete', body: commitment.title });
    } catch (e) {
      showToast({ title: "Couldn't mark complete", body: errorMessage(e) });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <BottomActionBar>
      <Button label="Mark complete" kind="primary" loading={complete.isPending} onPress={onPress} />
    </BottomActionBar>
  );
}
