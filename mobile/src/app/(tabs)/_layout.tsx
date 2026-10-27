import React from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { BottomNav } from '@/components/navigation/BottomNav';
import { OfflineBanner, TopBar } from '@/components/common';
import { useNotifications } from '@/hooks/queries';
import { useSessionStore } from '@/state/session';
import { useColors } from '@/theme';
import { requestInScope, visibleTabs } from '@/features/today/scope';

function TabHeader() {
  const { data } = useNotifications();
  const unread = !!data?.some((n) => !n.read && requestInScope({ route: n.route }));
  return (
    <View>
      <TopBar onBell={() => router.push('/notifications')} unread={unread} />
      <OfflineBanner />
    </View>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const status = useSessionStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/invite" />;
  // The `questions` scope keeps Work and Meetings in the code but out of navigation (spec §6.1).
  const tabs = visibleTabs();
  const shown = (name: 'work' | 'meetings') => (tabs.includes(name) ? {} : { href: null });
  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ header: () => <TabHeader />, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="work" options={{ title: 'Work', ...shown('work') }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', ...shown('meetings') }} />
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
    </Tabs>
  );
}
