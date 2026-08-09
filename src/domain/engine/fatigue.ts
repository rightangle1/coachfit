/**
 * Explainable local-fatigue model.
 *
 * This is a training-planning estimate, not a medical measurement. Each completed
 * set contributes a small, effort- and work-scaled impulse to the muscles it
 * loads. Those impulses decay independently over time, with a longer half-life
 * for all-out days. Keeping the coefficients here makes later calibration safe
 * and auditable.
 */

import { EXERCISES } from '../catalog';
import { intensityMultiplierFor } from './intensity';
import type {
  BodyArea,
  FatigueState,
  FatigueStatus,
  MuscleFatigueDetail,
  MuscleGroup,
  PerformedExercise,
  SessionRecord,
} from '../types';

/**
 * Age scaling for recovery (ADR-0127).
 *
 * `NORMAL_HALF_LIFE_HOURS` was universal: a 24-year-old and a 62-year-old were
 * handed identical decay curves, which is the single least defensible thing an
 * otherwise careful fatigue model can do. Recovery of maximal strength after
 * resistance work slows with age, so the half-life stretches — conservative
 * direction only, and only when the athlete has actually told us their age.
 */
const AGE_RECOVERY_BANDS: { maxAge: number; factor: number }[] = [
  { maxAge: 29, factor: 0.9 },
  { maxAge: 39, factor: 1.0 },
  { maxAge: 49, factor: 1.1 },
  { maxAge: 59, factor: 1.25 },
  { maxAge: Infinity, factor: 1.4 },
];

/** Multiplier on fatigue half-life for an athlete's age; 1 when unknown. */
export function ageRecoveryFactor(ageYears?: number): number {
  if (ageYears == null || !Number.isFinite(ageYears) || ageYears <= 0) return 1;
  return AGE_RECOVERY_BANDS.find((band) => ageYears <= band.maxAge)?.factor ?? 1;
}

export interface FatigueOptions {
  /** Stretches recovery half-life for older athletes (ADR-0127). */
  ageYears?: number;
}

export const FATIGUE = {
  /** A green muscle: normal selection and prescription. */
  RECOVERING: 0.35,
  /** A red muscle: hard recovery exclusion. */
  FATIGUED: 0.7,
  /** Base contribution of one completed, average working set. */
  SET_LOAD: 0.13,
  /** Secondary muscles receive reduced but non-zero fatigue credit. */
  SECONDARY_CREDIT: 0.4,
  NORMAL_HALF_LIFE_HOURS: 48,
  MAX_DAY_HALF_LIFE_HOURS: 60,
} as const;

export interface FatigueAreas {
  severe: BodyArea[];
  high: BodyArea[];
}

export function fatigueStatus(value: number): FatigueStatus {
  if (value >= FATIGUE.FATIGUED) return 'fatigued';
  if (value >= FATIGUE.RECOVERING) return 'recovering';
  return 'good';
}

/** A user override wins; otherwise near-max set/session RPE defines a max day. */
export function isMaxEffortDay(record: SessionRecord): boolean {
  if (record.debrief?.maxEffort != null) return record.debrief.maxEffort;
  if ((record.debrief?.overallRpe ?? 0) >= 9) return true;
  return record.performed.some((exercise) =>
    exercise.sets.some((set) => set.completed && (set.rpe ?? 0) >= 9),
  );
}

function workFactor(set: PerformedExercise['sets'][number]): number {
  if (set.reps != null) return clamp(set.reps / 10, 0.5, 1.25);
  if (set.durationSec != null) return clamp(set.durationSec / 45, 0.5, 1.25);
  return 1;
}

function effortFor(set: PerformedExercise['sets'][number], record: SessionRecord): number {
  return clamp((set.rpe ?? record.debrief?.overallRpe ?? 7) / 10, 0.1, 1);
}

/** Resolves an exercise's primary/secondary muscle groups, filling in from the
 * catalog when a record predates persisted `secondaryAreas` (ADR-0104 reuses
 * this so volume-landmark crediting matches fatigue crediting exactly). */
export function groupsFor(exercise: PerformedExercise): { primary: MuscleGroup[]; secondary: MuscleGroup[] } {
  const catalog = EXERCISES.find((candidate) => candidate.id === exercise.exerciseId);
  return {
    primary: exercise.primaryAreas.flatMap((area) => (area.group ? [area.group] : [])),
    // Older records did not persist secondary areas; the catalog safely fills that gap.
    secondary: (exercise.secondaryAreas ?? catalog?.secondaryAreas?.map((group) => ({ group })) ?? [])
      .flatMap((area) => (area.group ? [area.group] : [])),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Per-exercise intensity multiplier (ADR-0123) — a burpee's set counts for
 * more fatigue than a shadow-boxing set; a bench press's for more than a fly.
 * Unknown/synthetic exercise ids (not in the catalog) default to neutral. */
function intensityFor(exercise: PerformedExercise): number {
  const catalog = EXERCISES.find((candidate) => candidate.id === exercise.exerciseId);
  return catalog ? intensityMultiplierFor(catalog) : 1.0;
}

/**
 * Derive per-muscle fatigue by summing completed set impulses after recency
 * decay. Incomplete/skipped sets are intentionally excluded.
 */
export function deriveFatigueFromHistory(
  history: SessionRecord[],
  now: number,
  options: FatigueOptions = {},
): FatigueState {
  const ageFactor = ageRecoveryFactor(options.ageYears);
  const byGroup: Partial<Record<MuscleGroup, number>> = {};
  const details: Partial<Record<MuscleGroup, MuscleFatigueDetail>> = {};

  for (const record of history) {
    if (!record.completedAt || record.completedAt > now) continue;
    const maxDay = isMaxEffortDay(record);
    const hoursSince = (now - record.completedAt) / 3_600_000;
    const halfLife =
      (maxDay ? FATIGUE.MAX_DAY_HALF_LIFE_HOURS : FATIGUE.NORMAL_HALF_LIFE_HOURS) * ageFactor;
    const decay = Math.pow(2, -hoursSince / halfLife);
    const recordSets: Partial<Record<MuscleGroup, number>> = {};
    const recordNames: Partial<Record<MuscleGroup, string>> = {};

    for (const exercise of record.performed) {
      // Ramp sets are preparation, not training stimulus (ADR-0128).
      const completed = exercise.sets.filter((set) => set.completed && !set.isWarmup);
      if (!completed.length) continue;
      const { primary, secondary } = groupsFor(exercise);
      const intensity = intensityFor(exercise);
      const credit = (group: MuscleGroup, multiplier: number) => {
        const contribution = completed.reduce(
          (sum, set) => sum + FATIGUE.SET_LOAD * effortFor(set, record) * workFactor(set) * multiplier * intensity,
          0,
        );
        // Accumulate RAW here; the [0,1] clamp is applied once at the end.
        // Clamping inside this loop made the result depend on the order history
        // happened to arrive in: once a group saturated at 1.0, every later
        // contribution was silently discarded, so a 20-set chest day and a
        // 10-set one became indistinguishable and the same records in a
        // different order gave a different answer.
        byGroup[group] = (byGroup[group] ?? 0) + contribution * decay;
        recordSets[group] = (recordSets[group] ?? 0) + completed.length;
        recordNames[group] ??= exercise.name;
      };
      primary.forEach((group) => credit(group, 1));
      secondary.forEach((group) => credit(group, FATIGUE.SECONDARY_CREDIT));
    }

    for (const [group, completedSets] of Object.entries(recordSets) as [MuscleGroup, number][]) {
      const existing = details[group];
      if (!existing || (existing.lastTrainedAt ?? 0) < record.completedAt) {
        details[group] = {
          score: 0,
          status: 'good',
          lastTrainedAt: record.completedAt,
          lastWorkoutName: recordNames[group],
          completedSets,
          lastWorkoutWasMax: maxDay,
        };
      }
    }
  }

  // Single clamp, after every contribution has been summed (see `credit`).
  for (const group of Object.keys(byGroup) as MuscleGroup[]) {
    const score = clamp(byGroup[group] ?? 0, 0, 1);
    byGroup[group] = score;
    details[group] = {
      ...(details[group] ?? { completedSets: 0 }),
      score,
      status: fatigueStatus(score),
    };
  }

  return { byGroup, details, updatedAt: now };
}

export function fatigueAreas(state: FatigueState): FatigueAreas {
  const severe: BodyArea[] = [];
  const high: BodyArea[] = [];
  for (const [group, value] of Object.entries(state.byGroup)) {
    if (value == null) continue;
    if (value >= FATIGUE.FATIGUED) severe.push({ group: group as MuscleGroup });
    else if (value >= FATIGUE.RECOVERING) high.push({ group: group as MuscleGroup });
  }
  return { severe, high };
}
