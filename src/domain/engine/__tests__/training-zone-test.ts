import type { Exercise, ModalityWeights, SessionRecord } from '../../types';
import {
  ZONE_BOTH_TESTS_MIN_SESSION_MIN,
  ZONE_SPEC,
  ZONE_TEST_MIN_SESSION_MIN,
  goalLean,
  isZoneDue,
  zoneCadenceFor,
  zoneHistoryByGroup,
  zoneOfSet,
  zonePlanFor,
  workingZoneFor,
  type ZonePlanInput,
} from '../training-zone';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const FLAT: ModalityWeights = { strength: 0.35, cardio: 0.35, mobility: 0.35, general: 0.35 };
const STRENGTH_LED: ModalityWeights = { strength: 0.65, cardio: 0.35, mobility: 0.35, general: 0.35 };
const CARDIO_LED: ModalityWeights = { strength: 0.35, cardio: 0.65, mobility: 0.35, general: 0.35 };

const cadence = (over: Partial<Parameters<typeof zoneCadenceFor>[0]> = {}) =>
  zoneCadenceFor({ experience: 'intermediate', targetDurationMin: 45, weights: FLAT, ...over });

describe('zoneCadenceFor — who tests, and how often', () => {
  it('can disable automatic testing when the athlete has not opted in', () => {
    expect(cadence({ testingEnabled: false })).toBeUndefined();
  });
  it('never tests a beginner', () => {
    expect(cadence({ experience: 'beginner' })).toBeUndefined();
  });

  it('does not test in a session too short to absorb a ramp plus an all-out set', () => {
    expect(cadence({ targetDurationMin: ZONE_TEST_MIN_SESSION_MIN - 5 })).toBeUndefined();
    expect(cadence({ targetDurationMin: ZONE_TEST_MIN_SESSION_MIN })).toBeDefined();
  });

  it('allows one test in a normal session and two in a long one', () => {
    expect(cadence({ targetDurationMin: ZONE_BOTH_TESTS_MIN_SESSION_MIN - 5 })?.maxTests).toBe(1);
    expect(cadence({ targetDurationMin: ZONE_BOTH_TESTS_MIN_SESSION_MIN })?.maxTests).toBe(2);
  });

  it('tests an advanced athlete LESS often than an intermediate', () => {
    // Their e1RM moves slowly and a true max costs more to recover from, so
    // frequent testing is mostly fatigue for little information.
    const mid = cadence({ experience: 'intermediate' })!;
    const adv = cadence({ experience: 'advanced' })!;
    expect(adv.exposures.strength).toBeGreaterThan(mid.exposures.strength);
    expect(adv.exposures.endurance).toBeGreaterThan(mid.exposures.endurance);
    expect(adv.minDays).toBeGreaterThanOrEqual(mid.minDays);
  });
});

describe('zoneCadenceFor — goals and style bias the schedule', () => {
  it('brings strength testing forward for a strength-led athlete, and pushes endurance back', () => {
    const flat = cadence({ weights: FLAT })!;
    const strong = cadence({ weights: STRENGTH_LED })!;
    expect(strong.exposures.strength).toBeLessThan(flat.exposures.strength);
    expect(strong.exposures.endurance).toBeGreaterThan(flat.exposures.endurance);
  });

  it('does the reverse for a cardio-led athlete', () => {
    const flat = cadence({ weights: FLAT })!;
    const cardio = cadence({ weights: CARDIO_LED })!;
    expect(cardio.exposures.strength).toBeGreaterThan(flat.exposures.strength);
    expect(cardio.exposures.endurance).toBeLessThan(flat.exposures.endurance);
  });

  it('leaves a flat goal profile unbiased', () => {
    expect(goalLean(FLAT)).toBe(0);
  });

  it('compares strength against cardio pairwise, not against everything else', () => {
    // Against all three other modalities a single dominant goal only reaches
    // ~0.38 of a normalized split, leaving ~-0.03 — no usable signal at all.
    expect(goalLean(STRENGTH_LED)).toBeGreaterThan(0.1);
    expect(goalLean(CARDIO_LED)).toBeLessThan(-0.1);
  });

  it('treats general and mobility as neutral', () => {
    const generalLed: ModalityWeights = { strength: 0.35, cardio: 0.35, mobility: 0.35, general: 0.65 };
    expect(goalLean(generalLed)).toBe(0);
  });

  it('does not infer a physiological goal from bodybuilding or sculpting style', () => {
    const sculpt = cadence({ workoutType: 'sculpting' })!;
    const bb = cadence({ workoutType: 'bodybuilding' })!;
    expect(bb.exposures).toEqual(sculpt.exposures);
  });

  it('disables strength testing where an all-out attempt makes no sense', () => {
    for (const workoutType of ['cardio', 'stretch', 'yoga'] as const) {
      expect(cadence({ workoutType })?.allowsStrengthTest).toBe(false);
    }
    expect(cadence({ workoutType: 'bodybuilding' })?.allowsStrengthTest).toBe(true);
  });

  it('no goal-and-style combination can collapse the cadence to every session', () => {
    for (const weights of [FLAT, STRENGTH_LED, CARDIO_LED]) {
      for (const workoutType of ['bodybuilding', 'sculpting', 'bodyweight', undefined] as const) {
        for (const experience of ['intermediate', 'advanced'] as const) {
          const c = zoneCadenceFor({ experience, targetDurationMin: 60, weights, workoutType })!;
          expect(c.exposures.strength).toBeGreaterThanOrEqual(2);
          expect(c.exposures.endurance).toBeGreaterThanOrEqual(2);
          expect(c.minDays).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('workingZoneFor — declared resistance outcome', () => {
  it.each([
    ['max_strength', 'strength'],
    ['hypertrophy', 'hypertrophy'],
    ['muscular_endurance', 'endurance'],
    ['power', 'power'],
    ['general', 'hypertrophy'],
  ] as const)('maps %s to regular %s work', (focus, zone) => {
    expect(workingZoneFor(focus)).toBe(zone);
  });
});

describe('zoneOfSet — classifying history', () => {
  it('prefers the zone recorded at prescription time', () => {
    expect(zoneOfSet({ completed: true, reps: 10, prescribedZone: 'strength' })).toBe('strength');
  });

  it('falls back to rep count for records predating the field', () => {
    expect(zoneOfSet({ completed: true, reps: 5 })).toBe('strength');
    expect(zoneOfSet({ completed: true, reps: 10 })).toBe('hypertrophy');
    expect(zoneOfSet({ completed: true, reps: 18 })).toBe('endurance');
  });

  it('uses the prescribed reps over the logged ones', () => {
    // They were asked for 5 and managed 8; it was still strength work.
    expect(zoneOfSet({ completed: true, reps: 8, prescribedReps: 5 })).toBe('strength');
  });

  it('is undefined for timed work with no reps at all', () => {
    expect(zoneOfSet({ completed: true, durationSec: 45 })).toBeUndefined();
  });

  it('classifies the boundaries of each band consistently', () => {
    expect(zoneOfSet({ completed: true, reps: ZONE_SPEC.strength.range.max })).toBe('strength');
    expect(zoneOfSet({ completed: true, reps: ZONE_SPEC.endurance.range.min })).toBe('endurance');
  });
});

describe('zoneHistoryByGroup — the per-group clock', () => {
  function session(daysAgo: number, reps: number, group = 'chest', id = `s-${daysAgo}`): SessionRecord {
    const at = NOW - daysAgo * DAY;
    return {
      id,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [{
        exerciseId: 'bench',
        name: 'Bench',
        primaryAreas: [{ group: group as 'chest' }],
        sets: [{ reps, weightKg: 60, completed: true, prescribedReps: reps }],
      }],
    };
  }

  it('reports nothing for a group never trained', () => {
    expect(zoneHistoryByGroup([], NOW).get('chest')).toBeUndefined();
  });

  it('counts exposures since the last time a zone was seen', () => {
    const history = [
      session(2, 10, 'chest', 'a'),   // hypertrophy
      session(5, 10, 'chest', 'b'),   // hypertrophy
      session(9, 5, 'chest', 'c'),    // strength — the last one
    ];
    const entry = zoneHistoryByGroup(history, NOW).get('chest')!;
    expect(entry.strength.exposuresSince).toBe(2);
    expect(entry.strength.daysSince).toBeCloseTo(9);
  });

  it('treats a group trained twice in one session as a single exposure', () => {
    const at = NOW - 3 * DAY;
    const twoChestExercises: SessionRecord = {
      id: 'double', planId: 'p', plannedFor: at, completedAt: at,
      performed: [
        { exerciseId: 'bench', name: 'Bench', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 10, completed: true, prescribedReps: 10 }] },
        { exerciseId: 'fly', name: 'Fly', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 12, completed: true, prescribedReps: 12 }] },
      ],
    };
    const entry = zoneHistoryByGroup([twoChestExercises], NOW).get('chest')!;
    expect(entry.strength.exposuresSince).toBe(1);
  });

  it('tracks groups independently', () => {
    const map = zoneHistoryByGroup([session(2, 5, 'chest', 'a'), session(4, 10, 'back', 'b')], NOW);
    expect(map.get('chest')!.strength.daysSince).toBeCloseTo(2);
    expect(map.get('back')!.strength.daysSince).toBeUndefined();
  });

  it('ignores sessions that were never completed', () => {
    const abandoned: SessionRecord = { ...session(1, 5, 'chest', 'x'), completedAt: undefined };
    expect(zoneHistoryByGroup([abandoned], NOW).get('chest')).toBeUndefined();
  });
});

describe('isZoneDue — exposures first, bounded by days', () => {
  const c = cadence()!;

  it('is due for a group that has never seen the zone', () => {
    expect(isZoneDue(undefined, 'strength', c)).toBe(true);
    expect(isZoneDue({ exposuresSince: 0 }, 'strength', c)).toBe(true);
  });

  it('is due once enough exposures have accumulated', () => {
    expect(isZoneDue({ exposuresSince: c.exposures.strength, daysSince: c.minDays + 1 }, 'strength', c)).toBe(true);
    expect(isZoneDue({ exposuresSince: c.exposures.strength - 1, daysSince: c.minDays + 1 }, 'strength', c)).toBe(false);
  });

  it('holds the minimum-days floor even when exposures have piled up', () => {
    // A 6x/week trainee reaches the exposure count fast; they still shouldn't be
    // tested every few days.
    expect(isZoneDue({ exposuresSince: 99, daysSince: c.minDays - 1 }, 'strength', c)).toBe(false);
  });

  it('fires on the maximum-days ceiling for a low-frequency trainee', () => {
    // Once a week never accumulates 6 exposures quickly — the ceiling is what
    // stops them waiting two months between calibrations.
    expect(isZoneDue({ exposuresSince: 2, daysSince: c.maxDays }, 'strength', c)).toBe(true);
  });
});

describe('zonePlanFor — assigning zones and placing tests', () => {
  function exercise(id: string, over: Partial<Exercise> = {}): Exercise {
    return {
      id,
      name: id,
      modality: 'strength',
      movementPattern: 'push',
      primaryAreas: ['chest'],
      equipment: ['barbell'],
      progression: 'weight',
      mechanic: 'compound',
      description: 'fixture',
      steps: [],
      ...over,
    };
  }

  const bench = exercise('bench');
  const fly = exercise('fly', { mechanic: 'isolation', movementPattern: 'push' });
  const row = exercise('row', { primaryAreas: ['back'], movementPattern: 'pull' });

  const plan = (over: Partial<ZonePlanInput> = {}) =>
    zonePlanFor({
      chosen: [bench, row],
      history: [],
      now: NOW,
      cadence: cadence({ targetDurationMin: 60 }),
      withProgressionBasis: new Set(['bench', 'row', 'fly']),
      testingAllowed: true,
      ...over,
    });

  it('puts everything at the baseline zone when testing is off', () => {
    const result = plan({ cadence: undefined });
    expect([...result.values()].every((a) => a.zone === 'hypertrophy' && !a.isTest)).toBe(true);
  });

  it('places no test when readiness or avoidance blocks it', () => {
    const result = plan({ testingAllowed: false });
    expect([...result.values()].some((a) => a.isTest)).toBe(false);
  });

  it('tests a group that has never seen the zone', () => {
    const result = plan();
    expect([...result.values()].some((a) => a.isTest && a.zone === 'strength')).toBe(true);
  });

  it('never tests a lift with no load baseline to ramp from', () => {
    const result = plan({ withProgressionBasis: new Set() });
    expect([...result.values()].some((a) => a.isTest)).toBe(false);
  });

  it('keeps strength tests on compounds', () => {
    const result = plan({ chosen: [fly], withProgressionBasis: new Set(['fly']) });
    expect(result.get('fly')!.zone).not.toBe('strength');
  });

  it('respects the session test budget', () => {
    const oneTest = plan({ cadence: cadence({ targetDurationMin: 40 }) });
    expect([...oneTest.values()].filter((a) => a.isTest)).toHaveLength(1);
    const twoTests = plan({ cadence: cadence({ targetDurationMin: 60 }) });
    expect([...twoTests.values()].filter((a) => a.isTest).length).toBeLessThanOrEqual(2);
  });

  it('never places both tests on the same muscle group', () => {
    // Two chest exercises, a long session, both zones due.
    const result = plan({ chosen: [bench, fly], withProgressionBasis: new Set(['bench', 'fly']) });
    const tested = [...result.entries()].filter(([, a]) => a.isTest);
    expect(tested.length).toBeLessThanOrEqual(1);
  });

  it('does not place a strength test in a style where it makes no sense', () => {
    const result = plan({ cadence: cadence({ targetDurationMin: 60, workoutType: 'cardio' }) });
    expect([...result.values()].some((a) => a.isTest && a.zone === 'strength')).toBe(false);
  });

  it('cascades: a second exercise for a just-tested group goes lighter and higher-rep', () => {
    // The engine has never accounted for damage it is about to inflict in the
    // same session — fatigue is derived from history, before the workout.
    const result = plan({ chosen: [bench, fly], withProgressionBasis: new Set(['bench', 'fly']) });
    const tested = [...result.entries()].find(([, a]) => a.isTest);
    expect(tested).toBeDefined();
    const other = [...result.entries()].find(([id]) => id !== tested![0]);
    expect(other![1].cascaded).toBe(true);
    expect(other![1].zone).toBe('endurance');
  });

  it('leaves an untouched muscle group alone', () => {
    const result = plan({ chosen: [bench, row] });
    const rowAssignment = result.get('row')!;
    if (!rowAssignment.isTest) expect(rowAssignment.cascaded).toBe(false);
  });

  it('prefers the most overdue group when several are eligible', () => {
    const longAgo = NOW - 60 * DAY;
    const recent = NOW - 12 * DAY;
    const history: SessionRecord[] = [
      {
        id: 'chest-recent', planId: 'p', plannedFor: recent, completedAt: recent,
        performed: [{ exerciseId: 'bench', name: 'bench', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 5, completed: true, prescribedReps: 5 }] }],
      },
      {
        id: 'back-old', planId: 'p', plannedFor: longAgo, completedAt: longAgo,
        performed: [{ exerciseId: 'row', name: 'row', primaryAreas: [{ group: 'back' }], sets: [{ reps: 5, completed: true, prescribedReps: 5 }] }],
      },
    ];
    const result = zonePlanFor({
      chosen: [bench, row],
      history,
      now: NOW,
      cadence: cadence({ targetDurationMin: 40 })!,
      withProgressionBasis: new Set(['bench', 'row']),
      testingAllowed: true,
    });
    expect(result.get('row')!.isTest).toBe(true);
    expect(result.get('bench')!.isTest).toBe(false);
  });
});
