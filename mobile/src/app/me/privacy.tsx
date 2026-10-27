import React from 'react';
import { Card, Heading, Screen, Text } from '@/components/common';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'While you speak',
    body: 'Your response may be securely processed while you speak so DutyGraph can transcribe it and ask follow-up questions. It is not committed as your confirmed submission until you review and send it.',
  },
  {
    title: 'You are in control of the microphone',
    body: 'You start and stop every recording. DutyGraph never listens in the background.',
  },
  {
    title: 'Your audio',
    body: "Audio is used to transcribe your answer. It is not kept longer than your organization's policy allows.",
  },
  {
    title: 'What counts as your answer',
    body: 'Your confirmed answers, and what DutyGraph understood from them, are the record. Nothing is added to it until you have seen it and sent it yourself.',
  },
  {
    title: 'Who sees what',
    body: "Your manager can see whether you have completed a Pulse in the team status, where your company allows it. They do not see your answers.",
  },
  {
    title: 'No ranking',
    body: 'DutyGraph never ranks or scores you.',
  },
];

export default function PrivacyScreen() {
  return (
    <Screen>
      <Heading>How DutyGraph handles your answers</Heading>
      <Text color="muted" style={{ marginBottom: 14 }}>
        Plain answers to the questions people ask before they speak.
      </Text>
      {SECTIONS.map((s) => (
        <Card key={s.title} level="surface" accessibilityLabel={undefined}>
          <Text variant="bodyStrong" accessibilityRole="header" style={{ marginBottom: 6 }}>
            {s.title}
          </Text>
          <Text variant="meta" color="muted" style={{ lineHeight: 22 }}>
            {s.body}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
