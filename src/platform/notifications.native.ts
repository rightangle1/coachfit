/**
 * Real local-notification port — iOS and Android. Every `ReminderId` is used
 * as the underlying notification's `identifier`, so scheduling under an id
 * that already has a pending notification is a clean replace (cancel, then
 * schedule) rather than a stack of duplicates.
 */

import * as Notifications from 'expo-notifications';

import type { NotificationContent, NotificationPort, ReminderId } from './notification-types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionRequested = false;
let permissionGranted = false;

async function requestPermission(): Promise<boolean> {
  if (permissionRequested) return permissionGranted;
  permissionRequested = true;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionGranted = true;
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    permissionGranted = requested.granted;
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

async function cancel(id: ReminderId): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing was scheduled under this id — nothing to do.
  }
}

async function scheduleDaily(id: ReminderId, time: { hour: number; minute: number }, content: NotificationContent): Promise<void> {
  const granted = await requestPermission();
  if (!granted) return;
  await cancel(id);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    },
  });
}

async function scheduleOnce(id: ReminderId, fireAt: number, content: NotificationContent): Promise<void> {
  const granted = await requestPermission();
  if (!granted) return;
  await cancel(id);
  if (fireAt <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
    },
  });
}

async function fireNow(id: ReminderId, content: NotificationContent): Promise<void> {
  const granted = await requestPermission();
  if (!granted) return;
  await cancel(id);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: content.title, body: content.body },
    trigger: null,
  });
}

export const notificationPort: NotificationPort = {
  isSupported: () => true,
  requestPermission,
  scheduleDaily,
  scheduleOnce,
  fireNow,
  cancel,
};
