import type { PerformedSet, SessionRecord } from '../../types';
import { estimateSessionCalories , mifflinStJeorRmr } from '../calories';

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
    performed: [],
    ...overrides,
  };
}

describe('estimateSessionCalories', () => {
  it('is zero for an empty session', () => {
    const result = estimateSessionCalories(record({ performed: [] }));
    expect(result).toEqual({ totalKcal: 0, byModality: {} });
  });

  it('uses the mobility MET tier (2.5) for wu-flow', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'wu-flow',
          name: 'Warmup flow',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 3600 })],
        },
      ],
    });
    const result = estimateSessionCalories(rec, 70);
    expect(result.totalKcal).toBe(Math.round(2.5 * 70 * 1));
    expect(result.byModality.mobility).toBeCloseTo(2.5 * 70 * 1, 5);
  });

  it('uses the strength MET tier (5.0) for a non-core strength exercise, estimating reps at 3s/rep', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ reps: 10, weightKg: undefined })],
        },
      ],
    });
    const result = estimateSessionCalories(rec, 70);
    const expectedHours = (10 * 3) / 3600;
    expect(result.totalKcal).toBe(Math.round(5.0 * 70 * expectedHours));
  });

  it('honors co-plank\'s researched metValue (2.8, ADR-0123 Batch C) over the flat core tier (3.8)', () => {
    // Every core-pattern catalog entry is now individually researched
    // (Batch C), so the generic core-tier fallback (MET_BY_TIER.core) is no
    // longer reachable through real catalog data — this asserts the
    // override precedence directly instead.
    const rec = record({
      performed: [
        {
          exerciseId: 'co-plank',
          name: 'Plank',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 60 })],
        },
      ],
    });
    const result = estimateSessionCalories(rec, 70);
    const expectedHours = 60 / 3600;
    expect(result.totalKcal).toBe(Math.round(2.8 * 70 * expectedHours));
  });

  it('gives interval cardio a higher estimate than steady cardio for the same duration', () => {
    const steady = record({
      performed: [
        {
          exerciseId: 'ca-machine-steady',
          name: 'Steady cardio',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 600 })],
        },
      ],
    });
    const interval = record({
      performed: [
        {
          exerciseId: 'ca-intervals-bw',
          name: 'Interval cardio',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 600 })],
        },
      ],
    });
    const steadyResult = estimateSessionCalories(steady, 70);
    const intervalResult = estimateSessionCalories(interval, 70);
    expect(intervalResult.totalKcal).toBeGreaterThan(steadyResult.totalKcal);
    // Compare the un-rounded byModality figures — totalKcal is rounded to an
    // integer, which would make the ratio drift from the exact MET ratio.
    const steadyKcal = steadyResult.byModality.cardio ?? 0;
    const intervalKcal = intervalResult.byModality.cardio ?? 0;
    expect(intervalKcal / steadyKcal).toBeCloseTo(8.5 / 7.0, 5);
  });

  it('honors a researched per-exercise metValue over the tier fallback (ADR-0123)', () => {
    // ca-burpees carries metValue: 11.0 — well above the cardio_interval tier
    // (8.5) it would otherwise fall back to.
    const rec = record({
      performed: [
        {
          exerciseId: 'ca-burpees',
          name: 'Burpees',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 600 })],
        },
      ],
    });
    const result = estimateSessionCalories(rec, 70);
    const expectedHours = 600 / 3600;
    expect(result.totalKcal).toBe(Math.round(11.0 * 70 * expectedHours));
  });

  it('gives a real per-exercise metValue precedence, differentiating two same-pattern exercises', () => {
    // ca-burpees (metValue 11.0) vs ca-shadow-boxing (metValue 5.8) — both
    // real, researched values, not the same coarse tier bucket.
    const burpees = record({
      performed: [
        { exerciseId: 'ca-burpees', name: 'Burpees', primaryAreas: [], sets: [completedSet({ reps: undefined, durationSec: 600 })] },
      ],
    });
    const shadowBoxing = record({
      performed: [
        { exerciseId: 'ca-shadow-boxing', name: 'Shadow boxing', primaryAreas: [], sets: [completedSet({ reps: undefined, durationSec: 600 })] },
      ],
    });
    const burpeesResult = estimateSessionCalories(burpees, 70);
    const shadowBoxingResult = estimateSessionCalories(shadowBoxing, 70);
    expect(burpeesResult.totalKcal).toBeGreaterThan(shadowBoxingResult.totalKcal);
  });

  it('contributes zero seconds for incomplete sets', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ reps: 10, weightKg: undefined, completed: false })],
        },
      ],
    });
    expect(estimateSessionCalories(rec, 70).totalKcal).toBe(0);
  });

  it('contributes zero seconds for a set with neither durationSec nor reps', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [{ completed: true }],
        },
      ],
    });
    expect(estimateSessionCalories(rec, 70).totalKcal).toBe(0);
  });

  it('scales linearly with bodyweight', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'ca-machine-steady',
          name: 'Steady cardio',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 3600 })],
        },
      ],
    });
    const at70 = estimateSessionCalories(rec, 70).totalKcal;
    const at35 = estimateSessionCalories(rec, 35).totalKcal;
    expect(at35).toBe(Math.round(at70 / 2));
  });

  it('accumulates byModality across exercises sharing a modality', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ reps: 10, weightKg: undefined })],
        },
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat (again)',
          primaryAreas: [],
          sets: [completedSet({ reps: 10, weightKg: undefined })],
        },
      ],
    });
    const single = record({
      performed: [
        {
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [],
          sets: [completedSet({ reps: 10, weightKg: undefined })],
        },
      ],
    });
    const doubled = estimateSessionCalories(rec, 70);
    const singled = estimateSessionCalories(single, 70);
    // sq-bw is modality: 'general' — the bucket this accumulates into.
    expect(doubled.byModality.general).toBeCloseTo((singled.byModality.general ?? 0) * 2, 5);
  });

  it('always rounds totalKcal to an integer', () => {
    const rec = record({
      performed: [
        {
          exerciseId: 'wu-flow',
          name: 'Warmup flow',
          primaryAreas: [],
          sets: [completedSet({ reps: undefined, durationSec: 137 })],
        },
      ],
    });
    const result = estimateSessionCalories(rec, 63);
    expect(Number.isInteger(result.totalKcal)).toBe(true);
  });
});

describe('ADR-0127 — BMR-adjusted estimate', () => {
  const record: SessionRecord = {
    id: 'bmr',
    planId: 'p',
    plannedFor: 0,
    completedAt: 0,
    performed: [
      {
        exerciseId: 'unknown-strength',
        name: 'Strength',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ durationSec: 3600, completed: true }],
      },
    ],
  };

  it('is unchanged when only bodyweight is known — the old behavior exactly', () => {
    const legacy = estimateSessionCalories(record, 80);
    const viaProfile = estimateSessionCalories(record, { bodyweightKg: 80 });
    expect(viaProfile.totalKcal).toBe(legacy.totalKcal);
  });

  it('is unchanged when the body data is incomplete', () => {
    const partial = estimateSessionCalories(record, { bodyweightKg: 80, heightCm: 180 });
    expect(partial.totalKcal).toBe(estimateSessionCalories(record, 80).totalKcal);
  });

  it('separates two people of the same weight but different height and age', () => {
    const tallYoung = estimateSessionCalories(record, {
      bodyweightKg: 80, heightCm: 190, ageYears: 25, sex: 'male',
    });
    const shortOlder = estimateSessionCalories(record, {
      bodyweightKg: 80, heightCm: 160, ageYears: 65, sex: 'female',
    });
    expect(tallYoung.totalKcal).toBeGreaterThan(shortOlder.totalKcal);
  });

  it('treats an unspecified sex as the midpoint, not as a default person', () => {
    const base = { bodyweightKg: 80, heightCm: 175, ageYears: 40 } as const;
    const male = estimateSessionCalories(record, { ...base, sex: 'male' }).totalKcal;
    const female = estimateSessionCalories(record, { ...base, sex: 'female' }).totalKcal;
    const unspecified = estimateSessionCalories(record, { ...base, sex: 'unspecified' }).totalKcal;
    expect(unspecified).toBeLessThan(male);
    expect(unspecified).toBeGreaterThan(female);
  });

  it('keeps the adjustment inside a sane band — it refines, it does not invent', () => {
    const extreme = estimateSessionCalories(record, {
      bodyweightKg: 40, heightCm: 210, ageYears: 18, sex: 'male',
    });
    const plain = estimateSessionCalories(record, 40);
    const ratio = extreme.totalKcal / plain.totalKcal;
    expect(ratio).toBeLessThanOrEqual(1.2001);
    expect(ratio).toBeGreaterThanOrEqual(0.7999);
  });
});

describe('mifflinStJeorRmr', () => {
  it('matches the published formula for a known case', () => {
    // Male, 80 kg, 180 cm, 30 y: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorRmr({ bodyweightKg: 80, heightCm: 180, ageYears: 30, sex: 'male' })).toBeCloseTo(1780);
  });

  it('is undefined without the full set of inputs', () => {
    expect(mifflinStJeorRmr({ bodyweightKg: 80, heightCm: 180 })).toBeUndefined();
  });
});
