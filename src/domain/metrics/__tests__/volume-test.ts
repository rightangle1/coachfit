import { FATIGUE } from '../../engine/fatigue';
import type { PerformedSet, SessionRecord } from '../../types';
import {
  MEV,
  MRV,
  isoWeekStart,
  sessionCountsByModalitySince,
  volumeStatus,
  weeklyLoadByExercise,
  weeklySessionCountsByModality,
  weeklyTotalVolumeSeries,
  weeklyVolumeByGroup,
  weeklyVolumeByGroupSeries,
  rollingSevenDayVolumeByGroup,
  volumeLandmarksFor,
} from '../volume';

const NOW = Date.now();
const THIS_WEEK_START = isoWeekStart(NOW);
// Safely mid-week (Wed afternoon) so it can never spill into an adjacent week.
const THIS_WEEK_MID = THIS_WEEK_START + 2 * 86_400_000 + 12 * 3_600_000;
const LAST_WEEK_MID = THIS_WEEK_MID - 7 * 86_400_000;

function completedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { reps: 10, weightKg: 50, completed: true, ...overrides };
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'sess-1',
    planId: 'plan-1',
    plannedFor: THIS_WEEK_MID,
    completedAt: THIS_WEEK_MID,
    performed: [
      {
        exerciseId: 'test-press',
        name: 'Test press',
        primaryAreas: [{ group: 'chest' }],
        secondaryAreas: [{ group: 'triceps' }],
        sets: [completedSet()],
      },
    ],
    ...overrides,
  };
}

describe('weeklyVolumeByGroup', () => {
  it('returns no credit for empty history', () => {
    expect(weeklyVolumeByGroup([], 0, NOW)).toEqual({});
  });

  it('credits primary at 100% and secondary at FATIGUE.SECONDARY_CREDIT', () => {
    const out = weeklyVolumeByGroup([record()], 0, NOW);
    expect(out.chest).toBe(1);
    expect(out.triceps).toBeCloseTo(FATIGUE.SECONDARY_CREDIT);
  });

  it('isolates sessions to the requested ISO week', () => {
    const thisWeek = record();
    const lastWeek = record({ id: 'sess-2', completedAt: LAST_WEEK_MID, plannedFor: LAST_WEEK_MID });
    const currentWeek = weeklyVolumeByGroup([thisWeek, lastWeek], 0, NOW);
    const priorWeek = weeklyVolumeByGroup([thisWeek, lastWeek], 1, NOW);
    expect(currentWeek.chest).toBe(1); // not 2 — lastWeek's session must not leak in
    expect(priorWeek.chest).toBe(1); // not 2 — thisWeek's session must not leak in
  });

  it('ignores incomplete sets', () => {
    const out = weeklyVolumeByGroup(
      [
        record({
          performed: [
            {
              exerciseId: 'test-press',
              name: 'Test press',
              primaryAreas: [{ group: 'chest' }],
              sets: [completedSet({ completed: false })],
            },
          ],
        }),
      ],
      0,
      NOW,
    );
    expect(out.chest).toBeUndefined();
  });
});

describe('volumeStatus', () => {
  it('bands status at the MEV/MRV edges', () => {
    expect(volumeStatus(MEV - 1)).toBe('under');
    expect(volumeStatus(MEV)).toBe('optimal');
    expect(volumeStatus(MRV - 1)).toBe('optimal');
    expect(volumeStatus(MRV)).toBe('over');
  });

  it('uses goal- and experience-specific starting ranges', () => {
    const beginner = volumeLandmarksFor('general', 'beginner');
    const advancedHypertrophy = volumeLandmarksFor('hypertrophy', 'advanced');
    const power = volumeLandmarksFor('power', 'intermediate');
    expect(advancedHypertrophy.mrv).toBeGreaterThan(beginner.mrv);
    expect(power.mrv).toBeLessThan(advancedHypertrophy.mrv);
    expect(volumeStatus(power.mrv, power)).toBe('over');
  });

  it('tracks rolling seven-day work independently of the ISO program week', () => {
    const at = NOW - 6 * 86_400_000;
    const out = rollingSevenDayVolumeByGroup([record({ plannedFor: at, completedAt: at })], NOW);
    expect(out.chest).toBe(1);
  });
});

describe('weeklyLoadByExercise', () => {
  it('returns an ascending-by-week series', () => {
    const points = weeklyLoadByExercise(
      [
        record({
          id: 'a',
          completedAt: LAST_WEEK_MID,
          plannedFor: LAST_WEEK_MID,
          performed: [
            {
              exerciseId: 'bench',
              name: 'Bench',
              primaryAreas: [{ group: 'chest' }],
              sets: [completedSet({ reps: 5, weightKg: 100 })],
            },
          ],
        }),
        record({
          id: 'b',
          performed: [
            {
              exerciseId: 'bench',
              name: 'Bench',
              primaryAreas: [{ group: 'chest' }],
              sets: [completedSet({ reps: 5, weightKg: 105 })],
            },
          ],
        }),
      ],
      'bench',
    );
    expect(points).toHaveLength(2);
    expect(points[0].weekStart).toBeLessThan(points[1].weekStart);
    expect(points[0].volumeLoad).toBe(500);
    expect(points[1].volumeLoad).toBe(525);
  });

  it('ignores sets missing weight or reps', () => {
    const points = weeklyLoadByExercise(
      [
        record({
          performed: [
            {
              exerciseId: 'bw',
              name: 'Bodyweight thing',
              primaryAreas: [{ group: 'chest' }],
              sets: [{ reps: 10, completed: true }],
            },
          ],
        }),
      ],
      'bw',
    );
    expect(points).toEqual([]);
  });
});

describe('weeklySessionCountsByModality', () => {
  it('buckets completed sessions by dominant catalog modality', () => {
    const strengthSession = record({
      id: 'str-1',
      performed: [
        {
          exerciseId: 'sq-db-front', // real strength catalog entry
          name: 'DB front squat',
          primaryAreas: [{ group: 'quads' }],
          sets: [completedSet()],
        },
      ],
    });
    const cardioSession = record({
      id: 'cardio-1',
      performed: [
        {
          exerciseId: 'ca-machine-steady', // real cardio catalog entry
          name: 'Steady cardio',
          primaryAreas: [{ group: 'quads' }],
          sets: [completedSet()],
        },
      ],
    });
    const out = weeklySessionCountsByModality([strengthSession, cardioSession], 0, NOW);
    expect(out.strength).toBe(1);
    expect(out.cardio).toBe(1);
  });

  it('ignores exercises not present in the catalog', () => {
    const out = weeklySessionCountsByModality([record()], 0, NOW);
    expect(out).toEqual({});
  });
});

describe('sessionCountsByModalitySince — item 5: rolling-window classifier (ADR-0142 v4)', () => {
  it('buckets by dominant modality over an arbitrary window, not just an ISO week', () => {
    // A rolling 7-day trailing window straddling THIS_WEEK_MID, deliberately
    // NOT aligned to an ISO week boundary — the whole point of this function
    // over weeklySessionCountsByModality.
    const since = THIS_WEEK_MID - 3 * 86_400_000;
    const until = THIS_WEEK_MID + 4 * 86_400_000;
    const strengthSession = record({
      id: 'str-1',
      completedAt: THIS_WEEK_MID - 1 * 86_400_000,
      performed: [{ exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [{ group: 'quads' }], sets: [completedSet()] }],
    });
    const outOfWindowSession = record({
      id: 'str-2',
      completedAt: THIS_WEEK_MID - 10 * 86_400_000, // outside [since, until)
      performed: [{ exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [{ group: 'quads' }], sets: [completedSet()] }],
    });
    const out = sessionCountsByModalitySince([strengthSession, outOfWindowSession], since, until);
    expect(out).toEqual({ strength: 1 });
  });

  it('excludes a session at exactly `until` (half-open interval)', () => {
    const boundarySession = record({ id: 'b1', completedAt: THIS_WEEK_MID });
    const out = sessionCountsByModalitySince([boundarySession], THIS_WEEK_MID - 86_400_000, THIS_WEEK_MID);
    expect(out).toEqual({});
  });

  it('weeklySessionCountsByModality is unchanged after the refactor into a thin wrapper', () => {
    const strengthSession = record({
      id: 'str-1',
      performed: [{ exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [{ group: 'quads' }], sets: [completedSet()] }],
    });
    expect(weeklySessionCountsByModality([strengthSession], 0, NOW)).toEqual({ strength: 1 });
  });
});

describe('weeklyVolumeByGroupSeries', () => {
  it('returns exactly `weeks` ascending points, zero-filled where there is no data', () => {
    const points = weeklyVolumeByGroupSeries([], 'chest', 4, NOW);
    expect(points).toHaveLength(4);
    expect(points.every((p) => p.sets === 0)).toBe(true);
    for (let i = 1; i < points.length; i++) expect(points[i].weekStart).toBeGreaterThan(points[i - 1].weekStart);
  });

  it('places each session\'s credited sets in its own week', () => {
    const points = weeklyVolumeByGroupSeries([record(), record({ id: 'b', completedAt: LAST_WEEK_MID, plannedFor: LAST_WEEK_MID })], 'chest', 2, NOW);
    expect(points[points.length - 1].sets).toBe(1); // this week
    expect(points[points.length - 2].sets).toBe(1); // last week
  });
});

describe('weeklyTotalVolumeSeries', () => {
  it('zero-fills empty weeks instead of skipping them', () => {
    const points = weeklyTotalVolumeSeries([], 4, NOW);
    expect(points).toHaveLength(4);
    expect(points.every((p) => p.totalVolumeLoad === 0)).toBe(true);
  });

  it('sums volume load across every exercise in a session, per week, ascending', () => {
    const twoExercises = record({
      performed: [
        { exerciseId: 'a', name: 'A', primaryAreas: [{ group: 'chest' }], sets: [completedSet({ reps: 5, weightKg: 100 })] },
        { exerciseId: 'b', name: 'B', primaryAreas: [{ group: 'back' }], sets: [completedSet({ reps: 10, weightKg: 20 })] },
      ],
    });
    const points = weeklyTotalVolumeSeries([twoExercises], 2, NOW);
    expect(points[0].weekStart).toBeLessThan(points[1].weekStart);
    expect(points[1].totalVolumeLoad).toBe(700); // (5*100) + (10*20)
  });

  it('ignores sets missing weight or reps', () => {
    const bodyweightOnly = record({
      performed: [{ exerciseId: 'bw', name: 'Pull-up', primaryAreas: [{ group: 'back' }], sets: [{ reps: 10, completed: true }] }],
    });
    const points = weeklyTotalVolumeSeries([bodyweightOnly], 1, NOW);
    expect(points[0].totalVolumeLoad).toBe(0);
  });
});
