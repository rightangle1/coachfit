/**
 * UI-ready projections of persisted training data. These helpers intentionally
 * contain no programming decisions: they only summarize the rules engine's
 * existing history, fatigue, and volume outputs for Home and Progress.
 */

import { groupsFor } from '@/domain/engine/fatigue';
import { estimateSessionCalories, weeklyVolumeByGroup, MEV } from '@/domain/metrics';
import type {
  BodyArea,
  FatigueState,
  Modality,
  MuscleGroup,
  RollingPlanDay,
  Routine,
  ScheduledWorkout,
  SessionRecord,
  TrainingGoals,
  WeightUnit,
  WorkoutType,
} from '@/domain/types';

/** What the Weekly Plan popup's Recommend/Customize actions pass back to
 * schedule (or replace) a future day — a specific type/routine/focus for
 * that day, never a fallback to Today's own live builder state. */
export interface ScheduleWorkoutOptions {
  routineId?: string;
  workoutType?: WorkoutType;
  emphasize?: BodyArea[];
}

export type RecoveryBucket = 'fresh' | 'recovering' | 'fatigued';

export interface RecoverySummary {
  fresh: MuscleGroup[];
  recovering: MuscleGroup[];
  fatigued: MuscleGroup[];
  mostRecent?: { group: MuscleGroup; trainedAt: number; workoutName?: string };
}

export function recoverySummary(fatigue: FatigueState): RecoverySummary {
  const out: RecoverySummary = { fresh: [], recovering: [], fatigued: [] };
  for (const [group, detail] of Object.entries(fatigue.details ?? {}) as [MuscleGroup, NonNullable<FatigueState['details']>[MuscleGroup]][]) {
    if (!detail) continue;
    if (detail.status === 'good') out.fresh.push(group);
    else if (detail.status === 'recovering') out.recovering.push(group);
    else out.fatigued.push(group);
    if (detail.lastTrainedAt && (!out.mostRecent || detail.lastTrainedAt > out.mostRecent.trainedAt)) {
      out.mostRecent = { group, trainedAt: detail.lastTrainedAt, workoutName: detail.lastWorkoutName };
    }
  }
  return out;
}

export interface WeeklyVolumeSummary {
  completed: number;
  target: number;
  percent: number;
  groupsAtTarget: number;
  activeGroups: number;
}

/** Effective completed sets toward the app's existing minimum effective volume. */
export function weeklyVolumeSummary(history: SessionRecord[], now = Date.now()): WeeklyVolumeSummary {
  const volume = weeklyVolumeByGroup(history, 0, now);
  const rows = Object.values(volume).filter((sets): sets is number => typeof sets === 'number' && sets > 0);
  const completed = rows.reduce((sum, sets) => sum + Math.min(sets, MEV), 0);
  const target = rows.length * MEV;
  return {
    completed: Math.round(completed * 10) / 10,
    target,
    percent: target ? Math.round((completed / target) * 100) : 0,
    groupsAtTarget: rows.filter((sets) => sets >= MEV).length,
    activeGroups: rows.length,
  };
}

export interface WorkoutSummary {
  id: string;
  completedAt: number;
  title: string;
  exerciseCount: number;
  completedSets: number;
  volumeLoad: number;
  groups: MuscleGroup[];
}

export function workoutSummary(record: SessionRecord): WorkoutSummary {
  const groups = new Set<MuscleGroup>();
  let completedSets = 0;
  let volumeLoad = 0;
  for (const exercise of record.performed) {
    const resolved = groupsFor(exercise);
    resolved.primary.forEach((group) => groups.add(group));
    for (const set of exercise.sets) {
      if (!set.completed) continue;
      completedSets += 1;
      if (set.reps != null && set.weightKg != null) volumeLoad += set.reps * set.weightKg;
    }
  }
  return {
    id: record.id,
    completedAt: record.completedAt ?? record.plannedFor,
    title: record.performed[0]?.name ?? 'Completed workout',
    exerciseCount: record.performed.length,
    completedSets,
    volumeLoad: Math.round(volumeLoad),
    groups: Array.from(groups),
  };
}

/**
 * Suggests a default workout style from the athlete's goal weights — a
 * preselection only, never binding. The build-workout screen always lets the
 * user override it via the workout-style chips (CLAUDE.md §6: rules deliver
 * nuance, but nothing here is a safety constraint).
 */
/**
 * How far ahead the top goal must be, as a share of total goal weight, before
 * it's treated as dominant enough to preselect a style.
 *
 * Measured on NORMALIZED weights, deliberately. The raw comparison this replaces
 * tested `0.65 - 0.5 < 0.15` for a two-goal athlete — which is
 * `0.15000000000000002`, clearing the bar by 2×10⁻¹⁷. It happened to work, but
 * rounding the goal constants even slightly differently would have silently
 * switched the style default off for every athlete who picked two goals.
 *
 * Against normalized weights the real cases separate cleanly: one goal by
 * ≈0.176, two goals by ≈0.081, a flat spread by 0. A 0.05 threshold sits in the
 * gap with room on both sides.
 */
export const GOAL_DOMINANCE_THRESHOLD = 0.05;

export function recommendWorkoutType(goals: TrainingGoals): WorkoutType | undefined {
  const weights = goals.weights;
  const modalities = ['strength', 'cardio', 'mobility', 'general'] as Modality[];
  const total = modalities.reduce((sum, modality) => sum + (weights[modality] ?? 0), 0);
  if (total <= 0) return undefined;
  const ranked = modalities
    .map((modality): [Modality, number] => [modality, (weights[modality] ?? 0) / total])
    .sort((a, b) => b[1] - a[1]);
  const [topModality, topWeight] = ranked[0];
  const secondWeight = ranked[1][1];
  // Goals are close (or flat) — no single modality stands out, so leave it to
  // the engine's usual goal-weighted blend rather than force a style.
  if (topWeight - secondWeight < GOAL_DOMINANCE_THRESHOLD) return undefined;
  switch (topModality) {
    case 'strength':
      return 'bodybuilding';
    case 'cardio':
      return 'cardio';
    case 'mobility':
      return 'stretch';
    case 'general':
      return undefined;
  }
}

/** Local calendar-day keys (`en-CA` → `YYYY-MM-DD`) with a completed workout
 * in `[from, to)`. Used by the Progress-screen month calendar. */
export function sessionDaysInRange(history: SessionRecord[], from: number, to: number): Set<string> {
  const key = (ms: number) => new Date(ms).toLocaleDateString('en-CA');
  return new Set(
    history
      .filter((record) => record.completedAt != null && record.completedAt >= from && record.completedAt < to)
      .map((record) => key(record.completedAt as number)),
  );
}

const DAY_MS = 86_400_000;

export type WeeklyPerformanceMetric = 'strength' | 'endurance' | 'calories' | 'workouts';

export interface WeeklyPerformanceDay {
  day: number;
  label: string;
}

export interface WeeklyPerformance {
  days: WeeklyPerformanceDay[];
  values: Record<WeeklyPerformanceMetric, number[]>;
}

/** Noon-normalized local-day timestamp — two moments on the same calendar day
 * always compare equal regardless of time-of-day. */
export function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/** 0=Sun..6=Sat, matching `Routine.recurrenceDaysOfWeek` (ADR-0137). */
export function weekdayOf(ms: number): number {
  return new Date(ms).getDay();
}

/** The recurring routine (if any) whose days include `day`'s weekday and
 * that isn't already covered by a completed/manually-scheduled entry — a
 * render-time overlay, never materialized ahead of time (ADR-0137). */
export function recurringRoutineFor(day: number, routines: Routine[]): Routine | undefined {
  const weekday = weekdayOf(day);
  return routines.find((routine) => routine.recurrenceDaysOfWeek?.includes(weekday));
}

/** Same shape as `DayStatus`, keyed `day` instead of `date` — matches what
 * the Weekly Plan popup and the Today header's day strip actually render. */
export type WeekPlanRow =
  | { day: number; status: 'completed'; record: SessionRecord }
  | { day: number; status: 'scheduled'; scheduled: ScheduledWorkout }
  | { day: number; status: 'recurring'; routine: Routine }
  | { day: number; status: 'missed' }
  | { day: number; status: 'rest' }
  | { day: number; status: 'suggested'; intent: { modality?: Modality; priorityMuscles: MuscleGroup[] } };

export function toWeekPlanRow(resolved: DayStatus): WeekPlanRow {
  const { date, ...rest } = resolved;
  return { day: date, ...rest } as WeekPlanRow;
}

export type DayStatus =
  | { date: number; status: 'completed'; record: SessionRecord }
  | { date: number; status: 'scheduled'; scheduled: ScheduledWorkout }
  | { date: number; status: 'recurring'; routine: Routine }
  | { date: number; status: 'missed' }
  | { date: number; status: 'rest' }
  | { date: number; status: 'suggested'; intent: { modality?: Modality; priorityMuscles: MuscleGroup[] } };

/**
 * The one place that decides what a given calendar day "is" — completed,
 * scheduled, a recurring routine, missed, resting, or a forecasted
 * suggestion. Works for any date, not just days the rolling forecast covers
 * (which only ever runs today→forward): pass a matching `rollingDay` when
 * one exists, and omit it for days the forecast has no opinion on (e.g. a
 * day further in the past than the current forecast's horizon). A past day
 * with no completed record and no forecast opinion reads as `rest` — there's
 * no other ground truth for what an old day was supposed to be.
 */
export function resolveDayStatus(
  date: number,
  ctx: {
    completedByDay: Map<number, SessionRecord>;
    scheduledWorkouts: ScheduledWorkout[];
    routines: Routine[];
    todayLocal: number;
    rollingDay?: RollingPlanDay;
  },
): DayStatus {
  const record = ctx.completedByDay.get(date);
  if (record) return { date, status: 'completed', record };

  const scheduled = ctx.scheduledWorkouts.find((item) => localDay(item.plannedFor) === date);
  if (scheduled) return { date, status: 'scheduled', scheduled };

  // A recurring routine only overlays today/future days — it never rewrites
  // what already happened (or didn't) on a past day.
  const recurring = date >= ctx.todayLocal ? recurringRoutineFor(date, ctx.routines) : undefined;
  if (recurring) return { date, status: 'recurring', routine: recurring };

  if (date < ctx.todayLocal) {
    return ctx.rollingDay?.kind === 'workout' ? { date, status: 'missed' } : { date, status: 'rest' };
  }
  if (!ctx.rollingDay || ctx.rollingDay.kind === 'rest') return { date, status: 'rest' };
  return {
    date,
    status: 'suggested',
    intent: { modality: ctx.rollingDay.modality, priorityMuscles: ctx.rollingDay.priorityMuscles ?? [] },
  };
}

/**
 * Per-day (last 7 days ending on `now`'s calendar day) totals for the four
 * headline performance metrics shown on both Home and Progress — one shared
 * bucketing implementation instead of two hand-written, near-identical
 * copies (previously duplicated in `src/app/index.tsx` and
 * `src/app/progress.tsx`).
 */
export function weeklyPerformance(
  history: SessionRecord[],
  now: number,
  weightUnit: WeightUnit,
  bodyweightKg?: number,
): WeeklyPerformance {
  const days: WeeklyPerformanceDay[] = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    return { day: date.getTime(), label: date.toLocaleDateString(undefined, { weekday: 'short' }) };
  });
  const values: Record<WeeklyPerformanceMetric, number[]> = {
    strength: Array(7).fill(0),
    endurance: Array(7).fill(0),
    calories: Array(7).fill(0),
    workouts: Array(7).fill(0),
  };
  for (const record of history) {
    if (record.completedAt == null) continue;
    const index = days.findIndex(({ day }) => localDay(record.completedAt as number) === day);
    if (index < 0) continue;
    values.workouts[index] += 1;
    values.calories[index] += estimateSessionCalories(record, bodyweightKg).totalKcal;
    for (const exercise of record.performed) {
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        values.strength[index] += (set.reps ?? 0) * (set.weightKg ?? 0);
        values.endurance[index] += (set.durationSec ?? 0) / 60;
      }
    }
  }
  if (weightUnit === 'lb') values.strength = values.strength.map((value) => value * 2.2046226218);
  return { days, values };
}
