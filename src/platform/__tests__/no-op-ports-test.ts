import { liveActivityPort } from '@/platform/live-activity';
import { healthWritePort } from '@/platform/health';
import { notificationPort } from '@/platform/notifications';

describe('default (Android/web/Jest) platform ports', () => {
  it('liveActivityPort reports unsupported and every call is a safe no-op', () => {
    expect(liveActivityPort.isSupported()).toBe(false);
    expect(() => liveActivityPort.start({} as never)).not.toThrow();
    expect(() => liveActivityPort.update({} as never)).not.toThrow();
    expect(() => liveActivityPort.end()).not.toThrow();
  });

  it('healthWritePort reports unsupported and every call resolves without throwing', async () => {
    expect(healthWritePort.isSupported()).toBe(false);
    await expect(healthWritePort.requestWriteAuthorization()).resolves.toBe(false);
    await expect(
      healthWritePort.saveWorkout({ activityType: 'strength', startedAt: 0, completedAt: 1 }),
    ).resolves.toBeUndefined();
  });

  it('notificationPort reports unsupported and every call resolves without throwing', async () => {
    expect(notificationPort.isSupported()).toBe(false);
    await expect(notificationPort.requestPermission()).resolves.toBe(false);
    const content = { title: 't', body: 'b' };
    await expect(notificationPort.scheduleDaily('today-workout', { hour: 8, minute: 0 }, content)).resolves.toBeUndefined();
    await expect(notificationPort.scheduleOnce('layoff-checkin', Date.now(), content)).resolves.toBeUndefined();
    await expect(notificationPort.fireNow('streak-milestone', content)).resolves.toBeUndefined();
    await expect(notificationPort.cancel('streak-keeper')).resolves.toBeUndefined();
  });
});
