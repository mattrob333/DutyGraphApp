import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { RepositoryProvider, getRepository, asMock } from '@/api';
import { createQueryClient } from '@/hooks/queries';
import { ThemeProvider, useTheme } from '@/theme';
import { OfflineBanner, SheetHost, ToastHost, TopBar } from '@/components/common';
import { useSessionStore } from '@/state/session';
import { showToast } from '@/state/ui';
import { useNotificationRouting } from '@/features/notifications/useNotificationRouting';
import { usePendingSubmissionSync } from '@/features/conversation/usePendingSubmissionSync';
import { usePendingTaskDecisionSync } from '@/features/participantExtras/usePendingTaskDecisionSync';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = createQueryClient();

/** Flow screens get the DutyGraph header with Back; tab screens render their own header. */
function FlowHeader() {
  return (
    <View>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/today'))} />
      <OfflineBanner />
    </View>
  );
}

/**
 * The question cards show their own offline notice (hf-16), so their header has Back only.
 * "You're done" has no Back into a sent request.
 */
function QuestionsHeader() {
  return <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/today'))} />;
}

function AppStack() {
  const { scheme, colors } = useTheme();
  useNotificationRouting();
  usePendingSubmissionSync();
  usePendingTaskDecisionSync();

  // Mock data source: surface the "meeting avoided" moment as the prototype does.
  useEffect(() => {
    const mock = asMock(getRepository());
    if (!mock) return;
    return mock.subscribe((e) => {
      if (e.type === 'meeting_avoided') {
        queryClient.invalidateQueries();
        showToast({
          title: "You're no longer needed at 11:00",
          body: 'Your Pulse covered everything the team needed. 50 minutes returned.',
          route: `/meetings/${e.meetingId}/avoided`,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['pulse'] });
      }
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          header: () => <FlowHeader />,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="mobile/enroll" options={{ headerShown: false }} />
        <Stack.Screen name="advisor" options={{ headerShown: false }} />
        {/* Completion screens: no Back into a submitted flow. */}
        <Stack.Screen name="pulse/[pulseId]/complete" options={{ gestureEnabled: false, header: () => <TopBar /> }} />
        <Stack.Screen name="session/[sessionId]/done" options={{ gestureEnabled: false, header: () => <TopBar /> }} />
        <Stack.Screen name="questions/[requestId]/index" options={{ header: () => <QuestionsHeader /> }} />
        <Stack.Screen name="questions/[requestId]/deck" options={{ header: () => <QuestionsHeader /> }} />
        <Stack.Screen name="questions/[requestId]/review" options={{ header: () => <QuestionsHeader /> }} />
        <Stack.Screen name="questions/[requestId]/sent" options={{ gestureEnabled: false, header: () => <TopBar /> }} />
      </Stack>
      <SheetHost />
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  const hydrate = useSessionStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
  }, [hydrate]);

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RepositoryProvider>
          <ThemeProvider>
            <AppStack />
          </ThemeProvider>
        </RepositoryProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
