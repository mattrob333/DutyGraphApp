import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSessionStore } from '@/state/session';
import { routeFromPush } from './deepLinks';

export { isAllowedDeepLink, routeFromPush } from './deepLinks';

let handlerSet = false;
const handled = new Set<string>();

/** Show a banner while the app is open; no sound or badge (quiet by default). */
function configureHandler() {
  if (handlerSet || Platform.OS === 'web') return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
    });
  } catch {
    handlerSet = false;
  }
}

function open(response: Notifications.NotificationResponse | null | undefined) {
  try {
    if (!response) return;
    const req = response.notification.request;
    const id = `${req.identifier}:${response.notification.date}`;
    if (handled.has(id)) return;
    handled.add(id);
    const route = routeFromPush(req.content.data);
    if (route) router.push(route as never);
  } catch {
    // A bad payload must never crash the app.
  }
}

/**
 * Foreground banner plus notification-tap routing (cold start and warm).
 * Only allow-listed in-app routes are opened, and only for a signed-in participant.
 */
export function useNotificationRouting() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');

  useEffect(() => {
    configureHandler();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !signedIn) return;
    let sub: { remove: () => void } | undefined;
    try {
      open(Notifications.getLastNotificationResponse());
      sub = Notifications.addNotificationResponseReceivedListener(open);
    } catch {
      // Notifications unavailable (for example Expo Go limits): nothing to route.
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        // ignore
      }
    };
  }, [signedIn]);
}
