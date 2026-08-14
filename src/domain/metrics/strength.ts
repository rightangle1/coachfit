/**
 * Strength metric (ADR-0202 v1). Estimated 1RM (Epley) per exercise, from
 * completed weighted sets already captured by the tracker. Pure.
 */

import { EXERCISES } from '../catalog';
import type { MovementPattern, MuscleGroup, SessionRecord } from '../types';
import { weeklyVolumeByGroup, MRV } from './volume';

export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export interface StrengthPoint {
  date: number;
  e1rm: number;
}

/** Ascending-by-date e1RM history for one exercise, one point per session. */
export function exerciseHistory(history: SessionRecord[], exerciseId: string): StrengthPoint[] {
  const points: StrengthPoint[] = [];
  for (const rec of history) {
    if (!rec.completedAt) continue;
    const ex = rec.performed.find((p) => p.exerciseId === exerciseId);
    if (!ex) continue;
    let best = 0;
    for (const s of ex.sets) {
      if (!s.completed || s.weightKg == null || s.reps == null) continue;
      best = Math.max(best, epley1RM(s.weightKg, s.reps));
    }
    if (best > 0) points.push({ date: rec.completedAt, e1rm: Math.round(best * 10) / 10 });
  }
  return points.sort((a, b) => a.date - b.date);
}

export interface StrengthSnapshot {
  exerciseId: string;
  name: string;
  e1rm: number;
  date: number;
  previousE1rm?: number;
}

/** Latest e1RM per exercise ever logged, with the prior value for a trend delta. */
export function latestStrengthSnapshot(history: SessionRecord[]): StrengthSnapshot[] {
  const exerciseIds = new Set<string>();
  const names = new Map<string, string>();
  for (const rec of history) {
    for (const ex of rec.performed) {
      exerciseIds.add(ex.exerciseId);
      names.set(ex.exerciseId, ex.name);
    }
  }

  const snapshots: StrengthSnapshot[] = [];
  for (const id of exerciseIds) {
    const points = exerciseHistory(history, id);
    if (points.length === 0) continue;
    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : undefined;
    snapshots.push({
      exerciseId: id,
      name: names.get(id) ?? id,
      e1rm: latest.e1rm,
      date: latest.date,
      previousE1rm: previous?.e1rm,
    });
  }
  return snapshots.sort((a, b) => b.date - a.date);
}

/** Best-ever e1RM per exercise as of `history` — frozen once at workout start
 * as the baseline a live in-session PR is compared against. `PerformedSet`
 * carries no timestamp, so a live PR can't be read back from stored data
 * after the fact; this snapshot is what makes the live comparison possible. */
export function bestE1rmSnapshot(history: SessionRecord[], exerciseIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of exerciseIds) {
    const points = exerciseHistory(history, id);
    if (points.length) out[id] = Math.max(...points.map((p) => p.e1rm));
  }
  return out;
}

export interface ExerciseBestStats {
  /** Heaviest completed weighted set ever logged, with its rep count. */
  bestWeightKg?: number;
  bestWeightReps?: number;
  /** Best estimated 1RM ever derived from a completed weighted set. */
  bestE1rmKg?: number;
  /** Most reps ever completed in a single set with no weight logged (bodyweight). */
  maxReps?: number;
  /** Longest completed timed/hold set ever logged. */
  maxDurationSec?: number;
  /** Heaviest completed loaded timed/hold set ever logged (e.g. a farmer's
   * carry) — separate from `bestWeightKg` since there's no rep count to
   * pair it with, so no e1RM can be derived from it either. */
  bestLoadedWeightKg?: number;
}

/** All-time best stats for one exercise, read straight from completed history —
 * the "PR" line the detail view surfaces so a session isn't the only place an
 * athlete sees how they've done on a lift before. */
export function exerciseBestStats(history: SessionRecord[], exerciseId: string): ExerciseBestStats {
  const out: ExerciseBestStats = {};
  for (const rec of history) {
    const performed = rec.performed.find((p) => p.exerciseId === exerciseId);
    if (!performed) continue;
    for (const set of performed.sets) {
      if (!set.completed) continue;
      if (set.weightKg != null && set.reps != null) {
        if (out.bestWeightKg == null || set.weightKg > out.bestWeightKg) {
          out.bestWeightKg = set.weightKg;
          out.bestWeightReps = set.reps;
        }
        const e1rm = Math.round(epley1RM(set.weightKg, set.reps) * 10) / 10;
        if (out.bestE1rmKg == null || e1rm > out.bestE1rmKg) out.bestE1rmKg = e1rm;
      } else if (set.weightKg != null && set.durationSec != null) {
        if (out.bestLoadedWeightKg == null || set.weightKg > out.bestLoadedWeightKg) out.bestLoadedWeightKg = set.weightKg;
      } else if (set.reps != null && (out.maxReps == null || set.reps > out.maxReps)) {
        out.maxReps = set.reps;
      }
      if (set.durationSec != null && (out.maxDurationSec == null || set.durationSec > out.maxDurationSec)) {
        out.maxDurationSec = set.durationSec;
      }
    }
  }
  return out;
}

/** Exercise ids whose primary areas include `group`, in first-seen order. */
function exerciseIdsForGroup(history: SessionRecord[], group: MuscleGroup): string[] {
  const ids = new Set<string>();
  for (const rec of history) {
    for (const ex of rec.performed) {
      if (ex.primaryAreas.some((a) => a.group === group)) ids.add(ex.exerciseId);
    }
  }
  return Array.from(ids);
}

/** Per-point ratio series: at each of a series' points (2nd point onward),
 * `value ÷ the running-best-as-of-that-point` (never today's eventual max) —
 * the building block every relative-index rollup in `domain/metrics` shares
 * (muscle-group/movement-category strength here, cardio-category endurance
 * in `endurance.ts`, ADR-0205). Generic over the point shape so callers
 * needn't massage their series into a strength-specific `{ e1rm }` shape. */
export function relativeRatioPoints<T extends { date: number }>(
  points: T[],
  valueOf: (point: T) => number,
): { date: number; ratioPct: number }[] {
  if (points.length < 2) return [];
  const out: { date: number; ratioPct: number }[] = [];
  let runningBest = valueOf(points[0]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const value = valueOf(p);
    out.push({ date: p.date, ratioPct: runningBest > 0 ? (value / runningBest) * 100 : 0 });
    runningBest = Math.max(runningBest, value);
  }
  return out;
}

export interface MuscleGroupStrengthIndex {
  /** Mean, across every contributing exercise, of (latest e1RM ÷ that
   *  exercise's own best-ever e1RM) — a self-relative 0–100% ratio, never a
   *  mix of absolute kg across different lifts. Undefined if no exercise
   *  touching this group yet has 2+ logged sessions (a single session gives
   *  a trivial, uninformative 100%, so it's excluded rather than faked). */
  indexPct?: number;
  /** The same computation one qualifying session back per exercise (a
   *  subset of indexPct's cohort — an exercise needs a 3rd session to have a
   *  "previous" ratio, not just a 2nd), each measured against ITS
   *  running-best as of that earlier point — so this never retroactively
   *  changes once a later PR lands. Undefined if no exercise yet qualifies. */
  previousIndexPct?: number;
  /** How many exercises fed indexPct/previousIndexPct. */
  contributingExercises: number;
  /** The exercise with the most completed sessions touching this group — a
   *  stable "primary lift," so the kg number below is always the same lift
   *  over time, not whichever exercise was trained most recently. Ties break
   *  on lexicographically-smallest exerciseId (deterministic, arbitrary). */
  anchorExerciseId?: string;
  anchorExerciseName?: string;
  anchorSessionCount?: number;
  anchorE1rm?: number;
  anchorPreviousE1rm?: number;
}

/** Shared core behind every "relative-%-of-personal-best" strength rollup —
 * originally `muscleGroupStrengthIndex`'s body (ADR-0202 v2), generalized to
 * an arbitrary exercise-id list so the Progress-overview's movement-category
 * rollup (ADR-0205) can reuse the exact same averaging/anchor logic instead
 * of a second, cosmetically-similar implementation. */
function relativeStrengthIndexForExercises(
  history: SessionRecord[],
  exerciseIds: string[],
): MuscleGroupStrengthIndex | undefined {
  if (exerciseIds.length === 0) return undefined;

  const names = new Map<string, string>();
  for (const rec of history) {
    for (const ex of rec.performed) if (exerciseIds.includes(ex.exerciseId)) names.set(ex.exerciseId, ex.name);
  }

  let anchor: { id: string; points: StrengthPoint[] } | undefined;
  const latestRatios: number[] = [];
  const previousRatios: number[] = [];

  for (const id of [...exerciseIds].sort()) {
    const points = exerciseHistory(history, id);
    if (points.length === 0) continue;
    if (!anchor || points.length > anchor.points.length) anchor = { id, points };

    const ratios = relativeRatioPoints(points, (p) => p.e1rm);
    if (ratios.length > 0) {
      latestRatios.push(ratios[ratios.length - 1].ratioPct);
      if (ratios.length > 1) previousRatios.push(ratios[ratios.length - 2].ratioPct);
    }
  }

  if (!anchor) return undefined;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

  const anchorLast = anchor.points[anchor.points.length - 1];
  const anchorPrev = anchor.points.length > 1 ? anchor.points[anchor.points.length - 2] : undefined;

  return {
    indexPct: mean(latestRatios),
    previousIndexPct: mean(previousRatios),
    contributingExercises: latestRatios.length,
    anchorExerciseId: anchor.id,
    anchorExerciseName: names.get(anchor.id) ?? anchor.id,
    anchorSessionCount: anchor.points.length,
    anchorE1rm: anchorLast.e1rm,
    anchorPreviousE1rm: anchorPrev?.e1rm,
  };
}

/** Relative-strength index + anchor lift for one routine's exercises
 * (ADR-0137) — same self-relative-%-of-best formula as
 * `muscleGroupStrengthIndex`/`movementCategoryStrengthIndex`, applied to an
 * arbitrary, user-curated exercise-id list instead of a muscle group or
 * movement-pattern category. */
export function routineStrengthIndex(
  history: SessionRecord[],
  exerciseIds: string[],
): MuscleGroupStrengthIndex | undefined {
  return relativeStrengthIndexForExercises(history, exerciseIds);
}

/** Relative-strength index + anchor lift for one muscle group (ADR-0202 v2).
 * Replaces the removed `latestStrengthByGroup`, which mixed incompatible
 * absolute e1RM numbers across different lifts touching the same group. */
export function muscleGroupStrengthIndex(
  history: SessionRecord[],
  group: MuscleGroup,
): MuscleGroupStrengthIndex | undefined {
  return relativeStrengthIndexForExercises(history, exerciseIdsForGroup(history, group));
}

/** Movement-pattern categories for the Progress-screen "Overall Strength"
 * overview (ADR-0205) — Push/Pull/Legs/Core, derived from the catalog's
 * existing typed `movementPattern` field (previously only used for catalog
 * filtering/labels and calorie-tier lookup, never rolled up into a strength
 * metric). Legs groups the three lower-body patterns; Core groups core work
 * and loaded carries. */
export type MovementCategory = 'push' | 'pull' | 'legs' | 'core';

export const ALL_MOVEMENT_CATEGORIES: MovementCategory[] = ['push', 'pull', 'legs', 'core'];

const MOVEMENT_CATEGORY_PATTERNS: Record<MovementCategory, MovementPattern[]> = {
  push: ['push'],
  pull: ['pull'],
  legs: ['squat', 'hinge', 'lunge'],
  core: ['core', 'carry'],
};

/** Exercise ids whose catalog `movementPattern` falls in `category`, in
 * first-seen order. `PerformedExercise` doesn't carry `movementPattern`
 * itself, so unlike `exerciseIdsForGroup` this joins against the catalog by
 * id (same join pattern as `volume.ts`'s `dominantModalityOf`). */
function exerciseIdsForCategory(history: SessionRecord[], category: MovementCategory): string[] {
  const patterns = MOVEMENT_CATEGORY_PATTERNS[category];
  const ids = new Set<string>();
  for (const rec of history) {
    for (const ex of rec.performed) {
      if (ids.has(ex.exerciseId)) continue;
      const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
      if (catalogEntry && patterns.includes(catalogEntry.movementPattern)) ids.add(ex.exerciseId);
    }
  }
  return Array.from(ids);
}

/** Relative-strength index + anchor lift for one movement-pattern category —
 * the Push/Pull/Legs/Core counterpart to `muscleGroupStrengthIndex`, same
 * formula (ADR-0205). */
export function movementCategoryStrengthIndex(
  history: SessionRecord[],
  category: MovementCategory,
): MuscleGroupStrengthIndex | undefined {
  return relativeStrengthIndexForExercises(history, exerciseIdsForCategory(history, category));
}

export interface OverallStrengthIndex {
  /** Plain mean of the movement-category indices that have data — no new
   *  weighting or model, just an average of numbers already computed and
   *  shown per-category (ADR-0205). Undefined if no category has data yet. */
  indexPct?: number;
  previousIndexPct?: number;
  categories: Record<MovementCategory, MuscleGroupStrengthIndex | undefined>;
}

/** The Progress-screen "Overall Strength" headline number (ADR-0205): a
 * plain average of the 4 movement-category indices, each of which is itself
 * a plain average of exercise-level relative-%-of-best ratios. No weighting,
 * regression, or model is introduced at any level. */
export function overallStrengthIndex(history: SessionRecord[]): OverallStrengthIndex {
  const categories = Object.fromEntries(
    ALL_MOVEMENT_CATEGORIES.map((category) => [category, movementCategoryStrengthIndex(history, category)]),
  ) as Record<MovementCategory, MuscleGroupStrengthIndex | undefined>;

  const indexValues = ALL_MOVEMENT_CATEGORIES.map((c) => categories[c]?.indexPct).filter((v): v is number => v != null);
  const previousValues = ALL_MOVEMENT_CATEGORIES.map((c) => categories[c]?.previousIndexPct).filter(
    (v): v is number => v != null,
  );
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

  return { indexPct: mean(indexValues), previousIndexPct: mean(previousValues), categories };
}

// ---------------------------------------------------------------------------
// Absolute strength performance index (ADR-0206) — how you're training
// against an evidence-based volume ceiling (MRV), NOT relative to your own
// history. Contrast with `overallStrengthIndex` above, which is self-relative.
// Both are kept: "am I near my own best" and "am I training at a level that
// matches a recognized target" are different questions.
// ---------------------------------------------------------------------------

/** Muscle groups rolled into each movement category for the absolute
 * performance index — a muscle-group axis (matches how `weeklyVolumeByGroup`
 * already credits sets), distinct from `MOVEMENT_CATEGORY_PATTERNS`'s
 * exercise-`movementPattern` axis used by the self-relative index above. The
 * two are conceptually aligned (push exercises mostly train these push
 * muscles) but computed independently. */
const MOVEMENT_CATEGORY_MUSCLE_GROUPS: Record<MovementCategory, MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  core: ['abs', 'obliques', 'lower_back'],
};

function categoryVolumePct(byGroup: Partial<Record<MuscleGroup, number>>, category: MovementCategory): number {
  const groups = MOVEMENT_CATEGORY_MUSCLE_GROUPS[category];
  const pctPerGroup = groups.map((group) => Math.min(100, ((byGroup[group] ?? 0) / MRV) * 100));
  return pctPerGroup.reduce((a, b) => a + b, 0) / pctPerGroup.length;
}

export interface MovementCategoryPerformance {
  /** This week's completed sets per muscle group in this category, as a %
   *  of MRV (Maximum Recoverable Volume, ADR-0104) — averaged across the
   *  category's muscle groups, capped at 100. Always defined (0 is a
   *  meaningful, real answer — "no volume logged this week"), unlike the
   *  self-relative index which omits categories with insufficient history. */
  pct: number;
  previousPct: number;
}

/** Absolute weekly training-volume performance for one movement category —
 * the Push/Pull/Legs/Core counterpart to `movementCategoryStrengthIndex`,
 * but measured against an evidence-based ceiling instead of personal best. */
export function movementCategoryPerformanceIndex(
  history: SessionRecord[],
  category: MovementCategory,
  now = Date.now(),
): MovementCategoryPerformance {
  return {
    pct: categoryVolumePct(weeklyVolumeByGroup(history, 0, now), category),
    previousPct: categoryVolumePct(weeklyVolumeByGroup(history, 1, now), category),
  };
}

export interface OverallStrengthPerformance {
  /** Plain mean of the 4 movement-category performance percentages — same
   *  "just an average of numbers already shown per-category" honesty as
   *  `OverallStrengthIndex.indexPct`, applied to the absolute measure. */
  pct: number;
  previousPct: number;
  categories: Record<MovementCategory, MovementCategoryPerformance>;
}

/** The Progress-screen "Strength Index" headline number (ADR-0206): this
 * week's training volume vs. MRV, averaged across Push/Pull/Legs/Core. An
 * absolute measure — a fresh user starts at 0%, not "not enough data" —
 * because 0% is a real, meaningful answer to "are you training at a level
 * that matches this evidence-based target." */
export function overallStrengthPerformanceIndex(history: SessionRecord[], now = Date.now()): OverallStrengthPerformance {
  const categories = Object.fromEntries(
    ALL_MOVEMENT_CATEGORIES.map((category) => [category, movementCategoryPerformanceIndex(history, category, now)]),
  ) as Record<MovementCategory, MovementCategoryPerformance>;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  return {
    pct: mean(ALL_MOVEMENT_CATEGORIES.map((c) => categories[c].pct)),
    previousPct: mean(ALL_MOVEMENT_CATEGORIES.map((c) => categories[c].previousPct)),
    categories,
  };
}

/** Ascending series of the group's mean relative-strength ratio over time —
 * the charting counterpart to `muscleGroupStrengthIndex`'s latest/previous
 * snapshot. One point per date any contributing exercise (2+ sessions by
 * that point) logged a ratio; dates shared by multiple exercises average
 * together. */
export function muscleGroupStrengthIndexHistory(
  history: SessionRecord[],
  group: MuscleGroup,
): { date: number; indexPct: number }[] {
  const ids = exerciseIdsForGroup(history, group);
  const byDate = new Map<number, number[]>();
  for (const id of ids) {
    const ratios = relativeRatioPoints(exerciseHistory(history, id), (p) => p.e1rm);
    for (const r of ratios) {
      const list = byDate.get(r.date) ?? [];
      list.push(r.ratioPct);
      byDate.set(r.date, list);
    }
  }
  return Array.from(byDate.entries())
    .map(([date, ratios]) => ({ date, indexPct: ratios.reduce((a, b) => a + b, 0) / ratios.length }))
    .sort((a, b) => a.date - b.date);
}
