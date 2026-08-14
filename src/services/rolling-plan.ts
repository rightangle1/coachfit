/**
 * Rolling weekly plan service — the ONLY thing the UI should call for the
 * day-level forecast (mirrors `services/programming.ts`'s wrap-and-log
 * pattern). Persists onto `AthleteProfile.rollingPlan` (services/athlete.ts)
 * and recomputes only at the two documented trigger points, never on every
 * render: after a workout completes, or on first app-open of a new day when
 * an expected workout was missed (CLAUDE.md §7 decision logging applies).
 */

import type { AthleteProfile, Modality, RollingPlan, Routine, ScheduledWorkout, SessionContext, SessionRecord } from '../domain/types';
import { buildRollingPlan, systemicState, type FixedForecastDay } from '../domain/engine';
import { sessionCountsByModalitySince } from '../domain/metrics';
import { EXERCISES } from '../domain/catalog';
import { getAthleteProfile, saveAthleteProfile } from './athlete';
import { logDecision } from './decision-log';

const DAY_MS = 86_400_000;
/** Must match `buildRollingPlan`'s own default — kept explicit here (rather
 * than relying on the parameter default silently lining up) so a future
 * change to one can't quietly desync fixed-day resolution from the forecast
 * it's resolved for. */
const DEFAULT_HORIZON_DAYS = 14;

function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export function getRollingPlan(): RollingPlan | undefined {
  return getAthleteProfile()?.rollingPlan;
}

/** True when a completed session or a scheduled workout already covers `date`. */
function dayIsCovered(date: number, history: SessionRecord[], scheduledWorkouts: AthleteProfile['scheduledWorkouts']): boolean {
  const hasCompleted = history.some((record) => record.completedAt != null && localDay(record.completedAt) === date);
  const hasScheduled = (scheduledWorkouts ?? []).some((item) => localDay(item.plannedFor) === date);
  return hasCompleted || hasScheduled;
}

/**
 * The two trigger conditions from CLAUDE.md-adjacent design: a workout
 * finished since the plan was generated, or a new day opened and a
 * forecasted workout day in between was never completed or scheduled.
 */
export function needsRollingPlanRefresh(
  profile: Pick<AthleteProfile, 'rollingPlan' | 'scheduledWorkouts'>,
  history: SessionRecord[],
  now: number = Date.now(),
): boolean {
  const plan = profile.rollingPlan;
  if (!plan) return true;

  const mostRecentCompletion = history.reduce(
    (latest, record) => (record.completedAt != null && record.completedAt > latest ? record.completedAt : latest),
    0,
  );
  if (mostRecentCompletion > plan.generatedAt) return true;

  const today = localDay(now);
  if (today <= plan.generatedForDay) return false;

  return plan.days.some(
    (day) =>
      day.kind === 'workout' &&
      day.date >= plan.generatedForDay &&
      day.date < today &&
      !dayIsCovered(day.date, history, profile.scheduledWorkouts),
  );
}

/** The dominant modality among a routine's exercises — majority vote (ties
 * favor whichever modality sorts first, matching `rules-engine.ts`'s own
 * `routineSkewsCardio` tie-breaking bias toward the non-cardio read). */
function dominantModalityOf(exerciseIds: string[]): Modality {
  const counts: Record<Modality, number> = { strength: 0, cardio: 0, mobility: 0, general: 0 };
  for (const id of exerciseIds) {
    const exercise = EXERCISES.find((entry) => entry.id === id);
    if (exercise) counts[exercise.modality] += 1;
  }
  return (Object.entries(counts) as [Modality, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/** 0=Sun..6=Sat, matching `Routine.recurrenceDaysOfWeek` (ADR-0137) — mirrors
 * `app/index.tsx`'s own `recurringRoutineFor`. */
function weekdayOf(ms: number): number {
  return new Date(ms).getDay();
}

/**
 * Resolves which forecast days are already fixed by a routine (ADR-0142) —
 * explicitly scheduled (`ScheduledWorkout.routineId`) or recurring
 * (`Routine.recurrenceDaysOfWeek`), explicit winning on a date both apply to,
 * matching the UI's own overlay order (`app/index.tsx`'s `weekPlan`).
 *
 * Deliberately lives in the service layer, not `domain/engine/rolling-plan.ts`:
 * that module stays free of any catalog dependency (ADR-0003, matching
 * `timing.ts`'s "callers pass the resolved value" leaf-module convention),
 * and resolving a routine's exercises to a dominant `Modality` needs the
 * catalog. Exported so the caller (`app/index.tsx`) can pass its own
 * already-loaded `routines`/`scheduledWorkouts` straight through.
 */
export function resolveFixedForecastDays(
  plannedFor: number,
  horizonDays: number,
  routines: Routine[],
  scheduledWorkouts: ScheduledWorkout[] | undefined,
): FixedForecastDay[] {
  const today = localDay(plannedFor);
  const fixed: FixedForecastDay[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = today + offset * DAY_MS;
    const scheduled = (scheduledWorkouts ?? []).find((item) => localDay(item.plannedFor) === date && item.routineId);
    const routine = scheduled
      ? routines.find((candidate) => candidate.id === scheduled.routineId)
      : routines.find((candidate) => candidate.recurrenceDaysOfWeek?.includes(weekdayOf(date)));
    if (routine) fixed.push({ date, modality: dominantModalityOf(routine.exerciseIds) });
  }
  return fixed;
}

export function refreshRollingPlan(
  context: SessionContext,
  routines: Routine[] = [],
  scheduledWorkouts: ScheduledWorkout[] = [],
): RollingPlan {
  const fixedDays = resolveFixedForecastDays(context.plannedFor, DEFAULT_HORIZON_DAYS, routines, scheduledWorkouts);
  // ADR-0142 v3: the same backward-looking systemic-load verdict that
  // already shrinks today's session (rules-engine.ts) is computed once here
  // so the forecast can surface it a day+ earlier than the same-day volume
  // cut it would otherwise only show up as.
  const systemic = systemicState(context.history, context.plannedFor);
  // ADR-0142 v4 (item 5): the same trailing 7-day window buildRollingPlan
  // itself uses for "owed" catch-up (today - 7d to today), classified by
  // dominant modality so the catch-up bias knows WHICH modality fell behind,
  // not just how many sessions did.
  const today = localDay(context.plannedFor);
  const recentModalityCounts = sessionCountsByModalitySince(context.history, today - 7 * DAY_MS, today);
  const plan = buildRollingPlan(context, DEFAULT_HORIZON_DAYS, fixedDays, systemic, recentModalityCounts);
  const profile = getAthleteProfile();
  if (profile) saveAthleteProfile({ ...profile, rollingPlan: plan });
  logDecision({
    call: 'planRollingWeek',
    // Mirrors RulesEngine's identity (rules-engine.ts) — this stays pure
    // rules logic that sits outside the ProgrammingEngine class itself.
    engineId: 'rules-engine',
    engineVersion: '0.1.0',
    input: context,
    output: plan,
    drivers: {
      fatigueByGroup: context.fatigue.byGroup,
      workoutDays: plan.days.filter((day) => day.kind === 'workout').length,
      // ADR-0142: how many of those days were already fixed by a routine
      // rather than proposed algorithmically.
      fixedDays: fixedDays.length,
      // ADR-0142 v3: CLAUDE.md §7 — which structured signal drove today's
      // deload flag, if any.
      deloadRecommended: plan.deloadRecommended,
    },
  });
  return plan;
}

/** The single call site the UI uses: returns the cached plan unless one of
 * the two trigger conditions is met, in which case it regenerates first.
 * `routines`/`scheduledWorkouts` are optional and additive — omitting them
 * preserves the exact prior (routine-unaware) forecast behavior. */
export function ensureRollingPlanFresh(
  context: SessionContext,
  routines: Routine[] = [],
  scheduledWorkouts: ScheduledWorkout[] = [],
): RollingPlan {
  const profile = getAthleteProfile();
  const cached = profile?.rollingPlan;
  if (profile && cached && !needsRollingPlanRefresh(profile, context.history, context.plannedFor)) {
    return cached;
  }
  return refreshRollingPlan(context, routines, scheduledWorkouts);
}
