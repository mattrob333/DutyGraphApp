import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { showToast } from '@/state/ui';
import type { Id, MeetingJoinTarget } from '@/types/domain';
import { isSafeJoinUrl, providerName } from './format';

/**
 * Opens the provider's own app or browser (no native video in DutyGraph, PRD 12)
 * and keeps the participant in DutyGraph on the live companion screen.
 */
export function useJoinMeeting(meetingId: Id, target: MeetingJoinTarget | undefined) {
  const [joining, setJoining] = useState(false);
  const canOpen = isSafeJoinUrl(target?.url);
  const join = useCallback(async () => {
    if (!target || !isSafeJoinUrl(target.url)) {
      showToast({ title: 'No join link yet', body: 'The organizer has not added a link to this meeting.' });
      return;
    }
    setJoining(true);
    try {
      await Linking.openURL(target.url);
    } catch {
      setJoining(false);
      showToast({ title: "Couldn't open the meeting link", body: 'Open it from your calendar instead.' });
      return;
    }
    const name = providerName(target.provider);
    showToast({ title: `Opening ${name}`, body: 'DutyGraph stays alongside the call here.' });
    router.push({ pathname: '/meetings/[meetingId]/live', params: { meetingId } });
    setJoining(false);
  }, [meetingId, target]);
  return { join, joining, canOpen };
}

/** Wall clock that ticks once per second (deterministic countdowns). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
