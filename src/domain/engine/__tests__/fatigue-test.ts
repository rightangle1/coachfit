import { ageRecoveryFactor, FATIGUE, deriveFatigueFromHistory, fatigueAreas, fatigueStatus, isMaxEffortDay } from '../fatigue';
import type { SessionRecord } from '../../types';

const NOW = Date.UTC(2026, 6, 22, 12, 0, 0);

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    planId: 'plan-1',
    startedAt: NOW - 3_600_000,
    completedAt: NOW,
    plannedFor: NOW,
    performed: [{
      exerciseId: 'test-press',
      name: 'Test press',
      primaryAreas: [{ group: 'chest' }],
      secondaryAreas: [{ group: 'triceps' }],
      sets: [{ reps: 10, rpe: 7, completed: true }],
    }],
    ...overrides,
  };
}

describe('local fatigue model', () => {
  it('uses completed set work and reduced secondary-muscle credit', () => {
    const state = deriveFatigueFromHistory([record()], NOW);
    expect(state.byGroup.chest).toBeCloseTo(FATIGUE.SET_LOAD * 0.7);
    expect(state.byGroup.triceps).toBeCloseTo(FATIGUE.SET_LOAD * 0.7 * FATIGUE.SECONDARY_CREDIT);
  });

  it('increases fatigue for additional work and higher effort', () => {
    const easy = deriveFatigueFromHistory([record()], NOW).byGroup.chest ?? 0;
    const hard = deriveFatigueFromHistory([record({
      performed: [{
        exerciseId: 'test-press', name: 'Test press', primaryAreas: [{ group: 'chest' }],
        sets: [
          { reps: 10, rpe: 9, completed: true },
          { reps: 10, rpe: 9, completed: true },
        ],
      }],
    })], NOW).byGroup.chest ?? 0;
    expect(hard).toBeGreaterThan(easy);
  });

  it('ignores skipped and incomplete sets', () => {
    const state = deriveFatigueFromHistory([record({
      performed: [{
        exerciseId: 'test-press', name: 'Test press', primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, rpe: 10, completed: false }, { reps: 10, rpe: 10, completed: false, skipped: true }],
      }],
    })], NOW);
    expect(state.byGroup.chest).toBeUndefined();
  });

  it('decays load and lets an explicit max-day override extend recovery', () => {
    const normal = record({ completedAt: NOW - 48 * 3_600_000, debrief: { maxEffort: false } });
    const max = record({ id: 'max', completedAt: normal.completedAt, debrief: { maxEffort: true } });
    const normalScore = deriveFatigueFromHistory([normal], NOW).byGroup.chest ?? 0;
    const maxScore = deriveFatigueFromHistory([max], NOW).byGroup.chest ?? 0;
    expect(maxScore).toBeGreaterThan(normalScore);
    expect(isMaxEffortDay(normal)).toBe(false);
    expect(isMaxEffortDay(max)).toBe(true);
  });

  it('classifies recovery thresholds for the planner', () => {
    expect(fatigueStatus(0.34)).toBe('good');
    expect(fatigueStatus(0.35)).toBe('recovering');
    expect(fatigueStatus(0.7)).toBe('fatigued');
    const areas = fatigueAreas({ byGroup: { chest: 0.4, quads: 0.7 }, updatedAt: NOW });
    expect(areas.high).toEqual([{ group: 'chest' }]);
    expect(areas.severe).toEqual([{ group: 'quads' }]);
  });
});

describe('local fatigue model — per-exercise intensity (ADR-0123)', () => {
  const setFor = (exerciseId: string, primary: 'chest') =>
    record({
      performed: [{
        exerciseId,
        name: exerciseId,
        primaryAreas: [{ group: primary }],
        sets: [{ reps: 10, rpe: 7, completed: true }],
      }],
    });

  it('a real compound exercise contributes more fatigue than a real isolation one', () => {
    // pu-db-bench (compound, heuristic loadDemand) vs pu-db-fly (explicit
    // mechanic: 'isolation' override from the Phase 0 audit) — same primary
    // area, same reps/RPE, so the gap is purely the intensity multiplier.
    const compound = deriveFatigueFromHistory([setFor('pu-db-bench', 'chest')], NOW).byGroup.chest ?? 0;
    const isolation = deriveFatigueFromHistory([setFor('pu-db-fly', 'chest')], NOW).byGroup.chest ?? 0;
    expect(compound).toBeGreaterThan(isolation);
  });

  it('a higher-MET cardio exercise contributes more fatigue than a lower-MET one', () => {
    // ca-burpees (metValue 11.0) vs ca-shadow-boxing (metValue 5.8), credited
    // to the same synthetic primary area with identical reps/RPE, so the gap
    // is purely the MET-derived intensity multiplier.
    const burpees = record({
      performed: [{
        exerciseId: 'ca-burpees',
        name: 'Burpees',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, rpe: 7, completed: true }],
      }],
    });
    const shadowBoxing = record({
      performed: [{
        exerciseId: 'ca-shadow-boxing',
        name: 'Shadow boxing',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, rpe: 7, completed: true }],
      }],
    });
    const burpeesFatigue = deriveFatigueFromHistory([burpees], NOW).byGroup.chest ?? 0;
    const shadowBoxingFatigue = deriveFatigueFromHistory([shadowBoxing], NOW).byGroup.chest ?? 0;
    expect(burpeesFatigue).toBeGreaterThan(shadowBoxingFatigue);
  });

  it('an unknown exercise id still defaults to the neutral 1.0 multiplier', () => {
    // 'test-press' (the default record() helper's exerciseId) isn't in the
    // catalog, so intensityFor should fall back to neutral, unchanged output.
    const state = deriveFatigueFromHistory([record()], NOW);
    expect(state.byGroup.chest).toBeCloseTo(FATIGUE.SET_LOAD * 0.7);
  });
});

describe('deriveFatigueFromHistory — ADR-0126 single clamp', () => {
  const NOW2 = Date.UTC(2026, 5, 15, 12, 0, 0);

  function bigChestDay(id: string, at: number, setCount: number): SessionRecord {
    return {
      id,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [
        {
          exerciseId: 'bench',
          name: 'Bench',
          primaryAreas: [{ group: 'chest' }],
          sets: Array.from({ length: setCount }, () => ({ reps: 10, weightKg: 60, rpe: 9, completed: true })),
        },
      ],
    };
  }

  it('is independent of the order history arrives in', () => {
    const a = bigChestDay('a', NOW2 - 3 * 3_600_000, 12);
    const b = bigChestDay('b', NOW2 - 30 * 3_600_000, 12);
    const forwards = deriveFatigueFromHistory([a, b], NOW2).byGroup.chest;
    const backwards = deriveFatigueFromHistory([b, a], NOW2).byGroup.chest;
    expect(forwards).toBeCloseTo(backwards ?? 0, 10);
  });

  it('still never reports a score above the 0..1 range', () => {
    const state = deriveFatigueFromHistory(
      [bigChestDay('a', NOW2 - 3_600_000, 40), bigChestDay('b', NOW2 - 2 * 3_600_000, 40)],
      NOW2,
    );
    expect(state.byGroup.chest).toBeLessThanOrEqual(1);
    expect(state.details?.chest?.score).toBeLessThanOrEqual(1);
  });
});

describe('ageRecoveryFactor — ADR-0127', () => {
  it('is neutral when age is unknown', () => {
    expect(ageRecoveryFactor(undefined)).toBe(1);
    expect(ageRecoveryFactor(0)).toBe(1);
  });

  it('lengthens recovery monotonically with age', () => {
    const factors = [25, 35, 45, 55, 70].map(ageRecoveryFactor);
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1]);
    }
    expect(ageRecoveryFactor(70)).toBeGreaterThan(ageRecoveryFactor(25));
  });

  it('leaves an older athlete more fatigued than a younger one after the same work', () => {
    const at = Date.UTC(2026, 5, 14, 12);
    const now = Date.UTC(2026, 5, 16, 12); // two days later
    const record: SessionRecord = {
      id: 'r',
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [{
        exerciseId: 'bench',
        name: 'Bench',
        primaryAreas: [{ group: 'chest' }],
        sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 60, rpe: 8, completed: true })),
      }],
    };
    const young = deriveFatigueFromHistory([record], now, { ageYears: 25 }).byGroup.chest ?? 0;
    const older = deriveFatigueFromHistory([record], now, { ageYears: 62 }).byGroup.chest ?? 0;
    expect(older).toBeGreaterThan(young);
  });

  it('is byte-identical to the old behavior when no age is supplied', () => {
    const at = Date.UTC(2026, 5, 14, 12);
    const now = Date.UTC(2026, 5, 16, 12);
    const record: SessionRecord = {
      id: 'r2',
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [{
        exerciseId: 'bench',
        name: 'Bench',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, weightKg: 60, rpe: 8, completed: true }],
      }],
    };
    expect(deriveFatigueFromHistory([record], now).byGroup.chest)
      .toBe(deriveFatigueFromHistory([record], now, {}).byGroup.chest);
  });
});
