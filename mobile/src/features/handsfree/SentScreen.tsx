import React from 'react';
import { router } from 'expo-router';
import { BottomActionBar, Button, Screen } from '@/components/common';
import { SentView } from '@/components/handsfree';
import { useMe } from '@/hooks/queries';

/**
 * "You're done." (hf-21). Reached only after the server acknowledged the send; the review screen
 * shows Sending and Send failed in place (hf-20, hf-22), as the design does.
 */
export function SentScreen({ advisor, took }: { advisor?: string; took?: string }) {
  const me = useMe();
  const first = me.data?.firstName?.trim();
  const name = advisor?.trim() || 'your advisor';
  return (
    <Screen
      contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      footer={
        <BottomActionBar>
          <Button label="Close" kind="primary" onPress={() => router.dismissTo('/today')} />
        </BottomActionBar>
      }
    >
      <SentView title={first ? `You're done. Thank you, ${first}.` : "You're done. Thank you."} wentTo={`Your answers went to ${name}.`} took={took} />
    </Screen>
  );
}
