import React from 'react';
import { router } from 'expo-router';
import { SectionLabel, Text } from '@/components/common';
import { commitmentHref } from '@/features/commitments/format';
import type { Commitment, WorkList } from '@/types/domain';
import { CommitmentCard, CompletedRow, type CommitmentCardVariant } from './CommitmentCard';

function Empty({ children }: { children: string }) {
  return (
    <Text variant="meta" color="faint" style={{ paddingTop: 4, paddingBottom: 8 }}>
      {children}
    </Text>
  );
}

function Group({ title, items, variant, empty }: { title: string; items: Commitment[]; variant: CommitmentCardVariant; empty?: string }) {
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      {items.map((c) => (
        <CommitmentCard key={c.id} commitment={c} variant={variant} onPress={() => router.push(commitmentHref(c))} />
      ))}
      {!items.length && empty ? <Empty>{empty}</Empty> : null}
    </>
  );
}

/** Work tab body. Later and Completed only appear when they have items. */
export function WorkSections({ work }: { work: WorkList }) {
  return (
    <>
      <Group title="Due today" items={work.today} variant="today" empty="Nothing due today." />
      <Group title="This week" items={work.thisWeek} variant="week" empty="Nothing else this week." />
      {work.later.length ? <Group title="Later" items={work.later} variant="week" /> : null}
      <SectionLabel>Waiting on someone</SectionLabel>
      {work.waiting.map((c) => (
        <CommitmentCard key={c.id} commitment={c} variant="waiting" onPress={() => router.push(commitmentHref(c))} />
      ))}
      {!work.waiting.length ? <Empty>You're not waiting on anyone.</Empty> : null}
      {work.done.length ? (
        <>
          <SectionLabel>Completed</SectionLabel>
          {work.done.map((c) => (
            <CompletedRow key={c.id} commitment={c} onPress={() => router.push(commitmentHref(c))} />
          ))}
        </>
      ) : null}
    </>
  );
}
