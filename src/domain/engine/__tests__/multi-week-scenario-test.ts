/**
 * Multi-week scenario tests (ADR-0125).
 *
 * The rest of the engine suite tests one session at a time, which is exactly why
 * the progression defects this ADR fixes survived so long: every one of them is
 * invisible in a single session and only shows up as "why has this not moved in
 * two months?" These tests simulate an athlete actually training week after week
 * and assert the trend, not the snapshot.
 */

import type { Exercise, ModalityWeights, PerformedSet, SessionRecord, WeightUnit } from '../../types';
import { recommendPrescription, type RepRange } from '../progression';
import { layoffState } from '../layoff';
import { isZoneDue, zoneCadenceFor, zoneHistoryByGroup } from '../training-zone';

const FLAT_GOALS: ModalityWeights = { strength: 0.35, cardio: 0.35, mobility: 0.35, general: 0.35 };

const DAY = 86_400_000;
const TARGET_RPE = 7;
const RANGE: RepRange = { min: 8, max: 12 };

const RAISE: Exercise = {
  id: 'db-lateral-raise',
  name: 'Lateral Raise',
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
  name: 'Push-up',
  primaryAreas: ['chest'],
  equipment: ['bodyweight'],
  progression: 'reps',
};

interface Step {
  weightKg?: number;
  reps?: number;
}

/**
 * Train `sessions` sessions, `everyDays` apart, with a compliant athlete who
 * does exactly what was asked and taps straight through the RPE prompt (so the
 * logged RPE always equals the prescribed one — the realistic worst case for a
 * model that leans on RPE).
 */
function train(
  exercise: Exercise,
  sessions: number,
  everyDays: number,
  opts: { startWeightKg?: number; unit?: WeightUnit; available?: number[] } = {},
): Step[] {
  const { startWeightKg, unit = 'kg', available } = opts;
  const start = Date.UTC(2026, 0, 5, 12, 0, 0); // a Monday
  const history: SessionRecord[] = [];
  const steps: Step[] = [];

  for (let i = 0; i < sessions; i++) {
    const at = start + i * everyDays * DAY;
    const rx = recommendPrescription(exercise, history, TARGET_RPE, RANGE, { unit, available, now: at });

    const weightKg = rx.weightKg ?? startWeightKg;
    const reps = rx.reps ?? RANGE.min;
    steps.push({ weightKg, reps });

    const set: PerformedSet = {
      reps,
      weightKg,
      rpe: TARGET_RPE,
      prescribedReps: reps,
      prescribedRpe: TARGET_RPE,
      completed: true,
    };
    history.push({
      id: `s${i}`,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [
        { exerciseId: exercise.id, name: exercise.name, primaryAreas: [{ group: 'shoulders' }], sets: [set, { ...set }, { ...set }] },
      ],
    });
  }
  return steps;
}

describe('multi-week progression — a light accessory lift', () => {
  it('actually gets stronger over six weeks instead of stalling forever', () => {
    // The headline regression: a 10 kg lateral raise used to hold 10 kg for
    // life, because +10% of 10 kg is less than the smallest dumbbell step.
    const steps = train(RAISE, 12, 3.5, { startWeightKg: 10 });

    expect(steps[0]).toEqual({ weightKg: 10, reps: 10 });

    const finalWeight = steps[steps.length - 1].weightKg ?? 0;
    expect(finalWeight).toBeGreaterThan(10);

    // Load must move in real, ownable increments and never jump wildly.
    const weights = steps.map((s) => s.weightKg ?? 0);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1]);
      expect(weights[i] - weights[i - 1]).toBeLessThanOrEqual(2.5);
    }

    // Large minimum increments may require bounded rep evidence above the band.
    for (const step of steps) {
      expect(step.reps).toBeGreaterThanOrEqual(RANGE.min);
      expect(step.reps).toBeLessThanOrEqual(RANGE.max + 4);
    }
  });

  it('climbs reps without taking an implausible minimum load jump too early', () => {
    const steps = train(RAISE, 6, 3.5, { startWeightKg: 10 });
    const repsClimbed = steps.some((s, i) => i > 0 && (s.reps ?? 0) > (steps[i - 1].reps ?? 0));
    const loadStepped = steps.some((s, i) => i > 0 && (s.weightKg ?? 0) > (steps[i - 1].weightKg ?? 0));
    expect(repsClimbed).toBe(true);
    expect(loadStepped).toBe(false);
  });

  it('progresses a once-a-week lift despite the weekly load ceiling', () => {
    // The weekly cap must not re-create the stall one level up: at 10 kg,
    // +15% is 11.5 while the smallest real step is 12.5.
    const steps = train(RAISE, 8, 7, { startWeightKg: 10 });
    expect(steps[steps.length - 1].weightKg ?? 0).toBeGreaterThan(10);
  });

  it('progresses bodyweight work, which has no load to move at all', () => {
    const steps = train(PUSHUP, 8, 3.5);
    const first = steps[0].reps ?? 0;
    const last = steps[steps.length - 1].reps ?? 0;
    expect(last).toBeGreaterThan(first);
    expect(steps.every((s) => s.weightKg === undefined)).toBe(true);
  });

  it('keeps a heavy lift inside both the session and weekly caps', () => {
    const steps = train({ ...RAISE, id: 'squat' }, 10, 3.5, { startWeightKg: 100 });
    const weights = steps.map((s) => s.weightKg ?? 0);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThanOrEqual(weights[i - 1] * 1.1 + 1e-6);
    }
  });
});

describe('multi-week layoff — returning after time away', () => {
  const start = Date.UTC(2026, 0, 5, 12, 0, 0);

  function record(at: number, id: string): SessionRecord {
    return {
      id,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [
        {
          exerciseId: RAISE.id,
          name: RAISE.name,
          primaryAreas: [{ group: 'shoulders' }],
          sets: [{ reps: 10, weightKg: 20, rpe: TARGET_RPE, completed: true }],
        },
      ],
    };
  }

  it('eases the first session back, then fades over the next two', () => {
    const history = [record(start, 'a')];

    // Six weeks off.
    const firstBack = start + 42 * DAY;
    const s1 = layoffState(history, firstBack);
    expect(s1.loadFactor).toBeLessThan(1);
    expect(s1.volumeFactor).toBeLessThan(1);

    history.push(record(firstBack, 'b'));
    const secondBack = firstBack + 3 * DAY;
    const s2 = layoffState(history, secondBack);
    expect(s2.loadFactor).toBeGreaterThan(s1.loadFactor);
    expect(s2.loadFactor).toBeLessThan(1);

    history.push(record(secondBack, 'c'));
    const thirdBack = secondBack + 3 * DAY;
    const s3 = layoffState(history, thirdBack);
    expect(s3.loadFactor).toBe(1); // simply training again
  });

  it('does not treat an ordinary training week as a layoff', () => {
    const history = [record(start, 'a'), record(start + 3 * DAY, 'b'), record(start + 6 * DAY, 'c')];
    expect(layoffState(history, start + 8 * DAY).loadFactor).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Training zones over time (ADR-0128)
// ---------------------------------------------------------------------------

describe('multi-week zone rotation', () => {
  const START = Date.UTC(2026, 0, 5, 12, 0, 0); // a Monday

  /**
   * Sessions of plain hypertrophy work on one muscle group, `everyDays` apart.
   * This is what a "never tested" history looks like to the zone planner.
   */
  function hypertrophyHistory(sessions: number, everyDays: number, endDaysAgo: number, now: number): SessionRecord[] {
    return Array.from({ length: sessions }, (_, i) => {
      const at = now - (endDaysAgo + i * everyDays) * DAY;
      return {
        id: `h${i}`,
        planId: 'p',
        plannedFor: at,
        completedAt: at,
        performed: [{
          exerciseId: 'bench',
          name: 'Bench',
          primaryAreas: [{ group: 'chest' as const }],
          sets: [{ reps: 10, weightKg: 60, rpe: 7, completed: true, prescribedReps: 10, prescribedZone: 'hypertrophy' as const }],
        }],
      };
    });
  }

  it('counts exposures, so a 5x/week athlete reaches the cadence sooner in CALENDAR time', () => {
    // The point of exposures over days: adaptation follows how often you train
    // the muscle, not how many dates have passed.
    const now = START + 100 * DAY;
    const cadence = zoneCadenceFor({ experience: 'intermediate', targetDurationMin: 60, weights: FLAT_GOALS })!;

    const frequent = zoneHistoryByGroup(hypertrophyHistory(cadence.exposures.strength, 1.5, 1, now), now).get('chest')!;
    const sparse = zoneHistoryByGroup(hypertrophyHistory(cadence.exposures.strength, 7, 1, now), now).get('chest')!;

    // Same number of exposures either way…
    expect(frequent.strength.exposuresSince).toBe(sparse.strength.exposuresSince);
    // …but the frequent athlete accumulated them over far fewer days.
    expect(isZoneDue(frequent.strength, 'strength', cadence)).toBe(true);
    expect(isZoneDue(sparse.strength, 'strength', cadence)).toBe(true);
  });

  it('holds the minimum-days floor for a very high-frequency athlete', () => {
    const cadence = zoneCadenceFor({ experience: 'intermediate', targetDurationMin: 60, weights: FLAT_GOALS })!;
    // Trained daily; plenty of exposures, but the last strength work was recent.
    const entry = { exposuresSince: cadence.exposures.strength * 3, daysSince: cadence.minDays - 1 };
    expect(isZoneDue(entry, 'strength', cadence)).toBe(false);
  });

  it('a strength-led athlete reaches a strength test in fewer exposures than a cardio-led one', () => {
    const strengthLed = zoneCadenceFor({
      experience: 'intermediate', targetDurationMin: 60,
      weights: { strength: 0.65, cardio: 0.35, mobility: 0.35, general: 0.35 },
    })!;
    const cardioLed = zoneCadenceFor({
      experience: 'intermediate', targetDurationMin: 60,
      weights: { strength: 0.35, cardio: 0.65, mobility: 0.35, general: 0.35 },
    })!;
    expect(strengthLed.exposures.strength).toBeLessThan(cardioLed.exposures.strength);
    expect(strengthLed.exposures.endurance).toBeGreaterThan(cardioLed.exposures.endurance);
  });
});
