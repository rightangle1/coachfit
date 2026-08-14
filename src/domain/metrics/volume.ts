/**
 * Weekly training-load aggregation (ADR-0104). Pure, no I/O. This is the
 * shared ISO-week layer that volume landmarks, the overload-stall trigger
 * (ADR-0103 v2), and weekly modality cadence (ADR-0105 v2) all build on — one
 * bucketing implementation, not three.
 *
 * Muscle-group resolution reuses `groupsFor` from `domain/engine/fatigue.ts`
 * (catalog-based, with the same older-record fallback) rather than a
 * free-text name matcher, so volume crediting always agrees with fatigue
 * crediting for the same completed set.
 */

import { EXERCISES } from '../catalog';
import { FATIGUE, groupsFor } from '../engine/fatigue';
import type { ExperienceLevel, Modality, MuscleGroup, ResistanceFocus, SessionRecord } from '../types';

const WEEK_MS = 7 * 86_400_000;

/** Monday 00:00 (local time) of the ISO week containing `ms`. */
export function isoWeekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // Mon=1 .. Sun=7
  d.setDate(d.getDate() - (day - 1));
  return d.getTime();
}

function weekStartFor(weekOffset: number, now: number): number {
  return isoWeekStart(now) - weekOffset * WEEK_MS;
}

function inWeek(ms: number, weekStart: number): boolean {
  return ms >= weekStart && ms < weekStart + WEEK_MS;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Volume landmarks (ADR-0104)
// ---------------------------------------------------------------------------

/** Minimum effective volume — below this, a muscle group is under-stimulated. */
export const MEV = 10;
/** Maximum recoverable volume — at/above this, a muscle group is overreaching. */
export const MRV = 20;

export type VolumeStatus = 'under' | 'optimal' | 'over';

export interface VolumeLandmarks { mev: number; mrv: number }

/** Conservative starting ranges; history may trim or expand them over time. */
export function volumeLandmarksFor(
  focus: ResistanceFocus | undefined,
  experience: ExperienceLevel,
  history: SessionRecord[] = [],
  now = Date.now(),
): VolumeLandmarks {
  const experienceBase: Record<ExperienceLevel, VolumeLandmarks> = {
    beginner: { mev: 6, mrv: 12 },
    intermediate: { mev: 8, mrv: 16 },
    advanced: { mev: 10, mrv: 20 },
  };
  const focusShift: Record<ResistanceFocus, [number, number]> = {
    general: [0, 0],
    max_strength: [-2, -3],
    hypertrophy: [1, 2],
    muscular_endurance: [-1, 0],
    power: [-3, -5],
  };
  const base = experienceBase[experience];
  const [mevShift, mrvShift] = focusShift[focus ?? 'general'];
  const recent = history.filter((record) => {
    const when = record.completedAt ?? record.plannedFor;
    return when <= now && when >= now - 21 * 86_400_000;
  });
  const rough = recent.filter((record) =>
    (record.readiness?.energy ?? 3) <= 2 ||
    (record.readiness?.sleepQuality ?? 3) <= 2 ||
    (record.readiness?.soreness ?? 1) >= 4 ||
    record.endedEarlyReason === 'too_hard',
  ).length;
  const recoveryShift = rough >= 2 ? -2 : 0;
  const mev = Math.max(4, base.mev + mevShift);
  return { mev, mrv: Math.max(mev + 4, base.mrv + mrvShift + recoveryShift) };
}

export function volumeStatus(sets: number, landmarks: VolumeLandmarks = { mev: MEV, mrv: MRV }): VolumeStatus {
  if (sets < landmarks.mev) return 'under';
  if (sets >= landmarks.mrv) return 'over';
  return 'optimal';
}

/** Rolling seven-day volume avoids an artificial reset every Monday. */
export function rollingSevenDayVolumeByGroup(
  history: SessionRecord[],
  now = Date.now(),
): Partial<Record<MuscleGroup, number>> {
  const since = now - WEEK_MS;
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const record of history) {
    if (!record.completedAt || record.completedAt < since || record.completedAt > now) continue;
    for (const exercise of record.performed) {
      const completedSets = exercise.sets.filter((set) => set.completed && !set.skipped && !set.isWarmup && !set.isCalibration).length;
      if (!completedSets) continue;
      const { primary, secondary } = groupsFor(exercise);
      for (const group of primary) out[group] = (out[group] ?? 0) + completedSets;
      for (const group of secondary) out[group] = (out[group] ?? 0) + completedSets * FATIGUE.SECONDARY_CREDIT;
    }
  }
  for (const group of Object.keys(out) as MuscleGroup[]) out[group] = round1(out[group] as number);
  return out;
}

/**
 * Credited completed-set count per muscle group for one ISO week (0 = the
 * week containing `now`). Primary areas credit a full set; secondary areas
 * credit `FATIGUE.SECONDARY_CREDIT` (0.4) — the same split fatigue accounting
 * already uses, reused here rather than a second, ungrounded weighting.
 */
export function weeklyVolumeByGroup(
  history: SessionRecord[],
  weekOffset = 0,
  now = Date.now(),
): Partial<Record<MuscleGroup, number>> {
  const weekStart = weekStartFor(weekOffset, now);
  const out: Partial<Record<MuscleGroup, number>> = {};

  for (const record of history) {
    if (!record.completedAt || !inWeek(record.completedAt, weekStart)) continue;
    for (const exercise of record.performed) {
      const completedSets = exercise.sets.filter((s) => s.completed && !s.skipped && !s.isWarmup && !s.isCalibration).length;
      if (!completedSets) continue;
      const { primary, secondary } = groupsFor(exercise);
      for (const group of primary) out[group] = (out[group] ?? 0) + completedSets;
      for (const group of secondary) {
        out[group] = (out[group] ?? 0) + completedSets * FATIGUE.SECONDARY_CREDIT;
      }
    }
  }

  for (const group of Object.keys(out) as MuscleGroup[]) out[group] = round1(out[group] as number);
  return out;
}

export interface ExerciseVolumeContribution {
  exerciseId: string;
  name: string;
  sets: number;
}

/** Per-exercise contribution within each muscle group for one ISO week — the
 * Progress-screen drill-down ("which lifts drove this group's volume"). */
export function weeklyVolumeBreakdown(
  history: SessionRecord[],
  weekOffset = 0,
  now = Date.now(),
): Partial<Record<MuscleGroup, ExerciseVolumeContribution[]>> {
  const weekStart = weekStartFor(weekOffset, now);
  const out: Partial<Record<MuscleGroup, ExerciseVolumeContribution[]>> = {};

  const credit = (group: MuscleGroup, exerciseId: string, name: string, sets: number) => {
    const list = out[group] ?? (out[group] = []);
    const existing = list.find((c) => c.exerciseId === exerciseId);
    if (existing) existing.sets = round1(existing.sets + sets);
    else list.push({ exerciseId, name, sets: round1(sets) });
  };

  for (const record of history) {
    if (!record.completedAt || !inWeek(record.completedAt, weekStart)) continue;
    for (const exercise of record.performed) {
      const completedSets = exercise.sets.filter((s) => s.completed && !s.skipped && !s.isWarmup && !s.isCalibration).length;
      if (!completedSets) continue;
      const { primary, secondary } = groupsFor(exercise);
      primary.forEach((group) => credit(group, exercise.exerciseId, exercise.name, completedSets));
      secondary.forEach((group) =>
        credit(group, exercise.exerciseId, exercise.name, completedSets * FATIGUE.SECONDARY_CREDIT),
      );
    }
  }

  for (const group of Object.keys(out) as MuscleGroup[]) {
    out[group]!.sort((a, b) => b.sets - a.sets);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-exercise weekly volume-load trend (ADR-0103 v2 stall trigger + the
// Progressive Overload transparency view share this single series).
// ---------------------------------------------------------------------------

export interface WeeklyLoadPoint {
  weekStart: number;
  volumeLoad: number;
}

/** Ascending-by-week Σ(reps × weightKg) over completed sets for one exercise. */
export function weeklyLoadByExercise(history: SessionRecord[], exerciseId: string): WeeklyLoadPoint[] {
  const byWeek = new Map<number, number>();

  for (const record of history) {
    if (!record.completedAt) continue;
    const exercise = record.performed.find((p) => p.exerciseId === exerciseId);
    if (!exercise) continue;
    let volume = 0;
    for (const set of exercise.sets) {
      if (!set.completed || set.skipped || set.isWarmup || set.isCalibration || set.weightKg == null || set.reps == null) continue;
      volume += set.reps * set.weightKg;
    }
    if (!volume) continue;
    const weekStart = isoWeekStart(record.completedAt);
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + volume);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, volumeLoad]) => ({ weekStart, volumeLoad: round1(volumeLoad) }))
    .sort((a, b) => a.weekStart - b.weekStart);
}

export interface WeeklyGroupSeriesPoint {
  weekStart: number;
  sets: number;
}

/** Multi-week per-group set-count series (last `weeks` ISO weeks, ascending)
 * — generalizes the single-week `weeklyVolumeByGroup` for trend charts. */
export function weeklyVolumeByGroupSeries(
  history: SessionRecord[],
  group: MuscleGroup,
  weeks = 8,
  now = Date.now(),
): WeeklyGroupSeriesPoint[] {
  const points: WeeklyGroupSeriesPoint[] = [];
  for (let offset = weeks - 1; offset >= 0; offset--) {
    points.push({ weekStart: weekStartFor(offset, now), sets: weeklyVolumeByGroup(history, offset, now)[group] ?? 0 });
  }
  return points;
}

export interface WeeklyTotalPoint {
  weekStart: number;
  totalVolumeLoad: number;
}

/** Multi-week total volume-load (Σ reps×weight across every exercise),
 * ascending — the whole-workout counterpart to `weeklyLoadByExercise`, and
 * what "week-over-week gain" charts on Progress are built from. Weeks with no
 * completed weighted work still get a 0 point, so the chart keeps consistent
 * week spacing instead of silently skipping a gap. */
export function weeklyTotalVolumeSeries(history: SessionRecord[], weeks = 8, now = Date.now()): WeeklyTotalPoint[] {
  const byWeek = new Map<number, number>();
  for (let offset = 0; offset < weeks; offset++) byWeek.set(weekStartFor(offset, now), 0);
  const earliestWeekStart = weekStartFor(weeks - 1, now);

  for (const record of history) {
    if (!record.completedAt || record.completedAt < earliestWeekStart) continue;
    const weekStart = isoWeekStart(record.completedAt);
    if (!byWeek.has(weekStart)) continue;
    let volume = 0;
    for (const exercise of record.performed) {
      for (const set of exercise.sets) {
        if (!set.completed || set.skipped || set.isWarmup || set.isCalibration || set.weightKg == null || set.reps == null) continue;
        volume += set.reps * set.weightKg;
      }
    }
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + volume);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, totalVolumeLoad]) => ({ weekStart, totalVolumeLoad: round1(totalVolumeLoad) }))
    .sort((a, b) => a.weekStart - b.weekStart);
}

// ---------------------------------------------------------------------------
// Weekly session counts by modality (ADR-0105 v2 cadence override)
// ---------------------------------------------------------------------------

/** A completed session's dominant modality — the majority of its performed
 * exercises' catalog modality. Self-contained (no plan lookup needed).
 * Exported for `sessionCountsByModalitySince` below and for
 * `services/rolling-plan.ts` (item 5, ADR-0142 v4). */
export function dominantModalityOf(record: SessionRecord): Modality | undefined {
  const counts: Partial<Record<Modality, number>> = {};
  for (const exercise of record.performed) {
    const catalogExercise = EXERCISES.find((candidate) => candidate.id === exercise.exerciseId);
    if (!catalogExercise) continue;
    counts[catalogExercise.modality] = (counts[catalogExercise.modality] ?? 0) + 1;
  }
  let best: Modality | undefined;
  let bestCount = 0;
  for (const [modality, count] of Object.entries(counts) as [Modality, number][]) {
    if (count > bestCount) {
      best = modality;
      bestCount = count;
    }
  }
  return best;
}

/** Completed sessions in an explicit [since, until) window, bucketed by
 * dominant modality — the general form `weeklySessionCountsByModality`
 * wraps below. Exists separately because a rolling (non-Monday-reset)
 * window, like `rolling-plan.ts`'s trailing 7 days, isn't expressible as an
 * ISO-week offset. */
export function sessionCountsByModalitySince(
  history: SessionRecord[],
  since: number,
  until: number,
): Partial<Record<Modality, number>> {
  const out: Partial<Record<Modality, number>> = {};
  for (const record of history) {
    if (!record.completedAt || record.completedAt < since || record.completedAt >= until) continue;
    const modality = dominantModalityOf(record);
    if (!modality) continue;
    out[modality] = (out[modality] ?? 0) + 1;
  }
  return out;
}

/** Completed sessions this ISO week (0 = current), bucketed by dominant modality. */
export function weeklySessionCountsByModality(
  history: SessionRecord[],
  weekOffset = 0,
  now = Date.now(),
): Partial<Record<Modality, number>> {
  const weekStart = weekStartFor(weekOffset, now);
  return sessionCountsByModalitySince(history, weekStart, weekStart + WEEK_MS);
}
