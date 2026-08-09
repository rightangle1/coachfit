import type { PerformedSet, SessionRecord } from '../../types';
import { detectAchievements, evaluateAchievements } from '../achievements';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 0, 15, 12); // fixed, mid-month, mid-day — never near a DST edge

function completedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { reps: 10, weightKg: 50, completed: true, ...overrides };
}

let seq = 0;
function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  seq += 1;
  return {
    id: `sess-${seq}`,
    planId: 'plan-1',
    plannedFor: NOW,
    completedAt: NOW,
    performed: [
      {
        exerciseId: 'bench',
        name: 'Bench press',
        primaryAreas: [{ group: 'chest' }],
        sets: [completedSet()],
      },
    ],
    ...overrides,
  };
}

/** `count` completed sessions, one per day ending at `endMs` (inclusive),
 * each a plain bodyweight-style session (no weight) unless overridden. */
function dailyStreak(count: number, endMs: number, mapper?: (i: number) => Partial<SessionRecord>): SessionRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const completedAt = endMs - (count - 1 - i) * DAY_MS;
    return record({ completedAt, plannedFor: completedAt, ...(mapper ? mapper(i) : {}) });
  });
}

describe('evaluateAchievements / detectAchievements — v1 regression', () => {
  it('is empty for no completed sessions', () => {
    expect(detectAchievements([])).toEqual([]);
    const rec = record({ completedAt: undefined });
    expect(detectAchievements([rec])).toEqual([]);
  });

  it('unlocks first-session on the very first completed workout', () => {
    const [a] = detectAchievements([record()]);
    expect(a.id).toBe('first-session');
    expect(a.family).toBe('first-session');
  });

  it('unlocks streak-3 and streak-7 at exactly those tiers, not before', () => {
    const two = dailyStreak(2, NOW);
    expect(detectAchievements(two).some((a) => a.id === 'streak-3')).toBe(false);

    const three = dailyStreak(3, NOW);
    const threeIds = detectAchievements(three).map((a) => a.id);
    expect(threeIds).toContain('streak-3');
    expect(threeIds).not.toContain('streak-7');

    const seven = dailyStreak(7, NOW);
    expect(detectAchievements(seven).map((a) => a.id)).toContain('streak-7');
  });

  it('unlocks sessions-5/10/25 at exactly those counts', () => {
    const four = Array.from({ length: 4 }, (_, i) => record({ completedAt: NOW + i * DAY_MS, plannedFor: NOW + i * DAY_MS }));
    expect(detectAchievements(four).some((a) => a.id === 'sessions-5')).toBe(false);

    const five = Array.from({ length: 5 }, (_, i) => record({ completedAt: NOW + i * DAY_MS, plannedFor: NOW + i * DAY_MS }));
    expect(detectAchievements(five).map((a) => a.id)).toContain('sessions-5');
  });

  it('does not credit the first-ever logged weight as a PR, only later improvements', () => {
    const first = record({ completedAt: NOW, plannedFor: NOW });
    const flat = record({
      completedAt: NOW + DAY_MS,
      plannedFor: NOW + DAY_MS,
      performed: [{ exerciseId: 'bench', name: 'Bench press', primaryAreas: [{ group: 'chest' }], sets: [completedSet()] }],
    });
    const improved = record({
      completedAt: NOW + 2 * DAY_MS,
      plannedFor: NOW + 2 * DAY_MS,
      performed: [
        { exerciseId: 'bench', name: 'Bench press', primaryAreas: [{ group: 'chest' }], sets: [completedSet({ weightKg: 60 })] },
      ],
    });
    const achievements = detectAchievements([first, flat, improved]);
    const prs = achievements.filter((a) => a.family === 'exercise-pr');
    expect(prs).toHaveLength(1);
    expect(prs[0].e1rmKg).toBeGreaterThan(50);
  });
});

describe('scalar-tier families — boundary + progress', () => {
  it('reports locked next-tier progress before the boundary is crossed', () => {
    const { locked } = evaluateAchievements(dailyStreak(5, NOW), NOW);
    const nextStreak = locked.find((l) => l.family === 'streak');
    expect(nextStreak?.progress).toEqual({ current: 5, target: 7 });
    expect(nextStreak?.hint).toBe('5/7 days');
  });

  it('has no locked entry for a family once its highest tier is crossed', () => {
    const { locked } = evaluateAchievements(dailyStreak(100, NOW), NOW);
    expect(locked.find((l) => l.family === 'streak')).toBeUndefined();
  });

  it('unlocks tonnage tiers as cumulative lifetime weight crosses them', () => {
    // 10 sessions x 10 reps x 50kg = 500kg each = 5,000kg lifetime at session 10.
    const sessions = Array.from({ length: 10 }, (_, i) => record({ completedAt: NOW + i * DAY_MS, plannedFor: NOW + i * DAY_MS }));
    const { unlocked, locked } = evaluateAchievements(sessions, NOW);
    expect(unlocked.some((a) => a.id === 'tonnage-5000')).toBe(true);
    const nextTonnage = locked.find((l) => l.family === 'tonnage');
    expect(nextTonnage?.progress?.target).toBe(25000);
  });

  it('unlocks endurance-minutes tiers from cumulative cardio session minutes', () => {
    const sessions = [
      record({
        completedAt: NOW,
        plannedFor: NOW,
        performed: [
          {
            exerciseId: 'ca-machine-steady',
            name: 'Steady cardio',
            primaryAreas: [{ group: 'quads' }],
            sets: [completedSet({ durationSec: 3600, weightKg: undefined, reps: undefined })],
          },
        ],
      }),
    ];
    const { unlocked } = evaluateAchievements(sessions, NOW);
    expect(unlocked.some((a) => a.id === 'endurance-minutes-60')).toBe(true);
  });
});

describe('workout-style keyed family', () => {
  it('stays locked until a completed session carries that workoutType', () => {
    const { locked, unlocked } = evaluateAchievements([record({ workoutType: undefined })], NOW);
    expect(locked.some((l) => l.id === 'workout-style-yoga')).toBe(true);
    expect(unlocked.some((a) => a.id === 'workout-style-yoga')).toBe(false);
  });

  it('unlocks once a completed session has the matching workoutType', () => {
    const { unlocked, locked } = evaluateAchievements([record({ workoutType: 'yoga' })], NOW);
    expect(unlocked.some((a) => a.id === 'workout-style-yoga')).toBe(true);
    expect(locked.some((l) => l.id === 'workout-style-yoga')).toBe(false);
  });
});

describe('muscle-pr keyed family', () => {
  it('only the first PR touching a group unlocks that group, later PRs still show as exercise-pr', () => {
    const first = record({ completedAt: NOW, plannedFor: NOW });
    const pr1 = record({
      completedAt: NOW + DAY_MS,
      plannedFor: NOW + DAY_MS,
      performed: [{ exerciseId: 'bench', name: 'Bench press', primaryAreas: [{ group: 'chest' }], sets: [completedSet({ weightKg: 60 })] }],
    });
    const pr2 = record({
      completedAt: NOW + 2 * DAY_MS,
      plannedFor: NOW + 2 * DAY_MS,
      performed: [{ exerciseId: 'bench', name: 'Bench press', primaryAreas: [{ group: 'chest' }], sets: [completedSet({ weightKg: 70 })] }],
    });
    const { unlocked } = evaluateAchievements([first, pr1, pr2], NOW);
    const musclePrs = unlocked.filter((a) => a.family === 'muscle-pr' && a.id === 'muscle-pr-chest');
    expect(musclePrs).toHaveLength(1);
    expect(musclePrs[0].achievedAt).toBe(NOW + DAY_MS); // first crossing, not the second
    expect(musclePrs[0].e1rmKg).toBeGreaterThan(50); // the actual value lifted, not just "a PR happened"
    expect(unlocked.filter((a) => a.family === 'exercise-pr')).toHaveLength(2); // both still counted individually
  });
});

describe('comebackAchievements', () => {
  it('does not fire for the first session ever (nothing to compare against)', () => {
    const { unlocked } = evaluateAchievements([record()], NOW);
    expect(unlocked.some((a) => a.family === 'comeback')).toBe(false);
  });

  it('fires at exactly a 7-day gap, not at 6', () => {
    const a = record({ completedAt: NOW, plannedFor: NOW });
    const bJustUnder = record({ completedAt: NOW + 6 * DAY_MS, plannedFor: NOW + 6 * DAY_MS });
    expect(evaluateAchievements([a, bJustUnder], NOW).unlocked.some((x) => x.family === 'comeback')).toBe(false);

    const bAt = record({ completedAt: NOW + 7 * DAY_MS, plannedFor: NOW + 7 * DAY_MS });
    expect(evaluateAchievements([a, bAt], NOW).unlocked.some((x) => x.family === 'comeback')).toBe(true);
  });

  it('picks the single highest tier for a long gap instead of stacking multiple', () => {
    const a = record({ completedAt: NOW, plannedFor: NOW });
    const b = record({ completedAt: NOW + 40 * DAY_MS, plannedFor: NOW + 40 * DAY_MS });
    const comebacks = evaluateAchievements([a, b], NOW).unlocked.filter((x) => x.family === 'comeback');
    expect(comebacks).toHaveLength(1);
    expect(comebacks[0].description).toContain('40 days');
  });
});

describe('cardioPrAchievements', () => {
  it('does not credit the first-ever cardio session as a PR', () => {
    const cardio = (completedAt: number, durationSec: number) =>
      record({
        completedAt,
        plannedFor: completedAt,
        performed: [
          {
            exerciseId: 'ca-machine-steady',
            name: 'Steady cardio',
            primaryAreas: [{ group: 'quads' }],
            sets: [completedSet({ durationSec, weightKg: undefined, reps: undefined })],
          },
        ],
      });
    const first = cardio(NOW, 1200);
    const { unlocked: afterFirst } = evaluateAchievements([first], NOW);
    expect(afterFirst.some((a) => a.family === 'cardio-pr')).toBe(false);

    const longer = cardio(NOW + DAY_MS, 1800);
    const { unlocked } = evaluateAchievements([first, longer], NOW);
    const prs = unlocked.filter((a) => a.family === 'cardio-pr');
    expect(prs).toHaveLength(1);
    expect(prs[0].minutes).toBe(30);
  });
});
