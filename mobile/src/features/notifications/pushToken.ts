/**
 * Notification permission and Expo push token capture.
 *
 * The server's PUT /me/push-token is not in contract 1.1 yet, so the token is
 * kept in secure storage for later registration. It is never logged.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { secureDelete, secureGet, secureSet } from '@/storage/secure';

export const PUSH_TOKEN_KEY = 'dg.companion.pushToken';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermissionState(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain === false || p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'DutyGraph', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Gets and stores the Expo push token. Returns false when skipped or unavailable. */
export async function captureExpoPushToken(): Promise<boolean> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return false;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return false;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token?.data) return false;
    await secureSet(PUSH_TOKEN_KEY, token.data);
    return true;
  } catch {
    return false;
  }
}

export const getStoredPushToken = () => secureGet(PUSH_TOKEN_KEY);
export const clearStoredPushToken = () => secureDelete(PUSH_TOKEN_KEY).catch(() => {});
