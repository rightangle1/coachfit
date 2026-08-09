import {
  REST,
  SUPERSET_REST_FACTOR,
  mechanicOf,
  restSecondsFor,
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
