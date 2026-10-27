import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { BottomActionBar, Button, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { usePreferencesStore } from '@/state/preferences';
import { openSheet } from '@/state/ui';
import { radius, useColors } from '@/theme';
import type { DeckMode } from '@shared/hands-free/deck';
import { useDraft } from './draft';
import { introEyebrow, introTitle, minutesLabel, questionCount } from './format';
import { useQuestionSet } from './queries';

/** The cards. `blocked`: the phone refused the microphone, so they open in typing with the note (hf-14). */
export const deckHref = (requestId: string, mode: DeckMode, blocked = false): Href => ({
  pathname: '/questions/[requestId]/deck',
  params: blocked ? { requestId, mode, blocked: '1' } : { requestId, mode },
});

/**
 * The intro (hf-03): who is asking, how many questions, the short titles, and the two ways in.
 * "Start with voice" goes through the microphone explanation the first time (hf-04).
 */
export function IntroScreen({ requestId }: { requestId: string }) {
  const c = useColors();
  const q = useQuestionSet(requestId);
  const draft = useDraft(q.data);
  const consented = usePreferencesStore((s) => s.micConsented);
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const set = q.data;
  const n = questionCount(set);
  const titles = set.questions.filter((x) => !x.isElse);
  const started = !!draft?.answers.some(Boolean);

  const startVoice = () => {
    if (consented) router.push(deckHref(requestId, 'voice'));
    else router.push({ pathname: '/permissions/microphone', params: { questions: requestId } });
  };

  return (
    <Screen
      contentContainerStyle={{ paddingTop: 24 }}
      footer={
        <BottomActionBar>
          <Button label="Start with voice" kind="primary" onPress={startVoice} />
          <Button label="Type instead" full onPress={() => router.push(deckHref(requestId, 'text'))} style={{ marginTop: -2 }} />
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        {introEyebrow(set, new Date())}
      </Text>
      <Heading style={{ marginTop: 10, marginBottom: 12 }}>{introTitle(n)}</Heading>
      <Text variant="body" color="muted" style={{ lineHeight: 24.8, marginBottom: 20 }}>
        Read each card and just talk. When the chips turn green, tap Next. You'll review everything before it's sent.
      </Text>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 16, paddingHorizontal: 18 }}>
        <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 21, marginBottom: 12 }}>
          {minutesLabel(set.estimatedMinutes)}
        </Text>
        <View style={{ gap: 8 }}>
          {titles.map((t, i) => (
            <View key={t.key} accessible accessibilityLabel={`${i + 1}. ${t.short}`} style={{ flexDirection: 'row', gap: 10 }}>
              <Text variant="body" color="faint" style={{ width: 18, fontSize: 15, lineHeight: 21.75 }}>
                {String(i + 1)}
              </Text>
              <Text variant="body" color="muted" style={{ flex: 1, fontSize: 15, lineHeight: 21.75 }}>
                {t.short}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text variant="small" color="faint" style={{ marginTop: 16, lineHeight: 19.5 }}>
        {started ? "Your answers so far are saved on this phone. You can review everything before it's sent." : "You can review everything before it's sent."}
      </Text>
      <Button
        label="Why am I being asked this?"
        kind="link"
        onPress={() => openSheet({ title: 'Why am I being asked this?', paragraphs: set.whyAsked })}
        style={{ marginTop: 8, paddingHorizontal: 0 }}
      />
    </Screen>
  );
}
