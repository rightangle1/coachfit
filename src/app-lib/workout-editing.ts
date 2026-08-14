/**
 * Pure helpers for manual in-app plan editing (add/replace/pair exercises),
 * kept free of React/RN imports so they're unit-testable in isolation.
 */

import type { Exercise, PlannedExercise, PlannedSet, WeightUnit } from '@/domain/types';
import { startingWeightKgFor } from '@/domain/engine/progression';

/**
 * Build sets that match the NEW exercise's own progression — a hold/timed
 * movement gets a duration set, a rep/weight movement gets rep sets — instead of
 * blindly copying the previous exercise's shape (which made a stretch dropped
 * into a strength block read as "10 reps · RPE 6"). Set count / rest / RPE are
 * borrowed from the template where they make sense.
 */
export function setsForProgression(
  exercise: Exercise,
  template?: PlannedExercise,
  availableWeightsKg?: number[],
  weightUnit: WeightUnit = 'kg',
): PlannedSet[] {
  const count = Math.max(1, template?.sets.length ?? 3);
  // A new weighted movement needs a usable load immediately. Prefer a proven
  // load from the exercise it replaces; otherwise a sensible, equipment-aware
  // starting weight (ADR-0144) — never a flat number that ignores whether
  // this is a barbell (floors at the empty bar) or a dumbbell the athlete
  // might only own very light plates for.
  const templateWeightKg = template?.sets.find((s) => s.weightKg != null && s.weightKg > 0)?.weightKg;
  const weightKg = templateWeightKg ?? startingWeightKgFor(exercise, availableWeightsKg, weightUnit);
  if (exercise.progression === 'time' || exercise.progression === 'hold') {
    const durationSec = template?.sets.find((s) => s.durationSec != null)?.durationSec ?? 30;
    // A loaded timed hold (farmer's carry, weighted plank) still needs a
    // usable load, same as a 'weight' progression movement below.
    return Array.from({ length: count }, () => ({
      durationSec,
      ...(exercise.loadsWeight && weightKg != null ? { weightKg } : {}),
    }));
  }
  const reps = template?.sets.find((s) => s.reps != null)?.reps ?? 10;
  const targetRpe = template?.sets.find((s) => s.targetRpe != null)?.targetRpe;
  const restSec = template?.sets.find((s) => s.restSec != null)?.restSec;
  return Array.from({ length: count }, (_, i) => ({
    reps,
    ...(exercise.progression === 'weight' && weightKg != null ? { weightKg } : {}),
    ...(targetRpe != null ? { targetRpe } : {}),
    ...(restSec != null && i < count - 1 ? { restSec } : {}),
  }));
}

type CascadableSet = {
  completed?: boolean;
  skipped?: boolean;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  isWarmup?: boolean;
  isCalibration?: boolean;
};

/**
 * Apply a patch to one set. A weight, reps, or duration change carries
 * forward to every later working set of the same exercise that hasn't been
 * logged yet — adjusting load, reps, or time mid-exercise means "use this
 * from here on," not "just this one set," and a superset's members are
 * updated independently so this only ever affects the edited exercise's own
 * later rounds, never its partner's.
 *
 * Warmup ramps and calibration (max-effort AMRAP test) sets carry a
 * deliberately different prescription from the working sets around them —
 * editing one is a one-off, not "use this from here on," so it never
 * cascades in either direction: it doesn't push its own value onward, and it
 * never receives a value cascaded from another set.
 */
export function updateSetWithCascade<T extends CascadableSet>(
  sets: T[],
  setIndex: number,
  patch: Partial<T>,
): T[] {
  const next = sets.map((s, i) => (i === setIndex ? { ...s, ...patch } : s));
  const { weightKg, reps, durationSec } = patch;
  if (weightKg == null && reps == null && durationSec == null) return next;
  const edited = sets[setIndex];
  if (edited?.isWarmup || edited?.isCalibration) return next;
  const cascade: Partial<CascadableSet> = {
    ...(weightKg != null ? { weightKg } : {}),
    ...(reps != null ? { reps } : {}),
    ...(durationSec != null ? { durationSec } : {}),
  };
  return next.map((s, i) =>
    i > setIndex && !s.completed && !s.skipped && !s.isWarmup && !s.isCalibration ? { ...s, ...cascade } : s,
  );
}

/**
 * A rotation group only has meaning when it contains at least two exercises.
 * Clear the group metadata from its last member so it renders and behaves as a
 * regular straight set after a partner is removed.
 */
export function normalizeSupersets(exercises: PlannedExercise[]): PlannedExercise[] {
  const counts = new Map<string, number>();
  exercises.forEach((exercise) => {
    if (exercise.rotationGroup) counts.set(exercise.rotationGroup, (counts.get(exercise.rotationGroup) ?? 0) + 1);
  });
  return exercises.map((exercise) =>
    exercise.rotationGroup && (counts.get(exercise.rotationGroup) ?? 0) < 2
      ? { ...exercise, rotationGroup: undefined, group: undefined }
      : exercise,
  );
}

/**
 * Replacements inherit the membership of the exercise they replace. Use the
 * current list, rather than a rendered snapshot, so a replacement cannot be
 * dropped from a superset by a concurrent plan edit.
 */
export function replaceExercise(
  exercises: PlannedExercise[],
  exerciseId: string,
  replacement: PlannedExercise,
): PlannedExercise[] {
  return normalizeSupersets(exercises.map((exercise) =>
    exercise.exerciseId === exerciseId
      ? { ...replacement, rotationGroup: exercise.rotationGroup, group: exercise.group }
      : exercise,
  ));
}
