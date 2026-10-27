import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** The old discovery link (PR #48): question requests now open on the question cards. */
export default function DiscoveryRedirect() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  return <Redirect href={{ pathname: '/questions/[requestId]', params: { requestId } }} />;
}
