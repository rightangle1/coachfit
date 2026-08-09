import type { PerformedSet, SessionRecord } from '../../types';
import {
  bestE1rmSnapshot,
  epley1RM,
  exerciseBestStats,
  exerciseHistory,
  latestStrengthSnapshot,
  movementCategoryPerformanceIndex,
  movementCategoryStrengthIndex,
  muscleGroupStrengthIndex,
  overallStrengthIndex,
  overallStrengthPerformanceIndex,
  ALL_MOVEMENT_CATEGORIES,
} from '../strength';
import { MRV } from '../volume';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 0, 15, 12); // fixed, mid-month, mid-day — never near a DST edge

function completedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { reps: 5, weightKg: 100, completed: true, ...overrides };
}

let seq = 0;
function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  seq += 1;
  return {
    id: `sess-${seq}`,
    planId: 'plan-1',
    plannedFor: NOW,
    completedAt: NOW,
    performed: [],
    ...overrides,
  };
}

function benchSession(dayOffset: number, weightKg: number, reps = 5): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'pu-bb-bench',
        name: 'Barbell bench press',
        primaryAreas: [{ group: 'chest' }],
        sets: [completedSet({ weightKg, reps })],
      },
    ],
  });
}

function flySession(dayOffset: number, weightKg: number, reps = 10): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'pu-db-fly',
        name: 'Dumbbell chest fly',
        primaryAreas: [{ group: 'chest' }],
        sets: [completedSet({ weightKg, reps })],
      },
    ],
  });
}

// Real catalog ids (movementCategoryStrengthIndex joins by exerciseId against
// EXERCISES, unlike the muscle-group functions above which only read the
// performed record's own primaryAreas) — 'sq-bb-back' is 'squat' (-> legs)
// and 'pl-pullup' is 'pull' in the catalog; 'pu-bb-bench'/'pu-db-fly' above
// are both 'push'.
function squatSession(dayOffset: number, weightKg: number, reps = 5): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'sq-bb-back',
        name: 'Barbell back squat',
        primaryAreas: [{ group: 'quads' }],
        sets: [completedSet({ weightKg, reps })],
      },
    ],
  });
}

function pullupSession(dayOffset: number, weightKg: number, reps = 5): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'pl-pullup',
        name: 'Pull-up',
        primaryAreas: [{ group: 'back' }],
        sets: [completedSet({ weightKg, reps })],
      },
    ],
  });
}

describe('epley1RM', () => {
  it('matches the formula weight * (1 + reps/30) for a table of inputs', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 6);
    expect(epley1RM(100, 10)).toBeCloseTo(100 * (1 + 10 / 30), 6);
    expect(epley1RM(100, 30)).toBeCloseTo(100 * 2, 6);
    expect(epley1RM(0, 10)).toBe(0);
  });
});

describe('exerciseHistory', () => {
  it('is empty for no history', () => {
    expect(exerciseHistory([], 'pu-bb-bench')).toEqual([]);
  });

  it('ignores sessions without completedAt', () => {
    const rec = benchSession(0, 100);
    rec.completedAt = undefined;
    expect(exerciseHistory([rec], 'pu-bb-bench')).toEqual([]);
  });

  it('ignores sets missing weight or reps, or not completed', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'pu-bb-bench',
          name: 'Barbell bench press',
          primaryAreas: [{ group: 'chest' }],
          sets: [
            completedSet({ weightKg: undefined }),
            completedSet({ reps: undefined }),
            completedSet({ completed: false }),
          ],
        },
      ],
    });
    expect(exerciseHistory([rec], 'pu-bb-bench')).toEqual([]);
  });

  it('never produces a point for a zero-weight or bodyweight-only set', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'pu-bb-bench',
          name: 'Barbell bench press',
          primaryAreas: [{ group: 'chest' }],
          sets: [completedSet({ weightKg: 0 }), completedSet({ weightKg: undefined })],
        },
      ],
    });
    expect(exerciseHistory([rec], 'pu-bb-bench')).toEqual([]);
  });

  it('takes the max e1RM across multiple completed sets in one session', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'pu-bb-bench',
          name: 'Barbell bench press',
          primaryAreas: [{ group: 'chest' }],
          sets: [completedSet({ weightKg: 80, reps: 5 }), completedSet({ weightKg: 100, reps: 5 })],
        },
      ],
    });
    const points = exerciseHistory([rec], 'pu-bb-bench');
    expect(points).toHaveLength(1);
    expect(points[0].e1rm).toBeCloseTo(epley1RM(100, 5), 1);
  });

  it('is sorted ascending by date across sessions', () => {
    const history = [benchSession(2, 100), benchSession(0, 90), benchSession(1, 95)];
    const points = exerciseHistory(history, 'pu-bb-bench');
    expect(points.map((p) => p.date)).toEqual([...points.map((p) => p.date)].sort((a, b) => a - b));
  });
});

describe('latestStrengthSnapshot', () => {
  it('is empty for no history', () => {
    expect(latestStrengthSnapshot([])).toEqual([]);
  });

  it('has no previousE1rm for a single session', () => {
    const [snap] = latestStrengthSnapshot([benchSession(0, 100)]);
    expect(snap.previousE1rm).toBeUndefined();
  });

  it('sets previousE1rm to the earlier session for two sessions', () => {
    const history = [benchSession(0, 100), benchSession(1, 90)];
    const [snap] = latestStrengthSnapshot(history);
    expect(snap.e1rm).toBeCloseTo(epley1RM(90, 5), 1);
    expect(snap.previousE1rm).toBeCloseTo(epley1RM(100, 5), 1);
  });

  it('sorts descending by latest date across exercises', () => {
    const history = [benchSession(0, 100), flySession(1, 50)];
    const snaps = latestStrengthSnapshot(history);
    expect(snaps[0].exerciseId).toBe('pu-db-fly');
    expect(snaps[1].exerciseId).toBe('pu-bb-bench');
  });
});

describe('bestE1rmSnapshot', () => {
  it('takes the max across sessions per requested id and omits ids with no history', () => {
    const history = [benchSession(0, 100), benchSession(1, 90)];
    const snapshot = bestE1rmSnapshot(history, ['pu-bb-bench', 'pu-db-fly']);
    expect(snapshot['pu-bb-bench']).toBeCloseTo(epley1RM(100, 5), 1);
    expect(snapshot['pu-db-fly']).toBeUndefined();
  });
});

describe('muscleGroupStrengthIndex', () => {
  it('is undefined for a group no exercise ever touched', () => {
    const history = [benchSession(0, 100)];
    expect(muscleGroupStrengthIndex(history, 'back')).toBeUndefined();
  });

  it('is isolated from other groups’ history', () => {
    const backRecord = record({
      performed: [
        {
          exerciseId: 'ba-row',
          name: 'Barbell row',
          primaryAreas: [{ group: 'back' }],
          sets: [completedSet({ weightKg: 60, reps: 8 })],
        },
      ],
    });
    const history = [benchSession(0, 100), backRecord];
    const chest = muscleGroupStrengthIndex(history, 'chest');
    expect(chest?.anchorExerciseId).toBe('pu-bb-bench');
    const back = muscleGroupStrengthIndex(history, 'back');
    expect(back?.anchorExerciseId).toBe('ba-row');
  });

  it('returns an anchor-only result when the only exercise has a single session', () => {
    const history = [benchSession(0, 100)];
    const result = muscleGroupStrengthIndex(history, 'chest');
    expect(result?.indexPct).toBeUndefined();
    expect(result?.previousIndexPct).toBeUndefined();
    expect(result?.contributingExercises).toBe(0);
    expect(result?.anchorExerciseId).toBe('pu-bb-bench');
    expect(result?.anchorSessionCount).toBe(1);
    expect(result?.anchorE1rm).toBeCloseTo(epley1RM(100, 5), 1);
    expect(result?.anchorPreviousE1rm).toBeUndefined();
  });

  it('computes indexPct as the mean of per-exercise (latest ÷ best-ever) ratios', () => {
    const history = [
      benchSession(0, 100), // e1rm 116.7
      benchSession(1, 90), // e1rm 105.0 -> ratio vs prior best 116.7
      flySession(0, 50), // e1rm 66.7
      flySession(1, 50), // e1rm 66.7 -> ratio 100% (flat)
    ];
    const result = muscleGroupStrengthIndex(history, 'chest');
    const benchE1rm1 = Math.round(epley1RM(100, 5) * 10) / 10;
    const benchE1rm2 = Math.round(epley1RM(90, 5) * 10) / 10;
    const benchRatio = (benchE1rm2 / benchE1rm1) * 100;
    const expectedIndex = (benchRatio + 100) / 2;
    expect(result?.contributingExercises).toBe(2);
    expect(result?.indexPct).toBeCloseTo(expectedIndex, 2);
  });

  it('computes previousIndexPct against the running-best-as-of-that-point, not a later PR', () => {
    // bench: 100kg (best so far) -> 90kg (dip) -> 110kg (new PR, exceeds session 1)
    const history = [benchSession(0, 100), benchSession(1, 90), benchSession(2, 110)];
    const result = muscleGroupStrengthIndex(history, 'chest');

    const e1rm1 = Math.round(epley1RM(100, 5) * 10) / 10;
    const e1rm2 = Math.round(epley1RM(90, 5) * 10) / 10;
    const e1rm3 = Math.round(epley1RM(110, 5) * 10) / 10;

    const correctPrevious = (e1rm2 / e1rm1) * 100;
    const naiveAgainstFinalBest = (e1rm2 / e1rm3) * 100; // wrong: retroactive against the eventual PR

    expect(result?.previousIndexPct).toBeCloseTo(correctPrevious, 2);
    expect(result?.previousIndexPct).not.toBeCloseTo(naiveAgainstFinalBest, 1);
  });

  it('picks the anchor by most completed sessions, not the most recent one', () => {
    const history = [
      flySession(0, 50),
      flySession(1, 50),
      flySession(2, 50),
      benchSession(3, 100), // most recent, but bench only has 1 session
    ];
    const result = muscleGroupStrengthIndex(history, 'chest');
    expect(result?.anchorExerciseId).toBe('pu-db-fly');
    expect(result?.anchorSessionCount).toBe(3);
  });

  it('breaks a tie in session count deterministically by exerciseId', () => {
    const history = [benchSession(0, 100), benchSession(1, 90), flySession(0, 50), flySession(1, 50)];
    const result = muscleGroupStrengthIndex(history, 'chest');
    // 'pu-bb-bench' < 'pu-db-fly' lexicographically
    expect(result?.anchorExerciseId).toBe('pu-bb-bench');
  });

  it('excludes single-session exercises from the index average while still allowing them as anchor candidates', () => {
    const history = [benchSession(0, 100), benchSession(1, 90), flySession(0, 50)];
    const result = muscleGroupStrengthIndex(history, 'chest');
    expect(result?.contributingExercises).toBe(1);
    const e1rm1 = Math.round(epley1RM(100, 5) * 10) / 10;
    const e1rm2 = Math.round(epley1RM(90, 5) * 10) / 10;
    expect(result?.indexPct).toBeCloseTo((e1rm2 / e1rm1) * 100, 2);
  });
});

describe('movementCategoryStrengthIndex', () => {
  it('is undefined for a category no exercise ever touched', () => {
    const history = [benchSession(0, 100)];
    expect(movementCategoryStrengthIndex(history, 'legs')).toBeUndefined();
  });

  it('isolates push (bench) from legs (squat) via the catalog movementPattern join', () => {
    const history = [benchSession(0, 100), benchSession(1, 90), squatSession(0, 120), squatSession(1, 130)];
    const push = movementCategoryStrengthIndex(history, 'push');
    const legs = movementCategoryStrengthIndex(history, 'legs');
    expect(push?.anchorExerciseId).toBe('pu-bb-bench');
    expect(legs?.anchorExerciseId).toBe('sq-bb-back');
    expect(legs?.contributingExercises).toBe(1);
  });

  it('pools multiple exercises sharing a pattern (bench + fly, both push) into one category index', () => {
    const history = [benchSession(0, 100), benchSession(1, 90), flySession(0, 50), flySession(1, 50)];
    const push = movementCategoryStrengthIndex(history, 'push');
    expect(push?.contributingExercises).toBe(2);
  });

  it('maps pull-ups to the pull category and not push', () => {
    const history = [pullupSession(0, 20), pullupSession(1, 25)];
    const pull = movementCategoryStrengthIndex(history, 'pull');
    expect(pull?.anchorExerciseId).toBe('pl-pullup');
    expect(movementCategoryStrengthIndex(history, 'push')).toBeUndefined();
  });
});

describe('overallStrengthIndex', () => {
  it('is undefined when no category has any data', () => {
    const overall = overallStrengthIndex([]);
    expect(overall.indexPct).toBeUndefined();
    expect(overall.previousIndexPct).toBeUndefined();
    for (const category of ALL_MOVEMENT_CATEGORIES) expect(overall.categories[category]).toBeUndefined();
  });

  it('is a plain mean of the category indices that have data, excluding categories with none', () => {
    const history = [
      benchSession(0, 100), benchSession(1, 90), // push
      squatSession(0, 120), squatSession(1, 130), // legs
    ];
    const overall = overallStrengthIndex(history);
    const push = movementCategoryStrengthIndex(history, 'push');
    const legs = movementCategoryStrengthIndex(history, 'legs');
    expect(overall.categories.pull).toBeUndefined();
    expect(overall.categories.core).toBeUndefined();
    expect(overall.indexPct).toBeCloseTo(((push!.indexPct as number) + (legs!.indexPct as number)) / 2, 6);
  });
});

describe('movementCategoryPerformanceIndex', () => {
  it('is 0% (not undefined) for a category with no volume logged this week — 0 is a real answer, not "no data"', () => {
    const result = movementCategoryPerformanceIndex([], 'push', NOW);
    expect(result.pct).toBe(0);
    expect(result.previousPct).toBe(0);
  });

  it('computes pct as sets ÷ MRV per muscle group, averaged across the category (untouched groups count as 0%)', () => {
    // push = chest, shoulders, triceps. Only chest gets a set. secondaryAreas
    // explicitly empty — 'pu-bb-bench' is a real catalog id whose own entry
    // credits shoulders as a secondary mover; that catalog fallback only
    // applies when the performed record omits secondaryAreas (groupsFor,
    // fatigue.ts), so pin it here to isolate exactly one group's credit.
    const history = [
      record({
        performed: [
          {
            exerciseId: 'pu-bb-bench',
            name: 'Barbell bench press',
            primaryAreas: [{ group: 'chest' }],
            secondaryAreas: [],
            sets: [completedSet({ weightKg: 100, reps: 5 })],
          },
        ],
      }),
    ];
    const result = movementCategoryPerformanceIndex(history, 'push', NOW);
    expect(result.pct).toBeCloseTo(((1 / MRV) * 100) / 3, 6);
  });

  it('caps a single muscle group’s contribution at 100% even with sets far beyond MRV', () => {
    const manySetsRecord = record({
      performed: [
        {
          exerciseId: 'pu-bb-bench',
          name: 'Barbell bench press',
          primaryAreas: [{ group: 'chest' }],
          secondaryAreas: [],
          sets: Array.from({ length: 25 }, () => completedSet({ weightKg: 100, reps: 5 })),
        },
      ],
    });
    const result = movementCategoryPerformanceIndex([manySetsRecord], 'push', NOW);
    expect(result.pct).toBeCloseTo(100 / 3, 6); // chest capped at 100%, shoulders/triceps at 0%
  });

  it('isolates categories from each other (legs volume does not leak into push)', () => {
    const history = [squatSession(0, 100)];
    expect(movementCategoryPerformanceIndex(history, 'push', NOW).pct).toBe(0);
  });
});

describe('overallStrengthPerformanceIndex', () => {
  it('is 0% across the board (not undefined) for empty history', () => {
    const overall = overallStrengthPerformanceIndex([], NOW);
    expect(overall.pct).toBe(0);
    for (const category of ALL_MOVEMENT_CATEGORIES) expect(overall.categories[category].pct).toBe(0);
  });

  it('is a plain mean of the 4 category percentages', () => {
    const history = [benchSession(0, 100), squatSession(0, 120)];
    const overall = overallStrengthPerformanceIndex(history, NOW);
    const expectedMean =
      ALL_MOVEMENT_CATEGORIES.reduce((sum, c) => sum + movementCategoryPerformanceIndex(history, c, NOW).pct, 0) /
      ALL_MOVEMENT_CATEGORIES.length;
    expect(overall.pct).toBeCloseTo(expectedMean, 6);
  });
});

describe('exerciseBestStats — loaded timed/hold sets (e.g. a farmer\'s carry)', () => {
  it('tracks the heaviest completed weight of a loaded timed set separately from a rep PR', () => {
    const history = [
      record({
        performed: [{
          exerciseId: 'carry',
          name: 'Carry',
          primaryAreas: [],
          sets: [
            completedSet({ reps: undefined, weightKg: 20, durationSec: 30 }),
            completedSet({ reps: undefined, weightKg: 24, durationSec: 45 }),
          ],
        }],
      }),
    ];
    const stats = exerciseBestStats(history, 'carry');
    expect(stats.bestLoadedWeightKg).toBe(24);
    expect(stats.maxDurationSec).toBe(45);
    // No rep-based data at all — the rep-PR/e1RM fields must stay unset.
    expect(stats.bestWeightKg).toBeUndefined();
    expect(stats.maxReps).toBeUndefined();
    expect(stats.bestE1rmKg).toBeUndefined();
  });

  it('keeps the ordinary weight×reps PR path untouched for a normal weighted lift', () => {
    const history = [benchSession(0, 100)];
    const stats = exerciseBestStats(history, 'pu-bb-bench');
    expect(stats.bestWeightKg).toBe(100);
    expect(stats.bestWeightReps).toBe(5);
    expect(stats.bestLoadedWeightKg).toBeUndefined();
  });
});
