import { isoWeekStart } from '../../metrics';
import type { Exercise, PerformedSet, SessionRecord } from '../../types';
import {
  SAFETY,
  aggregateExerciseSessionWork,
  recommendLoad,
  recommendPrescription,
  snapToAvailableWeight,
  snapToSensibleWeight,
  weeklyLoadCeiling,
} from '../progression';

const NOW = Date.now();
const WEEK0 = isoWeekStart(NOW);
const WEEK1 = WEEK0 - 7 * 86_400_000;
const WEEK2 = WEEK0 - 14 * 86_400_000;
const MID = 2 * 86_400_000 + 12 * 3_600_000; // safely mid-week

const TARGET_RPE = 7;

const EX: Exercise = {
  id: 'bench',
  name: 'Test Bench',
  modality: 'strength',
  movementPattern: 'push',
  primaryAreas: ['chest'],
  equipment: ['barbell'],
  progression: 'weight',
  description: 'Test fixture.',
  steps: [],
};

function sessionAt(weekStart: number, weightKg: number, rpe?: number, id = `s-${weekStart}`): SessionRecord {
  const completedAt = weekStart + MID;
  return {
    id,
    planId: 'plan-1',
    plannedFor: completedAt,
    completedAt,
    performed: [
      {
        exerciseId: EX.id,
        name: EX.name,
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 5, weightKg, rpe, completed: true }],
      },
    ],
  };
}

describe('recommendLoad — ADR-0103 v2 stall trigger', () => {
  it('returns undefined with no history', () => {
    expect(recommendLoad(EX, [], TARGET_RPE)).toBeUndefined();
  });

  it('an earned increase wins even against a stalling multi-week trend', () => {
    // Flat/declining volume-load for 3 weeks, but the most recent session felt
    // easy (RPE well below target) — the real-time signal must still win.
    const history = [
      sessionAt(WEEK2, 100, 8),
      sessionAt(WEEK1, 100, 8),
      sessionAt(WEEK0, 100, TARGET_RPE - 2), // last session: felt easy
    ];
    const rec = recommendLoad(EX, history, TARGET_RPE);
    expect(rec?.weightKg).toBeGreaterThan(100);
    expect(rec?.weightKg).toBeLessThanOrEqual(100 * (1 + SAFETY.MAX_SESSION_LOAD_INCREASE_PCT));
    expect(rec?.note).toMatch(/felt easy/);
  });

  it('a clear grind-out deload is unaffected by an increasing volume trend', () => {
    const history = [
      sessionAt(WEEK2, 80, 7),
      sessionAt(WEEK1, 90, 7),
      sessionAt(WEEK0, 100, TARGET_RPE + 3), // last session: ground out
    ];
    const rec = recommendLoad(EX, history, TARGET_RPE);
    expect(rec?.weightKg).toBe(90); // 100 * 0.9
    expect(rec?.note).toMatch(/RPE/);
    expect(rec?.note).not.toMatch(/stalled/);
  });

  it('a volume-load plateau alone does not trigger a deload', () => {
    const history = [
      sessionAt(WEEK2, 102, TARGET_RPE),
      sessionAt(WEEK1, 101, TARGET_RPE),
      sessionAt(WEEK0, 100, TARGET_RPE), // on-target RPE, but load has crept down
    ];
    const rec = recommendLoad(EX, history, TARGET_RPE);
    expect(rec?.weightKg).toBe(100);
    expect(rec?.note).toMatch(/^holding/);
  });

  it('an ambiguous hold with insufficient weekly data just holds', () => {
    // Only one week of history — not enough to call a stall.
    const history = [sessionAt(WEEK0, 100, TARGET_RPE)];
    const rec = recommendLoad(EX, history, TARGET_RPE);
    expect(rec?.weightKg).toBe(100);
    expect(rec?.note).toMatch(/^holding/);
  });

  it('an ambiguous hold with a genuinely rising trend just holds', () => {
    const history = [
      sessionAt(WEEK2, 90, TARGET_RPE),
      sessionAt(WEEK1, 95, TARGET_RPE),
      sessionAt(WEEK0, 100, TARGET_RPE),
    ];
    const rec = recommendLoad(EX, history, TARGET_RPE);
    expect(rec?.weightKg).toBe(100);
    expect(rec?.note).toMatch(/^holding/);
  });

  it('uses a validated calibration set to raise the working baseline within the hard cap', () => {
    const calibrated: SessionRecord = {
      id: 'calibration',
      planId: 'plan-calibration',
      plannedFor: NOW,
      completedAt: NOW,
      performed: [{
        exerciseId: EX.id,
        name: EX.name,
        primaryAreas: [{ group: 'chest' }],
        sets: [
          { reps: 10, weightKg: 100, rpe: 7, completed: true },
          { reps: 20, weightKg: 110, rpe: 9, completed: true, isCalibration: true },
        ],
      }],
    };
    const rec = recommendLoad(EX, [calibrated], TARGET_RPE);
    expect(rec?.weightKg).toBe(110); // 10% cap from the 100 kg working baseline
    expect(rec?.note).toMatch(/calibrated/);
  });
});

describe('snapToAvailableWeight — ADR-0115', () => {
  it('passes the weight through unchanged when unconstrained', () => {
    expect(snapToAvailableWeight(22, undefined)).toBe(22);
    expect(snapToAvailableWeight(22, [])).toBe(22);
  });

  it('rounds down to the nearest owned weight — never up past a safety-capped target', () => {
    expect(snapToAvailableWeight(22, [10, 15, 20, 25])).toBe(20);
  });

  it('returns the weight unchanged when it exactly matches an owned weight', () => {
    expect(snapToAvailableWeight(20, [10, 15, 20, 25])).toBe(20);
  });

  it('falls back to the smallest owned weight when everything owned exceeds the target', () => {
    expect(snapToAvailableWeight(8, [10, 15, 20])).toBe(10);
  });
});

describe('snapToSensibleWeight — default output rules', () => {
  it('uses 2.5-kilogram steps when no specific equipment weights are supplied', () => {
    expect(snapToSensibleWeight(42.5, 'kg')).toBe(42.5);
  });

  it('uses five-pound steps for imperial athletes', () => {
    const suggestedKg = snapToSensibleWeight(45, 'lb');
    expect(Math.round(suggestedKg / 0.45359237)).toBe(95);
  });

  it('uses explicitly owned weights instead of the default five-unit step', () => {
    expect(snapToSensibleWeight(42.5, 'kg', [20, 30, 42, 50])).toBe(42);
  });

  it('never turns a small positive legacy load into zero', () => {
    expect(snapToSensibleWeight(2.5, 'kg')).toBe(2.5);
  });
});

describe('recommendLoad — invalid zero-weight history', () => {
  it('treats a zero-weight completed set as missing load evidence', () => {
    const zeroOnly = sessionAt(WEEK0, 0, TARGET_RPE);
    expect(recommendLoad(EX, [zeroOnly], TARGET_RPE)).toBeUndefined();
  });
});

describe('recommendLoad — loadsWeight (loaded timed/hold movements)', () => {
  const CARRY: Exercise = {
    id: 'db-farmers-carry',
    name: "Test Dumbbell Farmer's Carry",
    modality: 'strength',
    movementPattern: 'carry',
    primaryAreas: ['forearms', 'back'],
    equipment: ['dumbbells'],
    progression: 'time',
    loadsWeight: true,
    description: 'Test fixture.',
    steps: [],
  };

  function carrySessionAt(weekStart: number, weightKg: number, rpe?: number, id = `carry-${weekStart}`): SessionRecord {
    const completedAt = weekStart + MID;
    return {
      id,
      planId: 'plan-1',
      plannedFor: completedAt,
      completedAt,
      performed: [
        {
          exerciseId: CARRY.id,
          name: CARRY.name,
          primaryAreas: [{ group: 'forearms' }],
          sets: [{ durationSec: 30, weightKg, rpe, completed: true }],
        },
      ],
    };
  }

  it('a plain time-progression exercise without loadsWeight is never given a weight recommendation', () => {
    const plainHold: Exercise = { ...CARRY, id: 'plain-hold', loadsWeight: undefined };
    const history = [carrySessionAt(WEEK0, 20, TARGET_RPE)];
    expect(recommendLoad(plainHold, history, TARGET_RPE)).toBeUndefined();
  });

  it('recommends a load for a loaded carry off its own weightKg history, same as a weight-progression lift', () => {
    const history = [
      carrySessionAt(WEEK2, 100, 8),
      carrySessionAt(WEEK1, 100, 8),
      carrySessionAt(WEEK0, 100, TARGET_RPE - 2), // felt easy last time
    ];
    const rec = recommendLoad(CARRY, history, TARGET_RPE);
    expect(rec?.weightKg).toBeGreaterThan(100);
    expect(rec?.weightKg).toBeLessThanOrEqual(100 * (1 + SAFETY.MAX_SESSION_LOAD_INCREASE_PCT));
  });

  it('returns undefined with no history, same as a weight-progression exercise', () => {
    expect(recommendLoad(CARRY, [], TARGET_RPE)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Double progression (ADR-0125)
// ---------------------------------------------------------------------------

describe('recommendPrescription — ADR-0125 double progression', () => {
  const RANGE = { min: 8, max: 12 };

  const RAISE: Exercise = {
    id: 'db-lateral-raise',
    name: 'Test Lateral Raise',
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['shoulders'],
    equipment: ['dumbbells'],
    progression: 'weight',
    description: 'Test fixture.',
    steps: [],
  };

  const PUSHUP: Exercise = {
    ...RAISE,
    id: 'pushup',
    name: 'Test Push-up',
    primaryAreas: ['chest'],
    equipment: ['bodyweight'],
    progression: 'reps',
  };

  const PLANK: Exercise = {
    ...RAISE,
    id: 'plank',
    name: 'Test Plank',
    movementPattern: 'core',
    primaryAreas: ['abs'],
    equipment: ['bodyweight'],
    progression: 'time',
  };

  function performed(exercise: Exercise, sets: PerformedSet[], at = WEEK0 + MID): SessionRecord {
    return {
      id: `rec-${exercise.id}-${at}`,
      planId: 'plan-1',
      plannedFor: at,
      completedAt: at,
      performed: [
        { exerciseId: exercise.id, name: exercise.name, primaryAreas: [{ group: 'shoulders' }], sets },
      ],
    };
  }

  it('progresses a 10 kg lift that the percentage cap alone could never move (F1)', () => {
    // The regression this exists to prevent: cap = 10 * 1.10 = 11, the smallest
    // real step is 2.5 kg, and snapping floors 11 back to 10 — forever.
    expect(recommendLoad(RAISE, [performed(RAISE, [
      { reps: 12, weightKg: 10, rpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE)?.weightKg).toBe(10); // the old model stalls...

    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 12, weightKg: 10, rpe: TARGET_RPE, prescribedReps: 12, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);

    expect(rec.weightKg).toBe(10); // a 25% minimum jump is not proven by 12 reps
    expect(rec.reps).toBe(13); // preserve the achievement and build more evidence
  });

  it('climbs reps at a fixed load until the top of the range is earned', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 9, weightKg: 10, rpe: TARGET_RPE, prescribedReps: 9, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBe(10);
    expect(rec.reps).toBe(10);
  });

  it('takes a bigger rep step when the work also felt easy', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 9, weightKg: 10, rpe: TARGET_RPE - 2, prescribedReps: 9, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.reps).toBe(11);
  });

  it('progresses an athlete who never edits RPE (F3)', () => {
    // The tracker pre-fills rpe with targetRpe, so tapping through logs exactly
    // the value that means "hold." Reps must carry the progression instead.
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 10, weightKg: 20, rpe: TARGET_RPE, prescribedReps: 10, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.reps).toBe(11);
  });

  it('progresses an athlete who logs no RPE at all (F3)', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 10, weightKg: 20, prescribedReps: 10, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.reps).toBe(11);
  });

  it('treats an RPE that differs from the prescribed one as a real signal', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 10, weightKg: 20, rpe: TARGET_RPE + 3, prescribedReps: 10, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBe(17.5); // 20 * 0.9 = 18, floored to the 2.5 kg grid
    expect(rec.reps).toBe(RANGE.min);
    expect(rec.note).toMatch(/deloaded/);
  });

  it('repeats the ask when the prescribed reps were not completed', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 9, weightKg: 20, rpe: TARGET_RPE, prescribedReps: 12, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBe(20);
    expect(rec.reps).toBe(12);
  });

  it('progresses bodyweight reps past the range — there is no load axis (F4)', () => {
    const rec = recommendPrescription(PUSHUP, [performed(PUSHUP, [
      { reps: 20, prescribedReps: 15, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBeUndefined();
    expect(rec.reps).toBe(21); // not clamped to RANGE.max = 12
  });

  it('progresses a timed hold (F4)', () => {
    const rec = recommendPrescription(PLANK, [performed(PLANK, [
      { durationSec: 45, prescribedDurationSec: 45, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.durationSec).toBe(50);
  });

  it('reconciles the load via e1RM when the rep band moves (F5)', () => {
    // bodybuilding (10 reps) -> sculpting (13 reps): same weight for 3 more reps
    // is a much harder set, so the load has to come down to match.
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 10, weightKg: 40, rpe: TARGET_RPE, prescribedReps: 10, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, { min: 12, max: 15 });
    expect(rec.reps).toBe(12);
    expect(rec.weightKg).toBeLessThan(40);
    expect(rec.weightKg).toBe(37.5);
  });

  it('keeps climbing reps when no heavier weight is actually owned', () => {
    // Resetting to range.min on an unchanged load would be a straight regression.
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 12, weightKg: 10, rpe: TARGET_RPE, prescribedReps: 12, prescribedRpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE, { available: [5, 10, 15] });
    expect(rec.weightKg).toBe(10);
    expect(rec.reps).toBe(13);
  });

  it('starts mid-range with no history, and leaves the load to the athlete', () => {
    // The centre, not the bottom: the band is centred on the session's existing
    // rep target, so a first exposure is prescribed exactly what it always was.
    const rec = recommendPrescription(RAISE, [], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBeUndefined();
    expect(rec.reps).toBe(10);
  });

  it('falls back to logged values on records predating ADR-0125', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 12, weightKg: 30, rpe: TARGET_RPE, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBe(32.5);
    expect(rec.reps).toBe(RANGE.min);
  });

  it('counts skipped and incomplete sets in the prescription but not performed work', () => {
    const rec = recommendPrescription(RAISE, [performed(RAISE, [
      { reps: 12, weightKg: 30, prescribedReps: 12, completed: false },
      { reps: 12, weightKg: 25, prescribedReps: 12, completed: true, skipped: true },
      { reps: 9, weightKg: 20, prescribedReps: 9, completed: true },
    ])], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBe(20);
    expect(rec.reps).toBe(11);
  });

  describe('aggregate-work progression', () => {
    const planned = (reps: number, completed: boolean, extra: Partial<PerformedSet> = {}): PerformedSet => ({
      reps,
      weightKg: 20,
      prescribedReps: 10,
      prescribedWeightKg: 20,
      prescribedRpe: TARGET_RPE,
      completed,
      ...extra,
    });

    it('credits 20 reps plus a skipped set against a 2 × 10 prescription and rebalances to 2 × 11', () => {
      const sets = [planned(20, true), planned(10, false, { skipped: true })];
      expect(aggregateExerciseSessionWork(sets, true)?.workCompletionRatio).toBe(1);
      const rec = recommendPrescription(RAISE, [performed(RAISE, sets)], TARGET_RPE, RANGE);
      expect(rec).toMatchObject({ weightKg: 20, reps: 11 });
    });

    it('does not progress 20 total reps against a 3 × 10 prescription', () => {
      const sets = [planned(20, true), planned(10, false, { skipped: true }), planned(10, false, { skipped: true })];
      expect(aggregateExerciseSessionWork(sets, true)?.workCompletionRatio).toBeCloseTo(2 / 3);
      expect(recommendPrescription(RAISE, [performed(RAISE, sets)], TARGET_RPE, RANGE).reps).toBe(10);
    });

    it('credits a 12, 10, 8 distribution as all prescribed work', () => {
      const sets = [planned(12, true), planned(10, true), planned(8, true)];
      expect(aggregateExerciseSessionWork(sets, true)?.equivalentRepsPerPlannedSet).toBe(10);
      expect(recommendPrescription(RAISE, [performed(RAISE, sets)], TARGET_RPE, RANGE).reps).toBe(11);
    });

    it('credits lower-load work proportionally without stepping the load', () => {
      const sets = Array.from({ length: 3 }, () => planned(12, true, { weightKg: 17.5 }));
      const summary = aggregateExerciseSessionWork(sets, true);
      expect(summary?.lowerLoad).toBe(true);
      expect(summary?.workCompletionRatio).toBeCloseTo(1.05);
      const rec = recommendPrescription(RAISE, [performed(RAISE, sets)], TARGET_RPE, RANGE);
      expect(rec.weightKg).toBe(20);
      expect(rec.note).toMatch(/repeat the planned load/);
    });

    it.each(['pain', 'form_breakdown'] as const)('records achieved work but blocks a load increase for %s', (quality) => {
      const sets = Array.from({ length: 3 }, () => planned(12, true, { prescribedReps: 12, quality }));
      const rec = recommendPrescription(RAISE, [performed(RAISE, sets)], TARGET_RPE, RANGE);
      expect(rec.weightKg).toBe(20);
      expect(rec.note).toMatch(/load held/);
    });
  });
});

describe('weeklyLoadCeiling — CLAUDE.md §6 weekly cap', () => {
  const LIFT: Exercise = { ...EX, id: 'weekly-lift' };
  const RANGE = { min: 8, max: 12 };

  function at(ms: number, weightKg: number, reps: number, isCalibration?: boolean): SessionRecord {
    return {
      id: `w-${ms}-${weightKg}`,
      planId: 'plan-1',
      plannedFor: ms,
      completedAt: ms,
      performed: [
        {
          exerciseId: LIFT.id,
          name: LIFT.name,
          primaryAreas: [{ group: 'chest' }],
          sets: [{ reps, weightKg, rpe: TARGET_RPE, prescribedReps: reps, prescribedRpe: TARGET_RPE, completed: true, isCalibration }],
        },
      ],
    };
  }

  it('has no ceiling without previous-week evidence', () => {
    expect(weeklyLoadCeiling(LIFT.id, [at(WEEK0 + MID, 100, 12)], WEEK0 + MID)).toBeUndefined();
  });

  it('caps at the documented percentage above last week’s best working load', () => {
    const ceiling = weeklyLoadCeiling(LIFT.id, [at(WEEK1 + MID, 100, 12)], WEEK0 + MID);
    expect(ceiling).toBeCloseTo(100 * (1 + SAFETY.MAX_WEEKLY_LOAD_INCREASE_PCT));
  });

  it('ignores calibration top sets — a max test is not a working baseline', () => {
    const history = [at(WEEK1 + MID, 100, 12), at(WEEK1 + MID + 1000, 130, 3, true)];
    const ceiling = weeklyLoadCeiling(LIFT.id, history, WEEK0 + MID);
    expect(ceiling).toBeCloseTo(115);
  });

  it('stops a lift compounding the session cap several times inside one week', () => {
    // Last week topped out at 100. Already up to 115 earlier this week, and the
    // athlete just finished the top of the range again — the session cap alone
    // would wave through another +2.5 kg.
    const history = [
      at(WEEK1 + MID, 100, 12),
      at(WEEK0 + MID, 115, 12),
    ];
    const rec = recommendPrescription(LIFT, history, TARGET_RPE, RANGE, { now: WEEK0 + MID + 86_400_000 });
    expect(rec.weightKg).toBe(115); // held, not stepped
    expect(rec.note).toMatch(/this week's load ceiling/);
  });

  it('still allows a normal step when the weekly ceiling is not binding', () => {
    const history = [
      at(WEEK1 + MID, 100, 12),
      at(WEEK0 + MID, 100, 12),
    ];
    const rec = recommendPrescription(LIFT, history, TARGET_RPE, RANGE, { now: WEEK0 + MID + 86_400_000 });
    expect(rec.weightKg).toBe(102.5);
    expect(rec.reps).toBe(RANGE.min);
  });
});

describe('recommendPrescription — ADR-0128 test sets are measurements, not loads', () => {
  const RANGE = { min: 8, max: 12 };
  const LIFT: Exercise = { ...EX, id: 'calib-lift' };

  /** A max-day shape: ramp sets, then an all-out AMRAP above the working load. */
  function testDay(workingKg: number, testKg: number, testReps: number, rpe = 9): SessionRecord {
    return {
      id: 'testday',
      planId: 'p',
      plannedFor: WEEK0 + MID,
      completedAt: WEEK0 + MID,
      performed: [{
        exerciseId: LIFT.id,
        name: LIFT.name,
        primaryAreas: [{ group: 'chest' }],
        sets: [
          { reps: 8, weightKg: workingKg, rpe: 7, prescribedReps: 8, prescribedRpe: 7, completed: true },
          { reps: testReps, weightKg: testKg, rpe, prescribedReps: 6, prescribedRpe: 9, completed: true, isCalibration: true },
        ],
      }],
    };
  }

  it('never carries the all-out attempt forward as the next working load', () => {
    // The regression: lastPerformance picks the HEAVIEST set, which on a test
    // day is the test itself — so 110 kg became next session's working weight.
    const rec = recommendPrescription(LIFT, [testDay(100, 110, 8)], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBeLessThan(110);
    expect(rec.note).toMatch(/calibrated from 8 clean reps/);
  });

  it('caps the calibrated load against the working weight, not the test weight', () => {
    // 100 kg working -> at most 110 kg next time, even off a huge AMRAP.
    const rec = recommendPrescription(LIFT, [testDay(100, 110, 20)], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBeLessThanOrEqual(110);
  });

  it('does not mistake an all-out test for a ground-out set needing a deload', () => {
    // RPE 9 against a target of 7 would otherwise trip `groundOut`.
    const rec = recommendPrescription(LIFT, [testDay(100, 110, 6, 9)], TARGET_RPE, RANGE);
    expect(rec.note).not.toMatch(/deloaded/);
    expect(rec.weightKg).toBeGreaterThan(0);
  });

  it('resets reps to the bottom of the band after a test', () => {
    const rec = recommendPrescription(LIFT, [testDay(100, 110, 8)], TARGET_RPE, RANGE);
    expect(rec.reps).toBe(RANGE.min);
  });

  it('a strong test raises the working load above what it was', () => {
    const rec = recommendPrescription(LIFT, [testDay(100, 110, 10)], TARGET_RPE, RANGE);
    expect(rec.weightKg).toBeGreaterThan(100);
  });
});
