import type { PerformedSet, SessionRecord } from '../../types';
import {
  cardioCategoryEnduranceIndex,
  cardioMinutesBySession,
  exerciseCardioMinutes,
  latestCardioSnapshot,
  overallEnduranceIndex,
  overallEndurancePerformanceIndex,
  recentEnduranceTrend,
  recentTrainingLoadTrend,
  sessionDurationMinutes,
  sessionRpe,
  sessionTrainingLoad,
  weeklyCardioMinutesByCategory,
  ALL_CARDIO_CATEGORIES,
  WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES,
} from '../endurance';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 0, 15, 12); // fixed, mid-month, mid-day — never near a DST edge

function completedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { durationSec: 600, completed: true, ...overrides };
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

function cardioSession(dayOffset: number, seconds: number): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'ca-machine-steady',
        name: 'Steady-state cardio (machine)',
        primaryAreas: [],
        sets: [completedSet({ durationSec: seconds })],
      },
    ],
  });
}

// 'ca-machine-steady' is 'steady_cardio' and 'ca-intervals-bw' is 'interval'
// in the real catalog (cardioCategoryEnduranceIndex/overallEnduranceIndex
// join by exerciseId against EXERCISES, same as movementCategoryStrengthIndex).
function intervalSession(dayOffset: number, seconds: number): SessionRecord {
  const completedAt = NOW + dayOffset * DAY_MS;
  return record({
    completedAt,
    plannedFor: completedAt,
    performed: [
      {
        exerciseId: 'ca-intervals-bw',
        name: 'Bodyweight interval circuit',
        primaryAreas: [],
        sets: [completedSet({ durationSec: seconds })],
      },
    ],
  });
}

describe('cardioMinutesBySession', () => {
  it('is empty for no history', () => {
    expect(cardioMinutesBySession([])).toEqual([]);
  });

  it('ignores non-cardio exercises via catalog lookup', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 600 })],
        },
      ],
    });
    expect(cardioMinutesBySession([rec])).toEqual([]);
  });

  it('sums durationSec across multiple sets and exercises', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'ca-machine-steady',
          name: 'Steady-state cardio (machine)',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 300 }), completedSet({ durationSec: 300 })],
        },
        {
          exerciseId: 'ca-intervals-bw',
          name: 'Bodyweight interval circuit',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 600 })],
        },
      ],
    });
    const [point] = cardioMinutesBySession([rec]);
    expect(point.minutes).toBe(20); // (300+300+600)/60
  });

  it('ignores incomplete sets', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'ca-machine-steady',
          name: 'Steady-state cardio (machine)',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 600 }), completedSet({ durationSec: 600, completed: false })],
        },
      ],
    });
    const [point] = cardioMinutesBySession([rec]);
    expect(point.minutes).toBe(10);
  });

  it('rounds to the nearest minute', () => {
    const rec = cardioSession(0, 50); // 50s -> 0.83min -> rounds to 1
    const [point] = cardioMinutesBySession([rec]);
    expect(point.minutes).toBe(1);
  });

  it('is sorted ascending by date', () => {
    const history = [cardioSession(2, 600), cardioSession(0, 600), cardioSession(1, 600)];
    const points = cardioMinutesBySession(history);
    expect(points.map((p) => p.date)).toEqual([...points.map((p) => p.date)].sort((a, b) => a - b));
  });
});

describe('recentEnduranceTrend', () => {
  it('is unknown for fewer than 2 points', () => {
    expect(recentEnduranceTrend([]).direction).toBe('unknown');
    expect(recentEnduranceTrend([cardioSession(0, 600)]).direction).toBe('unknown');
  });

  it('is up when the latest exceeds 110% of the average of the rest', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 600), cardioSession(2, 1320)]; // 22min vs avg 10min
    expect(recentEnduranceTrend(history).direction).toBe('up');
  });

  it('is down when the latest is below 90% of the average of the rest', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 600), cardioSession(2, 300)]; // 5min vs avg 10min
    expect(recentEnduranceTrend(history).direction).toBe('down');
  });

  it('stays flat exactly at the +/-10% boundary (strict inequality)', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 600), cardioSession(2, 660)]; // exactly +10%
    expect(recentEnduranceTrend(history).direction).toBe('flat');
  });
});

describe('sessionRpe', () => {
  it('prefers debrief.overallRpe even when set RPEs disagree', () => {
    const rec = record({
      debrief: { overallRpe: 8 },
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ rpe: 5 }), completedSet({ rpe: 6 })],
        },
      ],
    });
    expect(sessionRpe(rec)).toBe(8);
  });

  it('averages completed sets’ RPE across all exercises when there is no debrief RPE', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ rpe: 6 }), completedSet({ rpe: 10, completed: false })],
        },
        {
          exerciseId: 'pu-bb-bench',
          name: 'Barbell bench press',
          primaryAreas: [],
          sets: [completedSet({ rpe: 8 })],
        },
      ],
    });
    expect(sessionRpe(rec)).toBe(7); // (6 + 8) / 2, incomplete set's rpe:10 ignored
  });

  it('is undefined when neither a debrief RPE nor any set RPE exists', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ rpe: undefined })],
        },
      ],
    });
    expect(sessionRpe(rec)).toBeUndefined();
  });
});

describe('sessionDurationMinutes', () => {
  it('prefers wall-clock duration when both timestamps are present and positive', () => {
    const rec = record({ startedAt: NOW, completedAt: NOW + 30 * 60_000 });
    expect(sessionDurationMinutes(rec)).toBe(30);
  });

  it('falls back to the per-set duration estimate when timestamps are missing', () => {
    const rec = record({
      startedAt: undefined,
      completedAt: NOW,
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ durationSec: undefined, reps: 10 })],
        },
      ],
    });
    expect(sessionDurationMinutes(rec)).toBeCloseTo((10 * 3) / 60, 6);
  });

  it('falls back when completedAt does not exceed startedAt', () => {
    const rec = record({
      startedAt: NOW,
      completedAt: NOW,
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 120 })],
        },
      ],
    });
    expect(sessionDurationMinutes(rec)).toBe(2);
  });

  it('is undefined when nothing resolves', () => {
    const rec = record({ startedAt: undefined, completedAt: undefined, performed: [] });
    expect(sessionDurationMinutes(rec)).toBeUndefined();
  });
});

describe('sessionTrainingLoad', () => {
  it('is empty for no history', () => {
    expect(sessionTrainingLoad([])).toEqual([]);
  });

  it('excludes sessions missing RPE even if duration is available', () => {
    const rec = record({
      startedAt: NOW,
      completedAt: NOW + 30 * 60_000,
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ rpe: undefined })],
        },
      ],
    });
    expect(sessionTrainingLoad([rec])).toEqual([]);
  });

  it('computes load = round(rpe * minutes)', () => {
    const rec = record({
      debrief: { overallRpe: 7 },
      startedAt: NOW,
      completedAt: NOW + 40 * 60_000,
      performed: [],
    });
    const [point] = sessionTrainingLoad([rec]);
    expect(point.load).toBe(280); // 7 * 40
    expect(point.rpe).toBe(7);
    expect(point.minutes).toBe(40);
  });

  it('is sorted ascending by date', () => {
    const session = (dayOffset: number): SessionRecord =>
      record({
        debrief: { overallRpe: 6 },
        startedAt: NOW + dayOffset * DAY_MS,
        completedAt: NOW + dayOffset * DAY_MS + 20 * 60_000,
      });
    const history = [session(2), session(0), session(1)];
    const points = sessionTrainingLoad(history);
    expect(points.map((p) => p.date)).toEqual([...points.map((p) => p.date)].sort((a, b) => a - b));
  });
});

describe('recentTrainingLoadTrend', () => {
  const session = (dayOffset: number, rpe: number, minutes: number): SessionRecord =>
    record({
      debrief: { overallRpe: rpe },
      startedAt: NOW + dayOffset * DAY_MS,
      completedAt: NOW + dayOffset * DAY_MS + minutes * 60_000,
    });

  it('mirrors recentEnduranceTrend’s up/flat/down thresholds', () => {
    const up = [session(0, 5, 40), session(1, 5, 40), session(2, 5, 88)]; // 440 vs avg 200 -> up
    expect(recentTrainingLoadTrend(up).direction).toBe('up');

    const down = [session(0, 5, 40), session(1, 5, 40), session(2, 5, 16)]; // 80 vs avg 200 -> down
    expect(recentTrainingLoadTrend(down).direction).toBe('down');
  });

  it('is unknown when fewer than 2 sessions have BOTH rpe and duration computable, even if more sessions exist', () => {
    const history = [
      session(0, 5, 40),
      record({ startedAt: NOW + 1 * DAY_MS, completedAt: NOW + 1 * DAY_MS + 40 * 60_000, performed: [] }), // no rpe at all
    ];
    expect(recentTrainingLoadTrend(history).direction).toBe('unknown');
  });
});

describe('exerciseCardioMinutes', () => {
  it('is empty for no history', () => {
    expect(exerciseCardioMinutes([], 'ca-machine-steady')).toEqual([]);
  });

  it('isolates one exercise’s minutes from another exercise in the same session', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'ca-machine-steady',
          name: 'Steady-state cardio (machine)',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 600 })],
        },
        {
          exerciseId: 'ca-intervals-bw',
          name: 'Bodyweight interval circuit',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 300 })],
        },
      ],
    });
    expect(exerciseCardioMinutes([rec], 'ca-machine-steady')).toEqual([{ date: rec.completedAt, minutes: 10 }]);
    expect(exerciseCardioMinutes([rec], 'ca-intervals-bw')).toEqual([{ date: rec.completedAt, minutes: 5 }]);
  });

  it('is sorted ascending by date', () => {
    const history = [cardioSession(2, 600), cardioSession(0, 600), cardioSession(1, 600)];
    const points = exerciseCardioMinutes(history, 'ca-machine-steady');
    expect(points.map((p) => p.date)).toEqual([...points.map((p) => p.date)].sort((a, b) => a - b));
  });
});

describe('latestCardioSnapshot', () => {
  it('is empty for no history', () => {
    expect(latestCardioSnapshot([])).toEqual([]);
  });

  it('excludes non-cardio exercises via catalog lookup', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ durationSec: 600 })],
        },
      ],
    });
    expect(latestCardioSnapshot([rec])).toEqual([]);
  });

  it('has no previousMinutes for a single session and sets it for a second', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 300)];
    const [snap] = latestCardioSnapshot(history);
    expect(snap.minutes).toBe(5);
    expect(snap.previousMinutes).toBe(10);
  });
});

describe('cardioCategoryEnduranceIndex', () => {
  it('is undefined for a category no cardio exercise ever touched', () => {
    const history = [cardioSession(0, 600)];
    expect(cardioCategoryEnduranceIndex(history, 'interval')).toBeUndefined();
  });

  it('isolates steady (machine) from interval (bodyweight circuit) via the catalog movementPattern join', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 900), intervalSession(0, 300), intervalSession(1, 360)];
    const steady = cardioCategoryEnduranceIndex(history, 'steady');
    const interval = cardioCategoryEnduranceIndex(history, 'interval');
    expect(steady?.anchorExerciseId).toBe('ca-machine-steady');
    expect(interval?.anchorExerciseId).toBe('ca-intervals-bw');
  });

  it('computes indexPct as the mean of per-exercise (latest minutes ÷ best-ever minutes) ratios', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 300)]; // 10min -> 5min, ratio 50%
    const steady = cardioCategoryEnduranceIndex(history, 'steady');
    expect(steady?.contributingExercises).toBe(1);
    expect(steady?.indexPct).toBeCloseTo(50, 6);
  });

  it('returns an anchor-only result when the only exercise has a single session', () => {
    const history = [cardioSession(0, 600)];
    const steady = cardioCategoryEnduranceIndex(history, 'steady');
    expect(steady?.indexPct).toBeUndefined();
    expect(steady?.contributingExercises).toBe(0);
    expect(steady?.anchorExerciseId).toBe('ca-machine-steady');
    expect(steady?.anchorMinutes).toBe(10);
    expect(steady?.anchorPreviousMinutes).toBeUndefined();
  });
});

describe('overallEnduranceIndex', () => {
  it('is undefined when no category has any data', () => {
    const overall = overallEnduranceIndex([]);
    expect(overall.indexPct).toBeUndefined();
    expect(overall.previousIndexPct).toBeUndefined();
    for (const category of ALL_CARDIO_CATEGORIES) expect(overall.categories[category]).toBeUndefined();
  });

  it('is a plain mean of the category indices that have data, excluding categories with none', () => {
    const history = [cardioSession(0, 600), cardioSession(1, 300), intervalSession(0, 300), intervalSession(1, 300)];
    const overall = overallEnduranceIndex(history);
    const steady = cardioCategoryEnduranceIndex(history, 'steady');
    const interval = cardioCategoryEnduranceIndex(history, 'interval');
    expect(overall.indexPct).toBeCloseTo(((steady!.indexPct as number) + (interval!.indexPct as number)) / 2, 6);
  });
});

describe('weeklyCardioMinutesByCategory', () => {
  it('is 0 for no history', () => {
    expect(weeklyCardioMinutesByCategory([], 'steady', 0, NOW)).toBe(0);
  });

  it('isolates steady from interval minutes', () => {
    const history = [cardioSession(0, 600), intervalSession(0, 300)];
    expect(weeklyCardioMinutesByCategory(history, 'steady', 0, NOW)).toBe(10);
    expect(weeklyCardioMinutesByCategory(history, 'interval', 0, NOW)).toBe(5);
  });

  it('only counts sessions within the requested ISO week', () => {
    const history = [cardioSession(0, 600), cardioSession(-14, 600)]; // 2 weeks before NOW
    expect(weeklyCardioMinutesByCategory(history, 'steady', 0, NOW)).toBe(10);
  });
});

describe('overallEndurancePerformanceIndex', () => {
  it('is 0% (not undefined) for empty history — 0 is a real answer, not "no data"', () => {
    const result = overallEndurancePerformanceIndex([], NOW);
    expect(result.pct).toBe(0);
    expect(result.minutes).toBe(0);
  });

  it('weights interval minutes double toward the moderate-equivalent total (vigorous-equivalence convention)', () => {
    const history = [intervalSession(0, 45 * 60)]; // 45 min interval -> 90 moderate-equivalent min
    const result = overallEndurancePerformanceIndex(history, NOW);
    expect(result.minutes).toBe(90);
    expect(result.pct).toBeCloseTo((90 / WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES) * 100, 6);
  });

  it('combines steady + 2x interval and caps pct at 100', () => {
    const history = [cardioSession(0, 100 * 60), intervalSession(0, 100 * 60)]; // 100 + 200 = 300 min
    const result = overallEndurancePerformanceIndex(history, NOW);
    expect(result.minutes).toBe(300);
    expect(result.pct).toBe(100);
  });
});
