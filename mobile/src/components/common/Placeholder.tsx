import React from 'react';
import { Screen } from './Screen';
import { Heading, Text } from './Text';

/** Temporary route body while a screen is being built. */
export function Placeholder({ name }: { name: string }) {
  return (
    <Screen>
      <Heading>{name}</Heading>
      <Text color="muted">Screen under construction.</Text>
    </Screen>
  );
}
