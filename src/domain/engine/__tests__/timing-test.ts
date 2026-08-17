import {
  REST,
  SUPERSET_REST_FACTOR,
  DENSE_PACING_COMPOUND_FACTOR,
  DENSE_PACING_ISOLATION_FACTOR,
  mechanicOf,
  restSecondsFor,
  densePacingFactor,
  pacedRestSecondsFor,
  setCostSeconds,
  transitionSecondsFor,
  workSecondsFor,
  estimateBlocksSeconds,
  durationCalibrationFactor,
} from '../timing';
import { LOAD_DEMAND_HI, LOAD_DEMAND_LO, LOAD_DEMAND_MID } from '../intensity';
import { EXERCISES } from '../../catalog';
import type { Exercise, PlannedSet, SessionBlock } from '../../types';

const findExercise = (id: string): Exercise => {
  const exercise = EXERCISES.find((candidate) => candidate.id === id);
  if (!exercise) throw new Error(`fixture exercise not found: ${id}`);
  return exercise;
};

// Default loadDemand pinned to the neutral midpoint (restIntensityFactor === 1.0)
// so these tests reproduce today's exact REST constants unless a test overrides it.
function ex(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'x',
    name: 'X',
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['chest'],
    equipment: ['barbell', 'bench'],
    progression: 'weight',
    description: '',
    steps: [],
    loadDemand: LOAD_DEMAND_MID,
    ...overrides,
  };
}

describe('timing — mechanicOf', () => {
  it('honors an explicit override', () => {
    expect(mechanicOf(ex({ mechanic: 'isolation', movementPattern: 'squat' }))).toBe('isolation');
  });
  it('treats squat/hinge/lunge/carry as compound', () => {
    for (const p of ['squat', 'hinge', 'lunge', 'carry'] as const) {
      expect(mechanicOf(ex({ movementPattern: p }))).toBe('compound');
    }
  });
  it('a big-mover push/pull is compound, an arm-only one is isolation', () => {
    expect(mechanicOf(ex({ movementPattern: 'push', primaryAreas: ['chest'] }))).toBe('compound');
    expect(mechanicOf(ex({ movementPattern: 'pull', primaryAreas: ['biceps'] }))).toBe('isolation');
  });
});

describe('timing — restSecondsFor', () => {
  it('heavy compound (low reps) rests longest', () => {
    // REST.HEAVY_COMPOUND (165) sits exactly on a 10s boundary; nearest-10 rounding lands at 160.
    expect(restSecondsFor(ex({ movementPattern: 'squat' }), { reps: 5, targetRpe: 8 })).toBe(160);
  });
  it('a 10-rep compound stays in the hypertrophy tier regardless of RPE', () => {
    expect(restSecondsFor(ex({ movementPattern: 'squat' }), { reps: 10, targetRpe: 8 })).toBe(REST.HYPERTROPHY_COMPOUND);
    expect(restSecondsFor(ex({ movementPattern: 'squat' }), { reps: 10, targetRpe: 6 })).toBe(REST.HYPERTROPHY_COMPOUND);
  });
  it('isolation rests briefly; cardio has no inter-set rest', () => {
    expect(restSecondsFor(ex({ movementPattern: 'pull', primaryAreas: ['biceps'] }), { reps: 12 })).toBe(REST.ISOLATION);
    expect(restSecondsFor(ex({ modality: 'cardio', movementPattern: 'steady_cardio' }), { durationSec: 600 })).toBe(REST.CARDIO);
  });
  it('a warmup set rests minimally', () => {
    expect(restSecondsFor(ex({ movementPattern: 'squat' }), { reps: 5, isWarmup: true })).toBe(REST.WARMUP);
  });
  it('a higher loadDemand rests measurably longer within the same tier', () => {
    const light = restSecondsFor(ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_LO }), { reps: 10, targetRpe: 7 });
    const heavy = restSecondsFor(ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_HI }), { reps: 10, targetRpe: 7 });
    expect(heavy).toBeGreaterThan(light);
  });
  it('rest tiers never invert regardless of loadDemand (ADR-0123)', () => {
    const hypertrophyAtMax = restSecondsFor(
      ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_HI }),
      { reps: 10, targetRpe: 7 },
    );
    const heavyAtMin = restSecondsFor(
      ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_LO }),
      { reps: 5, targetRpe: 8 },
    );
    expect(hypertrophyAtMax).toBeLessThan(heavyAtMin);
  });
  it('cardio rest is unaffected by loadDemand', () => {
    expect(
      restSecondsFor(ex({ modality: 'cardio', movementPattern: 'steady_cardio', loadDemand: LOAD_DEMAND_HI }), { durationSec: 600 }),
    ).toBe(REST.CARDIO);
  });
  it('a real catalog loadDemand override fixes an easier/harder push-up pair the heuristic scored identically (ADR-0123)', () => {
    const set: PlannedSet = { reps: 10, targetRpe: 7 };
    const inclineRest = restSecondsFor(findExercise('pu-incline-pushup'), set);
    const standardRest = restSecondsFor(findExercise('pu-pushup'), set);
    const declineRest = restSecondsFor(findExercise('pu-decline-pushup'), set);
    expect(inclineRest).toBeLessThan(standardRest);
    // Rounded to the nearest 10s for a glanceable tracker display, so a close
    // pair (standard ≈96.6s vs. decline ≈100.4s pre-rounding) can land on the
    // same displayed value — assert non-inversion, not strict separation.
    expect(standardRest).toBeLessThanOrEqual(declineRest);
  });
  it('a real catalog loadDemand override rates an isometric wall sit below a dynamic squat (ADR-0123)', () => {
    const set: PlannedSet = { reps: 10, targetRpe: 7 };
    const wallSitRest = restSecondsFor(findExercise('sq-wall-sit'), set);
    const dynamicSquatRest = restSecondsFor(findExercise('sq-bb-box'), set);
    expect(wallSitRest).toBeLessThan(dynamicSquatRest);
  });
});

describe('timing — dense pacing (ADR-0145)', () => {
  it('densePacing: false reproduces restSecondsFor exactly for every existing case', () => {
    // The rounding-trap regression pin: pacedRestSecondsFor must never
    // re-round an already-correct value when the factor is a no-op.
    const cases: [Exercise, PlannedSet][] = [
      [ex({ movementPattern: 'squat' }), { reps: 5, targetRpe: 8 }],
      [ex({ movementPattern: 'squat' }), { reps: 10, targetRpe: 7 }],
      [ex({ movementPattern: 'pull', primaryAreas: ['biceps'] }), { reps: 12 }],
      [ex({ modality: 'cardio', movementPattern: 'steady_cardio' }), { durationSec: 600 }],
      [ex({ movementPattern: 'squat' }), { reps: 5, isWarmup: true }],
      [ex({ modality: 'mobility', movementPattern: 'stretch' }), { durationSec: 30 }],
    ];
    for (const [exercise, set] of cases) {
      expect(pacedRestSecondsFor(exercise, set, false)).toBe(restSecondsFor(exercise, set));
    }
  });

  it('shrinks hypertrophy-compound and isolation rest, leaves heavy-compound untouched', () => {
    const compound = ex({ movementPattern: 'squat' });
    const isolation = ex({ movementPattern: 'pull', primaryAreas: ['biceps'] });
    const hypertrophySet: PlannedSet = { reps: 10, targetRpe: 7 };
    const isolationSet: PlannedSet = { reps: 12 };
    const heavySet: PlannedSet = { reps: 5, targetRpe: 8 };

    expect(pacedRestSecondsFor(compound, hypertrophySet, true)).toBeLessThan(restSecondsFor(compound, hypertrophySet));
    expect(pacedRestSecondsFor(isolation, isolationSet, true)).toBeLessThan(restSecondsFor(isolation, isolationSet));
    // A genuinely heavy set — full rest regardless of pacing goal (safety).
    expect(pacedRestSecondsFor(compound, heavySet, true)).toBe(restSecondsFor(compound, heavySet));
    expect(densePacingFactor(compound, heavySet, true)).toBe(1);
  });

  it('exempts a calibration/AMRAP test set regardless of rep count, even outside isHeavySet\'s window', () => {
    // The endurance-zone max-effort test: 15 reps at RPE 9 — genuinely
    // all-out, but not caught by isHeavySet's reps<=8 heuristic.
    const compound = ex({ movementPattern: 'squat' });
    const testSet: PlannedSet = { reps: 15, targetRpe: 9, isCalibration: true };
    expect(densePacingFactor(compound, testSet, true)).toBe(1);
    expect(pacedRestSecondsFor(compound, testSet, true)).toBe(restSecondsFor(compound, testSet));
  });

  it('never applies to cardio/mobility/aerobics — dense pacing only shapes strength-tier rest', () => {
    const cardio = ex({ modality: 'cardio', movementPattern: 'steady_cardio' });
    const mobility = ex({ modality: 'mobility', movementPattern: 'stretch' });
    const aerobics = ex({ modality: 'cardio', movementPattern: 'aerobics' });
    expect(densePacingFactor(cardio, { durationSec: 600 }, true)).toBe(1);
    expect(densePacingFactor(mobility, { durationSec: 30 }, true)).toBe(1);
    expect(densePacingFactor(aerobics, { durationSec: 45 }, true)).toBe(1);
  });

  it('rest tiers never invert under the density factor', () => {
    // Worst case for dense hypertrophy (max loadDemand, gentlest compound
    // factor) must still stay below the best case for heavy (min loadDemand,
    // exempt from the density factor entirely).
    const hypertrophyAtMaxDense = pacedRestSecondsFor(
      ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_HI }),
      { reps: 10, targetRpe: 7 },
      true,
    );
    const heavyAtMin = pacedRestSecondsFor(
      ex({ movementPattern: 'squat', loadDemand: LOAD_DEMAND_LO }),
      { reps: 5, targetRpe: 8 },
      true,
    );
    expect(hypertrophyAtMaxDense).toBeLessThan(heavyAtMin);
  });

  it('exact discount magnitudes match the documented factors', () => {
    expect(DENSE_PACING_COMPOUND_FACTOR).toBe(0.75);
    expect(DENSE_PACING_ISOLATION_FACTOR).toBe(0.6);
    // 90 (HYPERTROPHY_COMPOUND) × 1.0 (neutral loadDemand) × 0.75 → 67.5 → rounds to 70.
    expect(pacedRestSecondsFor(ex({ movementPattern: 'squat' }), { reps: 10, targetRpe: 7 }, true)).toBe(70);
    // 50 (ISOLATION) × 1.0 × 0.6 = 30.
    expect(pacedRestSecondsFor(ex({ movementPattern: 'pull', primaryAreas: ['biceps'] }), { reps: 12 }, true)).toBe(30);
  });

  it('a grouped set is unaffected by densePacing in setCostSeconds — no stacking with SUPERSET_REST_FACTOR', () => {
    const e = ex({ movementPattern: 'push', primaryAreas: ['chest'] });
    const set: PlannedSet = { reps: 10, targetRpe: 7 };
    const groupedStandard = setCostSeconds(e, set, true, false);
    const groupedDense = setCostSeconds(e, set, true, true);
    expect(groupedDense).toBe(groupedStandard);
    // Confirms it's the superset factor alone driving it, not a compounded discount.
    const straightRest = restSecondsFor(e, set);
    expect(groupedStandard - workSecondsFor(set)).toBeCloseTo(straightRest * SUPERSET_REST_FACTOR);
  });

  it('an ungrouped set IS affected by densePacing in setCostSeconds', () => {
    const e = ex({ movementPattern: 'push', primaryAreas: ['chest'] });
    const set: PlannedSet = { reps: 10, targetRpe: 7 };
    expect(setCostSeconds(e, set, false, true)).toBeLessThan(setCostSeconds(e, set, false, false));
  });

  it('circuit-transition dense constants preserve the 2x aerobics:loaded ratio', () => {
    expect(REST.DENSE_AEROBICS_TRANSITION).toBe(8);
    expect(REST.DENSE_LOADED_CIRCUIT_TRANSITION).toBe(16);
    expect(REST.DENSE_LOADED_CIRCUIT_TRANSITION).toBe(REST.DENSE_AEROBICS_TRANSITION * 2);
  });

  it('estimateBlocksSeconds with densePacing shrinks a circuit block\'s transition cost', () => {
    const loaded = ex({ id: 'kb', modality: 'cardio', movementPattern: 'interval', loadsWeight: true, equipment: ['kettlebell'] });
    const block: SessionBlock = {
      modality: 'cardio',
      label: 'Main',
      exercises: [{
        exerciseId: 'kb', name: 'KB swing', primaryAreas: [{ group: 'glutes' }],
        rotationGroup: 'rotation-1',
        group: { id: 'rotation-1', type: 'circuit', rationale: 'test' },
        sets: [{ durationSec: 45, targetRpe: 6 }, { durationSec: 45, targetRpe: 6 }],
      }],
    };
    const standard = estimateBlocksSeconds([block], (id) => (id === 'kb' ? loaded : undefined), false);
    const dense = estimateBlocksSeconds([block], (id) => (id === 'kb' ? loaded : undefined), true);
    expect(dense).toBeLessThan(standard);
    // transition(20, cardio) + 2 × (work 45 + dense loaded transition 16) = 20 + 122 = 142
    expect(dense).toBe(20 + 2 * (45 + REST.DENSE_LOADED_CIRCUIT_TRANSITION));
  });
});

describe('timing — cost + estimate', () => {
  it('uses reps × about three seconds for rep work and real time for holds', () => {
    expect(workSecondsFor({ reps: 6 })).toBe(18);
    expect(workSecondsFor({ reps: 15 })).toBe(45);
    expect(workSecondsFor({ durationSec: 45 })).toBe(45);
  });

  it('calibrates future estimates from the athlete’s recent actual session durations', () => {
    const record = {
      id: 's', planId: 'p', plannedFor: 1, startedAt: 1,
      completedAt: 1 + 55 * 60_000, plannedDurationMin: 50, performed: [],
    };
    expect(durationCalibrationFactor([record])).toBeCloseTo(1.1);
    expect(durationCalibrationFactor([])).toBe(1);
  });
  it('a unilateral hold is prescribed per side, so its real work time is double the per-side duration', () => {
    // 3 sets of "30s per leg" is 3 minutes of real work, not 1:30 — each set
    // costs 60s (30s per side × 2 sides), not the bare 30s on the plan.
    const unilateral = ex({ modality: 'mobility', movementPattern: 'stretch', unilateral: true });
    expect(workSecondsFor({ durationSec: 30 }, unilateral)).toBe(60);
    expect(workSecondsFor({ durationSec: 30 })).toBe(30);
  });
  it('a unilateral rep-based set also costs double the nominal work time', () => {
    const unilateral = ex({ unilateral: true });
    expect(workSecondsFor({ reps: 10 }, unilateral)).toBe(workSecondsFor({ reps: 10 }) * 2);
  });
  it('setCostSeconds/estimateBlocksSeconds fold in the unilateral doubling', () => {
    const e = ex({ id: 'ul', movementPattern: 'stretch', modality: 'mobility', unilateral: true });
    const set: PlannedSet = { durationSec: 30 };
    expect(setCostSeconds(e, set) - restSecondsFor(e, set)).toBe(60);
    const block: SessionBlock = {
      modality: 'mobility',
      label: 'Cool down',
      exercises: [{ exerciseId: 'ul', name: 'Single-leg hold', primaryAreas: [{ group: 'quads' }], sets: [set, set, set] }],
    };
    const seconds = estimateBlocksSeconds([block], (id) => (id === 'ul' ? e : undefined));
    // transition(10, mobility) + 3 × (work 60 + core/mobility rest 15) = 10 + 225 = 235
    expect(seconds).toBe(10 + 3 * (60 + REST.CORE_MOBILITY));
  });
  it('a grouped (superset) set pays reduced rest', () => {
    const e = ex({ movementPattern: 'push', primaryAreas: ['chest'] });
    const set: PlannedSet = { reps: 10, targetRpe: 7 };
    expect(setCostSeconds(e, set, true)).toBeLessThan(setCostSeconds(e, set, false));
    const straightRest = setCostSeconds(e, set, false) - workSecondsFor(set);
    const groupedRest = setCostSeconds(e, set, true) - workSecondsFor(set);
    expect(groupedRest).toBeCloseTo(straightRest * SUPERSET_REST_FACTOR);
  });
  it('barbell/rack carries a larger transition than bodyweight', () => {
    expect(transitionSecondsFor(ex({ equipment: ['barbell'] }))).toBeGreaterThan(
      transitionSecondsFor(ex({ equipment: ['bodyweight'] })),
    );
  });
  it('estimateBlocksSeconds sums work + rest + transition across a block', () => {
    const e = ex({ id: 'sq', movementPattern: 'squat', equipment: ['bodyweight'] });
    const block: SessionBlock = {
      modality: 'strength',
      label: 'Main',
      exercises: [{ exerciseId: 'sq', name: 'Squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10, targetRpe: 7 }, { reps: 10, targetRpe: 7 }] }],
    };
    const seconds = estimateBlocksSeconds(block ? [block] : [], (id) => (id === 'sq' ? e : undefined));
    // transition(30) + 2 × (work 30 + hypertrophy rest 90) = 30 + 240 = 270
    expect(seconds).toBe(270);
  });
});
