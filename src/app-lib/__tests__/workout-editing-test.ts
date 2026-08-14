import { normalizeSupersets, replaceExercise, setsForProgression, updateSetWithCascade } from '@/app-lib/workout-editing';
import type { Exercise, PlannedExercise, SupersetGroup } from '@/domain/types';

function ex(progression: Exercise['progression']): Exercise {
  return {
    id: 'x',
    name: 'X',
    modality: progression === 'hold' || progression === 'time' ? 'mobility' : 'strength',
    movementPattern: 'stretch',
    primaryAreas: ['quads'],
    equipment: ['bodyweight'],
    progression,
    description: '',
    steps: [],
  };
}

const strengthTemplate: PlannedExercise = {
  exerciseId: 't',
  name: 'T',
  primaryAreas: [{ group: 'back' }],
  sets: [
    { reps: 10, targetRpe: 6, restSec: 90 },
    { reps: 10, targetRpe: 6, restSec: 90 },
    { reps: 10, targetRpe: 6 },
  ],
};

describe('setsForProgression — a swapped/added exercise gets ITS own prescription shape', () => {
  it('a hold/stretch added into a strength block becomes a timed hold, not "10 reps · RPE 6"', () => {
    const sets = setsForProgression(ex('hold'), strengthTemplate);
    expect(sets).toHaveLength(3); // set count borrowed from the template
    expect(sets.every((s) => s.durationSec != null && s.reps == null)).toBe(true);
    expect(sets.every((s) => s.targetRpe == null)).toBe(true);
  });

  it('a rep exercise keeps rep sets, borrowing reps/RPE/rest from the template', () => {
    const sets = setsForProgression(ex('reps'), strengthTemplate);
    expect(sets.every((s) => s.reps === 10 && s.durationSec == null)).toBe(true);
    expect(sets[0].targetRpe).toBe(6);
    // Rest is carried on every set but the last.
    expect(sets[0].restSec).toBe(90);
    expect(sets[sets.length - 1].restSec).toBeUndefined();
  });

  it('defaults sensibly with no template (3 sets)', () => {
    expect(setsForProgression(ex('hold'))).toHaveLength(3);
    expect(setsForProgression(ex('reps'))[0].reps).toBe(10);
  });

  it('gives a weighted add or replacement a safe usable load', () => {
    // ADR-0144: the fallback is equipment-aware, so this needs a real
    // weighted implement — ex()'s shared 'bodyweight' tag would (correctly)
    // suggest nothing, which is covered separately below.
    const dumbbellWeight: Exercise = { ...ex('weight'), equipment: ['dumbbells'] };
    const weightedTemplate: PlannedExercise = {
      ...strengthTemplate,
      sets: strengthTemplate.sets.map((set) => ({ ...set, weightKg: 32.5 })),
    };
    expect(setsForProgression(dumbbellWeight, weightedTemplate).every((set) => set.reps === 10 && set.weightKg === 32.5)).toBe(true);
    // A proven template weight wins over any owned-weight guess.
    expect(setsForProgression(dumbbellWeight, undefined, [5, 10, 15])[0].weightKg).toBe(5);
    // No template, no owned weights: the generic 5 lb-equivalent floor —
    // never the old flat, equipment-blind 20 lb guess.
    expect(setsForProgression(dumbbellWeight, undefined, undefined, 'lb')[0].weightKg).toBeCloseTo(2.267962, 5);
  });

  it('never floors a dumbbell add below what the athlete actually owns, even a very light weight', () => {
    const dumbbellWeight: Exercise = { ...ex('weight'), equipment: ['dumbbells'] };
    expect(setsForProgression(dumbbellWeight, undefined, [1, 2.5, 5])[0].weightKg).toBe(1);
  });

  it('gives a barbell add or replacement the empty bar, never a lighter equipment-blind guess', () => {
    const barbellWeight: Exercise = { ...ex('weight'), equipment: ['barbell'] };
    expect(setsForProgression(barbellWeight, undefined)[0].weightKg).toBeCloseTo(20.41, 1);
  });

  it('suggests no weight for a bodyweight-implement exercise even if nominally weight-progression', () => {
    // ex('weight') itself is tagged equipment: ['bodyweight'] — nothing sensible to suggest.
    expect(setsForProgression(ex('weight'), undefined, [5, 10, 15]).every((set) => set.weightKg == null)).toBe(true);
  });

  it('a loaded timed hold (e.g. a farmer\'s carry) gets both a duration AND a usable load', () => {
    // ADR-0144: needs a real weighted implement — ex()'s shared 'bodyweight'
    // tag would (correctly) suggest no weight even with loadsWeight set.
    const carry: Exercise = { ...ex('time'), equipment: ['dumbbells'], loadsWeight: true };
    const sets = setsForProgression(carry, undefined, [10, 15, 20]);
    expect(sets.every((s) => s.durationSec != null && s.reps == null && s.weightKg === 10)).toBe(true);
  });

  it('an unloaded timed hold (e.g. a plank/stretch) still gets no weight field at all', () => {
    const sets = setsForProgression(ex('time'), undefined, [10, 15, 20]);
    expect(sets.every((s) => s.weightKg == null)).toBe(true);
  });
});

describe('superset edits', () => {
  const group: SupersetGroup = {
    id: 'pair-1',
    type: 'time_saver',
    rationale: 'Alternate the two exercises before resting.',
  };
  const pairedExercises: PlannedExercise[] = [
    { ...strengthTemplate, exerciseId: 'a', name: 'A', rotationGroup: group.id, group },
    { ...strengthTemplate, exerciseId: 'b', name: 'B', rotationGroup: group.id, group },
  ];

  it('turns the final member of a removed pair into a straight set', () => {
    expect(normalizeSupersets([pairedExercises[0]])[0]).toMatchObject({
      exerciseId: 'a',
      rotationGroup: undefined,
      group: undefined,
    });
  });

  it('keeps a replacement in the current exercise’s superset', () => {
    const replacement: PlannedExercise = { ...strengthTemplate, exerciseId: 'c', name: 'C' };
    const result = replaceExercise(pairedExercises, 'a', replacement);

    expect(result[0]).toMatchObject({ exerciseId: 'c', rotationGroup: group.id, group });
    expect(result[1]).toMatchObject({ exerciseId: 'b', rotationGroup: group.id, group });
  });
});

describe('updateSetWithCascade — weight, reps, and duration changes carry forward', () => {
  type Set = { weightKg?: number; reps?: number; durationSec?: number; completed?: boolean; skipped?: boolean };
  const sets: Set[] = [
    { weightKg: 20, reps: 10, completed: true },
    { weightKg: 20, reps: 10 },
    { weightKg: 20, reps: 10 },
    { weightKg: 20, reps: 10, skipped: true },
  ];

  it('applies a weight bump to every later unlogged set, leaving completed/skipped ones alone', () => {
    const result = updateSetWithCascade(sets, 1, { weightKg: 25 });
    expect(result.map((s) => s.weightKg)).toEqual([20, 25, 25, 20]);
  });

  it('applies a reps change to every later unlogged set, leaving completed/skipped ones alone', () => {
    const result = updateSetWithCascade(sets, 1, { reps: 8 });
    expect(result.map((s) => s.reps)).toEqual([10, 8, 8, 10]);
  });

  it('applies a duration change to every later unlogged set, leaving completed/skipped ones alone', () => {
    const timedSets: Set[] = [
      { durationSec: 30, completed: true },
      { durationSec: 30 },
      { durationSec: 30 },
      { durationSec: 30, skipped: true },
    ];
    const result = updateSetWithCascade(timedSets, 1, { durationSec: 45 });
    expect(result.map((s) => s.durationSec)).toEqual([30, 45, 45, 30]);
  });

  it('does not cascade earlier sets', () => {
    const result = updateSetWithCascade(sets, 2, { weightKg: 25 });
    expect(result[0].weightKg).toBe(20);
    expect(result[1].weightKg).toBe(20);
  });

  it('only cascades the field(s) actually patched', () => {
    const result = updateSetWithCascade(sets, 1, { reps: 8 });
    expect(result.map((s) => s.weightKg)).toEqual([20, 20, 20, 20]);
  });

  it('a patch with no cascadable fields does not touch later sets at all', () => {
    const result = updateSetWithCascade(sets, 1, {});
    expect(result).toEqual(sets);
  });
});

describe('updateSetWithCascade — warmup and calibration (max-effort) sets are exempt', () => {
  type Set = { weightKg?: number; reps?: number; completed?: boolean; skipped?: boolean; isWarmup?: boolean; isCalibration?: boolean };
  // Mirrors a zone-test exercise: two warmup ramp sets, then an all-out
  // calibration AMRAP, then the regular working sets (ADR-0128).
  const zoneTestSets: Set[] = [
    { weightKg: 10, reps: 8, isWarmup: true },
    { weightKg: 15, reps: 3, isWarmup: true },
    { weightKg: 20, reps: 5, isCalibration: true },
    { weightKg: 12, reps: 10 },
    { weightKg: 12, reps: 10 },
  ];

  it('a bump to an earlier warmup set does not carry onto the calibration or working sets', () => {
    const result = updateSetWithCascade(zoneTestSets, 0, { weightKg: 11 });
    expect(result.map((s) => s.weightKg)).toEqual([11, 15, 20, 12, 12]);
  });

  it('editing the calibration set itself only changes that set, not the working sets after it', () => {
    const result = updateSetWithCascade(zoneTestSets, 2, { weightKg: 22, reps: 6 });
    expect(result[2]).toMatchObject({ weightKg: 22, reps: 6 });
    expect(result.map((s) => s.weightKg)).toEqual([10, 15, 22, 12, 12]);
    expect(result.map((s) => s.reps)).toEqual([8, 3, 6, 10, 10]);
  });

  it('a bump to a regular working set skips over any warmup/calibration sets and lands on later working sets', () => {
    const result = updateSetWithCascade(zoneTestSets, 3, { weightKg: 14 });
    expect(result.map((s) => s.weightKg)).toEqual([10, 15, 20, 14, 14]);
  });
});
