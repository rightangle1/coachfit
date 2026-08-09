/**
 * Local notification port (mirrors the ADR-0007 persistence-port pattern and
 * the HealthKit write-back port). Local-only — there is no push server; every
 * notification is scheduled on-device from data the app already has.
 */

export type ReminderId = 'today-workout' | 'layoff-checkin' | 'streak-keeper' | 'streak-milestone';

export interface NotificationContent {
  title: string;
  body: string;
}

export interface NotificationPort {
  isSupported(): boolean;
  requestPermission(): Promise<boolean>;
  /** (Re)schedules a recurring daily notification for this id, replacing any prior schedule under the same id. */
  scheduleDaily(id: ReminderId, time: { hour: number; minute: number }, content: NotificationContent): Promise<void>;
  /** (Re)schedules a one-shot notification at an absolute time, replacing any prior schedule under the same id. */
  scheduleOnce(id: ReminderId, fireAt: number, content: NotificationContent): Promise<void>;
  /** Fires a notification immediately (used for the streak-milestone celebration). */
  fireNow(id: ReminderId, content: NotificationContent): Promise<void>;
  /** Cancels any pending notification scheduled under this id, if any. */
  cancel(id: ReminderId): Promise<void>;
}
