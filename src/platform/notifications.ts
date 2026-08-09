/**
 * Default notification port — web and Jest/Node. Local notifications aren't a
 * web capability; see `notifications.native.ts` for the real iOS/Android port.
 */

import type { NotificationPort } from './notification-types';

export const notificationPort: NotificationPort = {
  isSupported: () => false,
  requestPermission: async () => false,
  scheduleDaily: async () => undefined,
  scheduleOnce: async () => undefined,
  fireNow: async () => undefined,
  cancel: async () => undefined,
};
