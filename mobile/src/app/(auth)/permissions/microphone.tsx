import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { radius, useColors } from '@/theme';
import { BottomActionBar, Button, Heading, Screen, Text, TopBar } from '@/components/common';
import { useRepository } from '@/api';
import { useConversation } from '@/hooks/queries';
import { usePreferencesStore } from '@/state/preferences';
import { requestMicPermission } from '@/features/voice';
import { conversationHref } from '@/features/conversation/routes';
import { advisorFirst, deckHref, useQuestionSet } from '@/features/handsfree';
import { track } from '@/analytics/events';

const POINTS = [
  'You start and stop the conversation. There is no background listening.',
  'Your answer may be securely processed while you speak so DutyGraph can transcribe it and ask follow-up questions.',
  'Nothing is recorded as your confirmed answer until you review and send it.',
];

/** The question cards' version (hf-04): the microphone is on only while the cards are open. */
const questionPoints = (advisor: string) => [
  'The microphone is on only while the question cards are open. You can pause, skip or type at any time.',
  'Your words are processed securely while you speak so DutyGraph can follow along.',
  `Nothing goes to ${advisor} until you review it and tap Send.`,
];

/**
 * Before the first voice answer: what the microphone does (PRD 13), then the OS
 * permission, asked only when the participant taps. "Type instead" is always
 * available. `return=1` means the screen was opened from inside a conversation
 * ("Use voice"), so it goes back instead of opening a second conversation.
 * `questions=<requestId>` means it was opened from the question cards' intro: it shows that
 * flow's copy and continues to the cards.
 */
export default function MicrophoneRoute() {
  const c = useColors();
  const repo = useRepository();
  const { sessionId, return: returnBack, questions } = useLocalSearchParams<{ sessionId?: string; return?: string; questions?: string }>();
  const session = useConversation(sessionId ?? '');
  const questionSet = useQuestionSet(questions ?? '');
  const setMicConsented = usePreferencesStore((s) => s.setMicConsented);
  const [denied, setDenied] = useState(false);
  const [asking, setAsking] = useState(false);

  const leave = (input: 'voice' | 'text') => {
    if (returnBack) return router.back();
    if (questions) return router.replace(deckHref(questions, input, input === 'text' && denied));
    if (session.data) return router.replace(conversationHref(session.data, input));
    router.replace('/today');
  };

  const allow = async () => {
    setAsking(true);
    setMicConsented(true);
    const res = await requestMicPermission(repo);
    setAsking(false);
    if (res === 'denied') {
      // The question cards say it on the card (hf-14): typing, with "Your microphone is blocked."
      if (questions) return void router.replace(deckHref(questions, 'text', true));
      setDenied(true);
      return;
    }
    setDenied(false);
    leave('voice');
  };

  const typeInstead = () => {
    if (!returnBack) track('voice_switched_to_text', { from: 'consent' });
    leave('text');
  };

  const ready = returnBack || questions ? true : !!session.data;
  const points = questions ? questionPoints(questionSet.data ? advisorFirst(questionSet.data) : 'your advisor') : POINTS;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/today'))} />
      <Screen
        footer={
          <BottomActionBar>
            {denied ? (
              <>
                <Button label="Type my answer instead" kind="primary" onPress={typeInstead} disabled={!ready} />
                {Platform.OS !== 'web' ? <Button label="Open settings" full onPress={() => void Linking.openSettings()} /> : null}
                <Button label="Try again" full onPress={() => void allow()} loading={asking} />
              </>
            ) : (
              <>
                <Button label="Allow microphone and start" kind="primary" onPress={() => void allow()} loading={asking} disabled={!ready} />
                <Button label="Type instead" full onPress={typeInstead} disabled={!ready} />
              </>
            )}
          </BottomActionBar>
        }
      >
        {denied ? (
          <View accessibilityLiveRegion="assertive">
            <View style={{ backgroundColor: c.redBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, padding: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.red }} />
                <Text variant="bodyStrong" color="red" style={{ fontSize: 15 }}>
                  Microphone is blocked
                </Text>
              </View>
              <Text variant="meta" color="muted" style={{ fontSize: 15, lineHeight: 22 }}>
                Your phone is refusing microphone access, so voice answers aren't available right now.
              </Text>
            </View>
            <Text variant="cardTitle" style={{ marginBottom: 10 }}>
              To turn it back on
            </Text>
            {['Open DutyGraph in your phone settings.', 'Set Microphone to Allow.', 'Come back and tap Try again.'].map((s, i) => (
              <Text key={i} variant="meta" color="muted" style={{ fontSize: 15, lineHeight: 26 }}>
                {`${i + 1}. ${s}`}
              </Text>
            ))}
            <Text variant="body" color="muted" style={{ marginTop: 18 }}>
              Typing works just as well. DutyGraph treats your answer exactly the same.
            </Text>
          </View>
        ) : (
          <View>
            <Heading style={{ marginBottom: 12 }}>Answer out loud</Heading>
            <Text variant="body" color="muted" style={{ marginBottom: 20 }}>
              Before we turn on the microphone:
            </Text>
            <View style={{ gap: 12 }}>
              {points.map((p) => (
                <View key={p} style={{ backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 }}>
                  <Text variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
                    {p}
                  </Text>
                </View>
              ))}
            </View>
            {repo.kind === 'mock' ? (
              <Text variant="small" color="faint" style={{ marginTop: 18 }}>
                Demo data: no audio is recorded.
              </Text>
            ) : null}
          </View>
        )}
      </Screen>
    </View>
  );
}
