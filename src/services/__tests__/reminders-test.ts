import type { Achievement } from '@/domain/metrics';
import type { AthleteProfile, SessionRecord } from '@/domain/types';

jest.mock('@/platform/notifications', () => ({
  notificationPort: {
    isSupported: jest.fn(() => true),
    requestPermission: jest.fn(async () => true),
    scheduleDaily: jest.fn(async () => undefined),
    scheduleOnce: jest.fn(async () => undefined),
    fireNow: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
  },
}));
jest.mock('@/services/athlete', () => ({
  getAthleteProfile: jest.fn(),
}));
jest.mock('@/services/sessions', () => ({
  listHistory: jest.fn(() => []),
}));

import { notificationPort } from '@/platform/notifications';
import { getAthleteProfile } from '@/services/athlete';
import { listHistory } from '@/services/sessions';
import { checkStreakMilestone, refreshReminders } from '@/services/reminders';

const DAY = 86_400_000;
// A fixed local weekday/time so "today at 19:00" is unambiguously in the
// future and "today at 08:00" is unambiguously in the past.
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: 'me',
    experience: 'intermediate',
    goals: { weights: {} } as AthleteProfile['goals'],
    constraints: [],
    createdAt: NOW,
    updatedAt: NOW,
    notificationsEnabled: true,
    ...overrides,
  };
}

function sessionDaysAgo(days: number, id = `s-${days}`): SessionRecord {
  const at = NOW - days * DAY;
  return { id, planId: 'plan-1', plannedFor: at, completedAt: at, performed: [] };
}

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'a1',
    family: 'sessions',
    title: 'Milestone',
    description: 'Did a thing.',
    achievedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAthleteProfile as jest.Mock).mockReturnValue(profile());
  (listHistory as jest.Mock).mockReturnValue([]);
});

describe('refreshReminders', () => {
  it('cancels every reminder when there is no profile yet', async () => {
    (getAthleteProfile as jest.Mock).mockReturnValue(undefined);
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('today-workout');
    expect(notificationPort.cancel).toHaveBeenCalledWith('layoff-checkin');
    expect(notificationPort.cancel).toHaveBeenCalledWith('streak-keeper');
    expect(notificationPort.scheduleDaily).not.toHaveBeenCalled();
    expect(notificationPort.scheduleOnce).not.toHaveBeenCalled();
  });

  it('cancels every reminder when the athlete has not opted in', async () => {
    (getAthleteProfile as jest.Mock).mockReturnValue(profile({ notificationsEnabled: false }));
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('today-workout');
    expect(notificationPort.cancel).toHaveBeenCalledWith('layoff-checkin');
    expect(notificationPort.cancel).toHaveBeenCalledWith('streak-keeper');
  });

  it('always schedules today-workout daily when enabled, with generic copy absent any plan', async () => {
    await refreshReminders(NOW);
    expect(notificationPort.scheduleDaily).toHaveBeenCalledWith(
      'today-workout',
      { hour: 8, minute: 0 },
      expect.objectContaining({ body: expect.stringContaining("today's session") }),
    );
  });

  it("names today's scheduled workout type when one exists", async () => {
    (getAthleteProfile as jest.Mock).mockReturnValue(
      profile({ scheduledWorkouts: [{ plannedFor: NOW, workoutType: 'cardio' }] }),
    );
    await refreshReminders(NOW);
    expect(notificationPort.scheduleDaily).toHaveBeenCalledWith(
      'today-workout',
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('Cardio') }),
    );
  });

  it('falls back to the standing preferred workout type', async () => {
    (getAthleteProfile as jest.Mock).mockReturnValue(profile({ preferredWorkoutType: 'sculpting' }));
    await refreshReminders(NOW);
    expect(notificationPort.scheduleDaily).toHaveBeenCalledWith(
      'today-workout',
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('Sculpting') }),
    );
  });

  it('cancels the layoff check-in when there is no history at all', async () => {
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('layoff-checkin');
    expect(notificationPort.scheduleOnce).not.toHaveBeenCalledWith('layoff-checkin', expect.anything(), expect.anything());
  });

  it('schedules the layoff check-in for 3 days after the last completed session', async () => {
    (listHistory as jest.Mock).mockReturnValue([sessionDaysAgo(1)]);
    await refreshReminders(NOW);
    expect(notificationPort.scheduleOnce).toHaveBeenCalledWith(
      'layoff-checkin',
      NOW - DAY + 3 * DAY,
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it('cancels the layoff check-in once its would-be fire time has already passed', async () => {
    (listHistory as jest.Mock).mockReturnValue([sessionDaysAgo(10)]);
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('layoff-checkin');
  });

  it('cancels the streak keeper when there is no active streak', async () => {
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('streak-keeper');
  });

  it('schedules the streak keeper for later today when a streak is active and today is not yet logged', async () => {
    (listHistory as jest.Mock).mockReturnValue([sessionDaysAgo(1), sessionDaysAgo(2)]);
    await refreshReminders(NOW);
    const today19 = new Date(NOW);
    today19.setHours(19, 0, 0, 0);
    expect(notificationPort.scheduleOnce).toHaveBeenCalledWith(
      'streak-keeper',
      today19.getTime(),
      expect.objectContaining({ body: expect.stringContaining('2-day streak') }),
    );
  });

  it('cancels the streak keeper once today is already logged', async () => {
    (listHistory as jest.Mock).mockReturnValue([sessionDaysAgo(0), sessionDaysAgo(1)]);
    await refreshReminders(NOW);
    expect(notificationPort.cancel).toHaveBeenCalledWith('streak-keeper');
  });
});

describe('checkStreakMilestone', () => {
  it('does nothing when nothing newly unlocked is a streak achievement', async () => {
    await checkStreakMilestone([achievement({ family: 'exercise-pr' })]);
    expect(notificationPort.fireNow).not.toHaveBeenCalled();
  });

  it('does nothing when notifications are disabled even if a streak tier was hit', async () => {
    (getAthleteProfile as jest.Mock).mockReturnValue(profile({ notificationsEnabled: false }));
    await checkStreakMilestone([achievement({ family: 'streak', title: '7-day streak' })]);
    expect(notificationPort.fireNow).not.toHaveBeenCalled();
  });

  it('fires immediately when a streak tier was newly unlocked', async () => {
    await checkStreakMilestone([achievement({ family: 'streak', title: '7-day streak', description: 'Trained 7 days in a row.' })]);
    expect(notificationPort.fireNow).toHaveBeenCalledWith('streak-milestone', {
      title: '7-day streak',
      body: 'Trained 7 days in a row.',
    });
  });
});
