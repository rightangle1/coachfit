/**
 * Reminder recompute (ADR-0403). The only place that decides which local
 * notifications should currently be scheduled — cheap and safe to call on
 * every app foreground and after every session save. It always fully
 * re-derives the desired state and lets the port replace-or-cancel by id, so
 * it's naturally idempotent; there is no background task keeping it fresh
 * between opens.
 */

import type { Achievement } from '../domain/metrics';
import { currentStreakDays } from '../domain/metrics';
import type { AthleteProfile, SessionRecord, WorkoutType } from '../domain/types';
import { notificationPort } from '@/platform/notifications';
import type { NotificationContent } from '@/platform/notification-types';
import { recommendWorkoutType } from '../app-lib/presentation';
import { getAthleteProfile } from './athlete';
import { listHistory } from './sessions';

const DAY_MS = 86_400_000;

/** Days after the last completed session before the layoff check-in fires —
 * deliberately earlier than the engine's own 10-day layoff-ramp threshold
 * (`LAYOFF.GRACE_DAYS` in `domain/engine/layoff.ts`), since a nudge should
 * land well before the engine itself starts easing load back. */
const LAYOFF_CHECKIN_DAYS = 3;

export const DEFAULT_NOTIFICATION_TIMES = { todayWorkout: '08:00', streakKeeper: '19:00' };

/** Noon-normalized local-day timestamp — two moments on the same calendar day
 * always compare equal regardless of time-of-day. */
function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [hour, minute] = hhmm.split(':').map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

function atTimeToday(now: number, time: { hour: number; minute: number }): number {
  const d = new Date(now);
  d.setHours(time.hour, time.minute, 0, 0);
  return d.getTime();
}

function workoutLabel(type: WorkoutType | undefined): string {
  if (!type) return 'session';
  return type[0].toUpperCase() + type.slice(1);
}

async function scheduleTodayWorkout(profile: AthleteProfile, now: number, todayWorkoutTime: string): Promise<void> {
  const todaysSchedule = profile.scheduledWorkouts?.find((item) => localDay(item.plannedFor) === localDay(now));
  const workoutType = todaysSchedule?.workoutType ?? profile.preferredWorkoutType ?? recommendWorkoutType(profile.goals);
  const content: NotificationContent = {
    title: "Today's session",
    body: workoutType
      ? `${workoutLabel(workoutType)} is on deck — open CoachFit to get started.`
      : "Open CoachFit to see what today's session looks like.",
  };
  await notificationPort.scheduleDaily('today-workout', parseTime(todayWorkoutTime), content);
}

async function scheduleLayoffCheckin(history: SessionRecord[], now: number): Promise<void> {
  const lastCompletedAt = history.reduce((max, r) => (r.completedAt != null && r.completedAt > max ? r.completedAt : max), 0);
  const fireAt = lastCompletedAt ? lastCompletedAt + LAYOFF_CHECKIN_DAYS * DAY_MS : 0;
  if (!fireAt || fireAt <= now) {
    await notificationPort.cancel('layoff-checkin');
    return;
  }
  await notificationPort.scheduleOnce('layoff-checkin', fireAt, {
    title: 'Missing your training?',
    body: "It's been a few days — ready for a quick session?",
  });
}

async function scheduleStreakKeeper(history: SessionRecord[], now: number, streakKeeperTime: string, trainedToday: boolean): Promise<void> {
  const streak = currentStreakDays(history, now);
  const fireAt = streak > 0 && !trainedToday ? atTimeToday(now, parseTime(streakKeeperTime)) : 0;
  if (!fireAt || fireAt <= now) {
    await notificationPort.cancel('streak-keeper');
    return;
  }
  await notificationPort.scheduleOnce('streak-keeper', fireAt, {
    title: 'Keep the streak going',
    body: `Don't lose your ${streak}-day streak — log today's session.`,
  });
}

/** Re-derives and (re)schedules all recurring/pending reminders from current
 * athlete + history state. Call on app foreground and after a session save. */
export async function refreshReminders(now = Date.now()): Promise<void> {
  const profile = getAthleteProfile();
  if (!profile?.notificationsEnabled) {
    await Promise.all([
      notificationPort.cancel('today-workout'),
      notificationPort.cancel('layoff-checkin'),
      notificationPort.cancel('streak-keeper'),
    ]);
    return;
  }

  const times = profile.notificationTimes ?? DEFAULT_NOTIFICATION_TIMES;
  const history = listHistory();
  const trainedToday = history.some((r) => r.completedAt != null && localDay(r.completedAt) === localDay(now));

  await Promise.all([
    scheduleTodayWorkout(profile, now, times.todayWorkout),
    scheduleLayoffCheckin(history, now),
    scheduleStreakKeeper(history, now, times.streakKeeper, trainedToday),
  ]);
}

/** Fires the streak-milestone celebration immediately if this debrief's newly
 * unlocked achievements include a streak tier. Takes the same `newlyUnlocked`
 * list the debrief screen already computes for its in-app celebration
 * (`evaluateAchievements` diffed against `preSessionAchievementIds`) — no
 * separate milestone detection to keep in sync. */
export async function checkStreakMilestone(newlyUnlocked: Achievement[]): Promise<void> {
  const milestone = newlyUnlocked.find((a) => a.family === 'streak');
  if (!milestone) return;
  if (!getAthleteProfile()?.notificationsEnabled) return;
  await notificationPort.fireNow('streak-milestone', { title: milestone.title, body: milestone.description });
}
