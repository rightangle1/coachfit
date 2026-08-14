import { finalizeLoad } from '../load-finalization';
import { BARBELL_BAR_WEIGHT_KG, barbellFloorKg, snapToSensibleWeight } from '../progression';
import type { Exercise, FatigueState, SessionRecord } from '../../types';

const NOW = Date.UTC(2026, 6, 22, 12, 0, 0);

const SQUAT: Exercise = {
  id: 'sq',
  name: 'Back squat',
  modality: 'strength',
  movementPattern: 'squat',
  primaryAreas: ['quads'],
  equipment: ['barbell', 'squat_rack'],
  progression: 'weight',
  description: '',
  steps: [],
};

const NO_FATIGUE: FatigueState = { byGroup: {}, updatedAt: NOW };

function run(overrides: Partial<Parameters<typeof finalizeLoad>[0]> = {}) {
  return finalizeLoad({
    baseWeightKg: 100,
    exercise: SQUAT,
    readiness: {},
    fatigue: NO_FATIGUE,
    history: [],
    now: NOW,
    ...overrides,
  });
}

describe('finalizeLoad — reductions only, within the cap', () => {
  it('holds the base load on a fresh, well-recovered day', () => {
    const r = run();
    expect(r.weightKg).toBe(100);
    expect(r.note).toBeUndefined();
    expect(r.drivers).toEqual({ readinessFactor: 1, fatigueFactor: 1, maxTaxFactor: 1, layoffFactor: 1 });
  });

  it('eases the load when the athlete feels poor (never raises it)', () => {
    const r = run({ readiness: { energy: 1, soreness: 5, sleepQuality: 1 } });
    expect(r.weightKg).toBeLessThan(100);
    expect(r.weightKg).toBeGreaterThanOrEqual(90); // capped at −10%
    expect(r.drivers.readinessFactor).toBeLessThan(1);
    expect(r.note).toMatch(/how you feel today/);
  });

  it('eases the load when the primary muscle is highly fatigued', () => {
    const fatigue: FatigueState = { byGroup: { quads: 0.8 }, updatedAt: NOW };
    const r = run({ fatigue });
    expect(r.weightKg).toBeLessThanOrEqual(90);
    expect(r.drivers.fatigueFactor).toBeLessThan(1);
    expect(r.note).toMatch(/quads fatigue/);
  });

  it('taxes the load after a recent max on that muscle (via fatigue details)', () => {
    const fatigue: FatigueState = {
      byGroup: {},
      updatedAt: NOW,
      details: { quads: { score: 0.3, status: 'recovering', completedSets: 5, lastWorkoutWasMax: true, lastTrainedAt: NOW - 2 * 86_400_000 } },
    };
    const r = run({ fatigue });
    expect(r.drivers.maxTaxFactor).toBeLessThan(1);
    expect(r.weightKg).toBeLessThan(100);
    expect(r.note).toMatch(/recent quads max/);
  });

  it('taxes the load after a recent completed calibration set in history', () => {
    const history: SessionRecord[] = [{
      id: 's1', planId: 'p1', plannedFor: NOW - 86_400_000, completedAt: NOW - 86_400_000,
      performed: [{ exerciseId: 'sq', name: 'Back squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 5, weightKg: 120, completed: true, isCalibration: true }] }],
    }];
    const r = run({ history });
    expect(r.drivers.maxTaxFactor).toBeLessThan(1);
  });

  it('stacks factors multiplicatively but never below a genuinely-bad-day floor', () => {
    const fatigue: FatigueState = { byGroup: { quads: 0.9 }, updatedAt: NOW };
    const r = run({ readiness: { energy: 1, soreness: 5, sleepQuality: 1 }, fatigue });
    // 0.90 (readiness) × 0.90 (fatigue) = 0.81 → 81 kg
    expect(r.weightKg).toBe(81);
    expect(r.note).toMatch(/how you feel today \+ quads fatigue/);
  });

  it('ignores a max that is outside the recency window', () => {
    const fatigue: FatigueState = {
      byGroup: {},
      updatedAt: NOW,
      details: { quads: { score: 0.1, status: 'good', completedSets: 5, lastWorkoutWasMax: true, lastTrainedAt: NOW - 10 * 86_400_000 } },
    };
    expect(run({ fatigue }).drivers.maxTaxFactor).toBe(1);
  });
});

describe('finalizeLoad — ADR-0144 combined with the barbell bar-weight floor', () => {
  it('worst-case combined reduction can drop a light barbell weight below the bar; the caller-side floor-aware snap restores it', () => {
    // finalizeLoad itself has no floor by design (reductions only, implement-
    // unaware) — the empty-bar floor is applied by the caller's subsequent
    // snapToSensibleWeight(..., floorKg) call, exactly as rules-engine.ts does.
    const fatigue: FatigueState = {
      byGroup: { quads: 0.8 },
      updatedAt: NOW,
      details: { quads: { score: 0.8, status: 'fatigued', completedSets: 5, lastWorkoutWasMax: true, lastTrainedAt: NOW - 86_400_000 } },
    };
    const r = run({
      baseWeightKg: 22, // just above the ~20.41 kg bar
      readiness: { energy: 1, soreness: 5, sleepQuality: 1 },
      fatigue,
    });
    expect(r.weightKg).toBeLessThan(BARBELL_BAR_WEIGHT_KG);

    const floored = snapToSensibleWeight(r.weightKg, 'kg', undefined, barbellFloorKg(SQUAT));
    expect(floored).toBeGreaterThanOrEqual(BARBELL_BAR_WEIGHT_KG);
  });
});
