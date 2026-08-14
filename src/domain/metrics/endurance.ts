/**
 * Endurance metric (ADR-0203 v2). v1: conditioning volume over time — a
 * proxy (consistency/volume), not a fitness-test number. v2 adds session-RPE
 * training load (Foster's method), a validated whole-session, cross-modality
 * load signal that needs no new instrumentation. Pure.
 */

import { EXERCISES } from '../catalog';
import type { MovementPattern, SessionRecord } from '../types';
import { setSeconds } from './calories';
import { relativeRatioPoints } from './strength';
import { isoWeekStart } from './volume';

export interface EndurancePoint {
  date: number;
  minutes: number;
}

/** Ascending-by-date total cardio minutes per completed session. */
export function cardioMinutesBySession(history: SessionRecord[]): EndurancePoint[] {
  const points: EndurancePoint[] = [];
  for (const rec of history) {
    if (!rec.completedAt) continue;
    let seconds = 0;
    for (const ex of rec.performed) {
      const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
      if (catalogEntry?.modality !== 'cardio') continue;
      for (const s of ex.sets) {
        if (s.completed && s.durationSec != null) seconds += s.durationSec;
      }
    }
    if (seconds > 0) points.push({ date: rec.completedAt, minutes: Math.round(seconds / 60) });
  }
  return points.sort((a, b) => a.date - b.date);
}

export interface EnduranceTrend {
  points: EndurancePoint[];
  direction: 'up' | 'flat' | 'down' | 'unknown';
}

/** Ascending-by-date total cardio minutes for ONE exercise, one point per
 * session it appears in — the endurance counterpart to `strength.ts`'s
 * `exerciseHistory`, and the building block `cardioCategoryEnduranceIndex`
 * needs (unlike `cardioMinutesBySession`, which sums across every cardio
 * exercise in a session, this isolates a single exercise so its minutes can
 * be compared against its own best-ever, not another exercise's). */
export function exerciseCardioMinutes(history: SessionRecord[], exerciseId: string): EndurancePoint[] {
  const points: EndurancePoint[] = [];
  for (const rec of history) {
    if (!rec.completedAt) continue;
    const ex = rec.performed.find((p) => p.exerciseId === exerciseId);
    if (!ex) continue;
    let seconds = 0;
    for (const s of ex.sets) {
      if (s.completed && s.durationSec != null) seconds += s.durationSec;
    }
    if (seconds > 0) points.push({ date: rec.completedAt, minutes: Math.round(seconds / 60) });
  }
  return points.sort((a, b) => a.date - b.date);
}

export interface CardioSnapshot {
  exerciseId: string;
  name: string;
  minutes: number;
  date: number;
  previousMinutes?: number;
}

/** Latest cardio minutes per exercise ever logged, with the prior value for
 * a trend delta — the endurance counterpart to `strength.ts`'s
 * `latestStrengthSnapshot`, backing the Progress screen's "Individual cardio
 * exercises" card (ADR-0205). */
export function latestCardioSnapshot(history: SessionRecord[]): CardioSnapshot[] {
  const exerciseIds = new Set<string>();
  const names = new Map<string, string>();
  for (const rec of history) {
    for (const ex of rec.performed) {
      const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
      if (catalogEntry?.modality !== 'cardio') continue;
      exerciseIds.add(ex.exerciseId);
      names.set(ex.exerciseId, ex.name);
    }
  }

  const snapshots: CardioSnapshot[] = [];
  for (const id of exerciseIds) {
    const points = exerciseCardioMinutes(history, id);
    if (points.length === 0) continue;
    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : undefined;
    snapshots.push({
      exerciseId: id,
      name: names.get(id) ?? id,
      minutes: latest.minutes,
      date: latest.date,
      previousMinutes: previous?.minutes,
    });
  }
  return snapshots.sort((a, b) => b.date - a.date);
}

/** Last `n` points plus a simple latest-vs-average-of-rest direction. */
export function recentEnduranceTrend(history: SessionRecord[], n = 5): EnduranceTrend {
  const all = cardioMinutesBySession(history);
  const points = all.slice(-n);
  if (points.length < 2) return { points, direction: 'unknown' };

  const latest = points[points.length - 1].minutes;
  const rest = points.slice(0, -1);
  const avgRest = rest.reduce((a, p) => a + p.minutes, 0) / rest.length;

  const direction = latest > avgRest * 1.1 ? 'up' : latest < avgRest * 0.9 ? 'down' : 'flat';
  return { points, direction };
}

// ---------------------------------------------------------------------------
// Session-RPE training load (ADR-0203 v2). Foster's method: a validated
// internal-training-load signal (RPE × duration) that needs no HR/lab data —
// the app already captures both per-set RPE and post-workout overallRpe.
// ---------------------------------------------------------------------------

/** Prefers the deliberate post-workout debrief RPE; falls back to the mean
 * RPE of completed sets across ALL performed exercises (not just cardio) if
 * any were logged; undefined if neither exists. */
export function sessionRpe(record: SessionRecord): number | undefined {
  if (record.debrief?.overallRpe != null) return record.debrief.overallRpe;
  const rpes: number[] = [];
  for (const ex of record.performed) {
    for (const s of ex.sets) {
      if (s.completed && s.rpe != null) rpes.push(s.rpe);
    }
  }
  return rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
}

/** Prefers wall-clock (completedAt - startedAt) when both are present and
 * positive; otherwise estimates from completed sets across ALL exercises
 * using the same per-set duration logic `calories.ts` already uses. */
export function sessionDurationMinutes(record: SessionRecord): number | undefined {
  if (record.startedAt != null && record.completedAt != null) {
    const ms = record.completedAt - record.startedAt;
    if (ms > 0) return ms / 60_000;
  }
  let seconds = 0;
  for (const ex of record.performed) {
    for (const s of ex.sets) {
      if (s.completed) seconds += setSeconds(s);
    }
  }
  return seconds > 0 ? seconds / 60 : undefined;
}

export interface TrainingLoadPoint {
  date: number;
  /** AU (arbitrary units) = session RPE × minutes — Foster et al.'s standard
   * sports-science notation; meaningful relative to itself over time, not as
   * an absolute physiological quantity. */
  load: number;
  rpe: number;
  minutes: number;
}

/** Ascending-by-date training load per completed session — only sessions
 * where both RPE and duration are computable produce a point. Whole-session,
 * cross-modality — the counterpart to `cardioMinutesBySession`'s
 * cardio-specific volume. */
export function sessionTrainingLoad(history: SessionRecord[]): TrainingLoadPoint[] {
  const points: TrainingLoadPoint[] = [];
  for (const rec of history) {
    if (!rec.completedAt) continue;
    const rpe = sessionRpe(rec);
    const minutes = sessionDurationMinutes(rec);
    if (rpe == null || minutes == null) continue;
    points.push({
      date: rec.completedAt,
      load: Math.round(rpe * minutes),
      rpe: Math.round(rpe * 10) / 10,
      minutes: Math.round(minutes),
    });
  }
  return points.sort((a, b) => a.date - b.date);
}

export interface TrainingLoadTrend {
  points: TrainingLoadPoint[];
  direction: 'up' | 'flat' | 'down' | 'unknown';
}

/** Last `n` training-load points plus a simple latest-vs-average-of-rest
 * direction — mirrors `recentEnduranceTrend`'s shape/thresholds exactly. */
export function recentTrainingLoadTrend(history: SessionRecord[], n = 5): TrainingLoadTrend {
  const all = sessionTrainingLoad(history);
  const points = all.slice(-n);
  if (points.length < 2) return { points, direction: 'unknown' };

  const latest = points[points.length - 1].load;
  const rest = points.slice(0, -1);
  const avgRest = rest.reduce((a, p) => a + p.load, 0) / rest.length;

  const direction = latest > avgRest * 1.1 ? 'up' : latest < avgRest * 0.9 ? 'down' : 'flat';
  return { points, direction };
}

// ---------------------------------------------------------------------------
// Cardio-category relative-endurance index (ADR-0205) — the endurance
// counterpart to `strength.ts`'s movement-category strength index, same
// self-relative-%-of-best formula (via the shared `relativeRatioPoints`)
// applied to minutes instead of e1RM. Backs the Progress-screen "Overall
// Endurance" overview and its "Endurance by type" detailed breakout.
// ---------------------------------------------------------------------------

/** The only complete, typed axis available for bucketing cardio work without
 * new catalog tagging: `movementPattern` is `'steady_cardio'`, `'interval'`,
 * or `'aerobics'` (ADR-0138) for every cardio exercise. A by-machine breakdown
 * (Treadmill/Bike/Row) was
 * investigated and rejected when `EquipmentType` had one flat `'cardio_machine'`
 * value for all machine exercises — a by-machine bucket would have left the
 * bodyweight-only third of the cardio catalog in a fabricated "Other" category.
 * `EquipmentType` now has specific treadmill/bike/elliptical/stair_climber/
 * rowing_machine values (equipment.ts), so a by-machine breakdown is possible
 * again — it just hasn't been built. Revisit this doc comment if it is. */
export type CardioCategory = 'steady' | 'interval' | 'aerobics';

export const ALL_CARDIO_CATEGORIES: CardioCategory[] = ['steady', 'interval', 'aerobics'];

const CARDIO_CATEGORY_PATTERNS: Record<CardioCategory, MovementPattern[]> = {
  steady: ['steady_cardio'],
  interval: ['interval'],
  aerobics: ['aerobics'],
};

/** Exercise ids whose catalog `movementPattern` falls in `category`, in
 * first-seen order — same catalog-join pattern as `strength.ts`'s
 * `exerciseIdsForCategory` (`PerformedExercise` doesn't carry
 * `movementPattern` itself). */
function exerciseIdsForCardioCategory(history: SessionRecord[], category: CardioCategory): string[] {
  const patterns = CARDIO_CATEGORY_PATTERNS[category];
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

export interface CardioCategoryEnduranceIndex {
  /** Mean, across every contributing cardio exercise in this category, of
   *  (latest session minutes ÷ that exercise's own best-ever minutes) — the
   *  endurance counterpart to `MuscleGroupStrengthIndex.indexPct`, same
   *  self-relative-%-of-best formula applied to minutes instead of e1RM.
   *  Undefined if no exercise in this category yet has 2+ logged sessions
   *  (a single session gives a trivial, uninformative 100%). */
  indexPct?: number;
  /** The same computation one qualifying session back per exercise. Undefined
   *  if no exercise yet qualifies. */
  previousIndexPct?: number;
  /** How many exercises fed indexPct/previousIndexPct. */
  contributingExercises: number;
  /** The exercise with the most completed sessions touching this category —
   *  a stable "anchor" cardio exercise, mirrors `MuscleGroupStrengthIndex`'s
   *  anchor lift. */
  anchorExerciseId?: string;
  anchorExerciseName?: string;
  anchorSessionCount?: number;
  anchorMinutes?: number;
  anchorPreviousMinutes?: number;
}

/** Shared core behind every "relative-%-of-personal-best" endurance rollup —
 * `strength.ts`'s `relativeStrengthIndexForExercises` counterpart, generalized
 * to an arbitrary exercise-id list so a routine's cardio exercises (ADR-0137)
 * can reuse the exact same averaging/anchor logic as the cardio-category
 * rollup below, instead of a second, cosmetically-similar implementation. */
function relativeEnduranceIndexForExercises(
  history: SessionRecord[],
  exerciseIds: string[],
): CardioCategoryEnduranceIndex | undefined {
  if (exerciseIds.length === 0) return undefined;

  const names = new Map<string, string>();
  for (const rec of history) {
    for (const ex of rec.performed) if (exerciseIds.includes(ex.exerciseId)) names.set(ex.exerciseId, ex.name);
  }

  let anchor: { id: string; points: EndurancePoint[] } | undefined;
  const latestRatios: number[] = [];
  const previousRatios: number[] = [];

  for (const id of [...exerciseIds].sort()) {
    const points = exerciseCardioMinutes(history, id);
    if (points.length === 0) continue;
    if (!anchor || points.length > anchor.points.length) anchor = { id, points };

    const ratios = relativeRatioPoints(points, (p) => p.minutes);
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
    anchorMinutes: anchorLast.minutes,
    anchorPreviousMinutes: anchorPrev?.minutes,
  };
}

/** Relative-endurance index + anchor exercise for one cardio category
 * (steady/interval) — the endurance counterpart to
 * `movementCategoryStrengthIndex` (ADR-0205). */
export function cardioCategoryEnduranceIndex(
  history: SessionRecord[],
  category: CardioCategory,
): CardioCategoryEnduranceIndex | undefined {
  return relativeEnduranceIndexForExercises(history, exerciseIdsForCardioCategory(history, category));
}

/** Relative-endurance index + anchor exercise for one routine's cardio
 * exercises (ADR-0137) — the endurance counterpart to
 * `strength.ts`'s `routineStrengthIndex`. Only relevant for routines that
 * include cardio exercises; callers filter `exerciseIds` to cardio ones. */
export function routineEnduranceIndex(
  history: SessionRecord[],
  exerciseIds: string[],
): CardioCategoryEnduranceIndex | undefined {
  return relativeEnduranceIndexForExercises(history, exerciseIds);
}

/** Ascending series of the category's mean relative-endurance ratio over
 * time — the charting counterpart to `cardioCategoryEnduranceIndex`'s
 * latest/previous snapshot, mirrors `muscleGroupStrengthIndexHistory`. */
export function cardioCategoryEnduranceIndexHistory(
  history: SessionRecord[],
  category: CardioCategory,
): { date: number; indexPct: number }[] {
  const ids = exerciseIdsForCardioCategory(history, category);
  const byDate = new Map<number, number[]>();
  for (const id of ids) {
    const ratios = relativeRatioPoints(exerciseCardioMinutes(history, id), (p) => p.minutes);
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

export interface OverallEnduranceIndex {
  /** Plain mean of the cardio-category indices that have data — no new
   *  weighting or model, mirrors `OverallStrengthIndex.indexPct` (ADR-0205). */
  indexPct?: number;
  previousIndexPct?: number;
  categories: Record<CardioCategory, CardioCategoryEnduranceIndex | undefined>;
}

/** The Progress-screen "Overall Endurance" headline number (ADR-0205): a
 * plain average of the steady/interval category indices, each of which is
 * itself a plain average of exercise-level relative-%-of-best ratios. */
export function overallEnduranceIndex(history: SessionRecord[]): OverallEnduranceIndex {
  const categories = Object.fromEntries(
    ALL_CARDIO_CATEGORIES.map((category) => [category, cardioCategoryEnduranceIndex(history, category)]),
  ) as Record<CardioCategory, CardioCategoryEnduranceIndex | undefined>;

  const indexValues = ALL_CARDIO_CATEGORIES.map((c) => categories[c]?.indexPct).filter((v): v is number => v != null);
  const previousValues = ALL_CARDIO_CATEGORIES.map((c) => categories[c]?.previousIndexPct).filter(
    (v): v is number => v != null,
  );
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

  return { indexPct: mean(indexValues), previousIndexPct: mean(previousValues), categories };
}

// ---------------------------------------------------------------------------
// Absolute endurance performance index (ADR-0206) — how you're training
// against the WHO/ACSM public-health activity guideline (150 min/week
// moderate-intensity, or an equivalent combination with vigorous work), NOT
// relative to your own history. Contrast with `overallEnduranceIndex` above,
// which is self-relative. Both are kept.
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 86_400_000;

function weekStartFor(weekOffset: number, now: number): number {
  return isoWeekStart(now) - weekOffset * WEEK_MS;
}

function inWeek(ms: number, weekStart: number): boolean {
  return ms >= weekStart && ms < weekStart + WEEK_MS;
}

/** This ISO week's cardio minutes in one category — the endurance
 * counterpart to `volume.ts`'s `weeklyVolumeByGroup`, backing the absolute
 * performance index below. */
export function weeklyCardioMinutesByCategory(
  history: SessionRecord[],
  category: CardioCategory,
  weekOffset = 0,
  now = Date.now(),
): number {
  const weekStart = weekStartFor(weekOffset, now);
  const patterns = CARDIO_CATEGORY_PATTERNS[category];
  let seconds = 0;
  for (const rec of history) {
    if (!rec.completedAt || !inWeek(rec.completedAt, weekStart)) continue;
    for (const ex of rec.performed) {
      const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
      if (!catalogEntry || !patterns.includes(catalogEntry.movementPattern)) continue;
      for (const s of ex.sets) {
        if (s.completed && s.durationSec != null) seconds += s.durationSec;
      }
    }
  }
  return seconds / 60;
}

/** WHO/ACSM public-health activity guideline: 150 min/week of
 * moderate-intensity aerobic activity, or an equivalent combination with
 * vigorous-intensity work (standard convention: 1 vigorous minute counts as
 * 2 moderate-equivalent minutes). Steady-state cardio maps to "moderate,"
 * interval/HIIT work maps to "vigorous." Aerobics (ADR-0138) is continuous,
 * moderate-RPE circuit work, not all-out effort — it counts at the same 1x
 * weight as steady rather than interval's 2x, the conservative read when the
 * true intensity of a given circuit isn't measured. */
export const WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES = 150;
const VIGOROUS_EQUIVALENCE_MULTIPLIER = 2;

function moderateEquivalentMinutes(history: SessionRecord[], weekOffset: number, now: number): number {
  const steady = weeklyCardioMinutesByCategory(history, 'steady', weekOffset, now);
  const interval = weeklyCardioMinutesByCategory(history, 'interval', weekOffset, now);
  const aerobics = weeklyCardioMinutesByCategory(history, 'aerobics', weekOffset, now);
  return steady + aerobics + interval * VIGOROUS_EQUIVALENCE_MULTIPLIER;
}

export interface EndurancePerformance {
  /** This week's moderate-equivalent minutes as a % of the WHO/ACSM 150
   *  min/week guideline, capped at 100. Always defined — 0% is a real,
   *  meaningful answer, same reasoning as `MovementCategoryPerformance.pct`. */
  pct: number;
  previousPct: number;
  /** Raw minutes behind `pct` (steady + interval×2), for a plain-language
   *  "X of 150 min" caption alongside the percentage. */
  minutes: number;
}

/** The Progress-screen "Endurance Index" headline number (ADR-0206): this
 * week's intensity-weighted cardio minutes vs. the WHO/ACSM public-health
 * target. An absolute measure, not a category breakdown — duration and
 * intensity combine into one blended figure per the guideline's own
 * "moderate OR vigorous OR a combination" framing, so unlike the strength
 * index there's no independent Steady/Interval sub-score to show. */
export function overallEndurancePerformanceIndex(history: SessionRecord[], now = Date.now()): EndurancePerformance {
  const minutes = moderateEquivalentMinutes(history, 0, now);
  const previousMinutes = moderateEquivalentMinutes(history, 1, now);
  return {
    pct: Math.min(100, (minutes / WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES) * 100),
    previousPct: Math.min(100, (previousMinutes / WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES) * 100),
    minutes,
  };
}
