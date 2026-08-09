/**
 * Systemic fatigue and proactive deloads (ADR-0126). Pure, deterministic.
 *
 * Fatigue accounting was entirely per-muscle. That means an athlete could train
 * six days straight with perfectly rotated splits and accumulate *no* penalty at
 * all, because no single muscle ever crossed a threshold — and deloads were
 * purely reactive (an RPE spike, a stalled lift, a fatigued muscle), so eight
 * weeks of hard, well-managed training could pass without the engine ever
 * suggesting a back-off. Real programs deload proactively; that is most of what
 * separates a program from a workout generator.
 *
 * The signal for this was already being computed and thrown away:
 * `sessionTrainingLoad` (Foster's session-RPE × minutes) lived in the metrics
 * layer with no consumers anywhere. This reads it.
 */

import type { ReadinessInput, SessionRecord } from '../types';
import { isoWeekStart, sessionRpe, sessionDurationMinutes } from '../metrics';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export const SYSTEMIC = {
  /** Consecutive weeks of rising load that trigger a proactive back-off. */
  RISING_WEEKS_FOR_DELOAD: 3,
  /** Consecutive training days tolerated before systemic fatigue starts biting. */
  CONSECUTIVE_DAYS_BEFORE_CUT: 5,
  /** Volume cut per training day beyond that threshold. */
  CUT_PER_EXTRA_DAY: 0.06,
  /** Volume cut applied when a proactive deload is due. */
  DELOAD_CUT: 0.2,
  /** Nothing systemic may ever cut more than this. */
  MAX_CUT: 0.3,
  /** How far back "have they been feeling rough lately" looks. */
  READINESS_MEMORY_DAYS: 5,
  /** Rough days inside that window before readiness starts compounding. */
  ROUGH_DAYS_BEFORE_CUT: 2,
  /** Additional cut per rough day beyond the threshold. */
  CUT_PER_ROUGH_DAY: 0.05,
  /** Cut per recent session genuinely abandoned for being too hard. */
  CUT_PER_OVERREACH: 0.08,
} as const;

export interface SystemicState {
  consecutiveTrainingDays: number;
  risingLoadWeeks: number;
  recentRoughDays: number;
  /** Sessions recently abandoned because the athlete ran out of gas. */
  recentOverreachedSessions: number;
  /** A planned back-off is due — not because anything broke, but because it's time. */
  deloadRecommended: boolean;
  /** Multiplicative, ≤ 1. Never raises. */
  volumeFactor: number;
  note?: string;
}

const NONE: SystemicState = {
  consecutiveTrainingDays: 0,
  risingLoadWeeks: 0,
  recentRoughDays: 0,
  recentOverreachedSessions: 0,
  deloadRecommended: false,
  volumeFactor: 1,
};

/**
 * Sessions the athlete cut short because they had nothing left — and only
 * those.
 *
 * Deliberately conjunctive. `endedEarly` on its own is not evidence the
 * prescription was too much: running out of time is at least as common as
 * running out of gas, and reading either signal alone would make the engine
 * timid for entirely the wrong reason. Both halves are required — the athlete
 * said it was too hard, AND sets actually went unfinished. A time-driven finish
 * never touches volume; that belongs to duration calibration instead.
 */
function recentOverreached(history: SessionRecord[], now: number): number {
  const since = now - SYSTEMIC.READINESS_MEMORY_DAYS * DAY_MS;
  let count = 0;
  for (const record of history) {
    const when = record.completedAt ?? record.plannedFor;
    if (when < since || when > now) continue;
    if (record.endedEarlyReason !== 'too_hard') continue;
    const skipped = record.performed.some((ex) => ex.sets.some((s) => s.skipped));
    if (skipped) count += 1;
  }
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dayKey(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Training days ending today or yesterday, counted back without a gap. */
function consecutiveTrainingDays(completed: number[], now: number): number {
  if (!completed.length) return 0;
  const days = new Set(completed.map(dayKey));
  const today = dayKey(now);
  // Allow the streak to end yesterday: asking "how many days in a row have I
  // trained" before today's session should still see the streak.
  let cursor = days.has(today) ? today : today - 1;
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

/** Weekly Foster load totals, oldest first, for the last `weeks` ISO weeks. */
function weeklyLoads(history: SessionRecord[], now: number, weeks: number): number[] {
  const thisWeek = isoWeekStart(now);
  const totals: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = thisWeek - i * WEEK_MS;
    const end = start + WEEK_MS;
    let total = 0;
    for (const record of history) {
      const when = record.completedAt ?? record.plannedFor;
      if (when < start || when >= end || record.completedAt == null) continue;
      const rpe = sessionRpe(record);
      const minutes = sessionDurationMinutes(record);
      if (rpe != null && minutes != null) total += rpe * minutes;
    }
    totals.push(total);
  }
  return totals;
}

/** How many consecutive weeks load has risen, counting back from last week. */
function risingWeeks(totals: number[]): number {
  // The current (partial) week is excluded — it is always "lower" simply
  // because it isn't finished, which would mask a genuine build-up.
  const complete = totals.slice(0, -1);
  let rising = 0;
  for (let i = complete.length - 1; i > 0; i--) {
    if (complete[i] > complete[i - 1] && complete[i - 1] > 0) rising += 1;
    else break;
  }
  return rising;
}

function isRough(readiness: ReadinessInput | undefined): boolean {
  if (!readiness) return false;
  return (
    (readiness.energy ?? 3) <= 2 ||
    (readiness.sleepQuality ?? 3) <= 2 ||
    (readiness.soreness ?? 1) >= 4
  );
}

/** Sessions in the recent window whose check-in was genuinely poor. */
function recentRoughDays(history: SessionRecord[], now: number): number {
  const since = now - SYSTEMIC.READINESS_MEMORY_DAYS * DAY_MS;
  let rough = 0;
  for (const record of history) {
    const when = record.completedAt ?? record.plannedFor;
    if (when < since || when > now) continue;
    if (isRough(record.readiness)) rough += 1;
  }
  return rough;
}

/**
 * Today's systemic picture: how relentlessly the athlete has been training, how
 * their overall load is trending, and whether they have been reporting rough
 * days. Reductions only — this can recommend backing off, never pushing harder.
 */
export function systemicState(history: SessionRecord[], now: number): SystemicState {
  const completed = history
    .filter((r) => r.completedAt != null && r.completedAt <= now)
    .map((r) => r.completedAt as number);
  if (!completed.length) return NONE;

  const streak = consecutiveTrainingDays(completed, now);
  // Five weeks fetched, not four: the current week is discarded as incomplete,
  // leaving four finished weeks — which is the minimum that can show the three
  // consecutive rises RISING_WEEKS_FOR_DELOAD asks for.
  const rising = risingWeeks(weeklyLoads(history, now, 5));
  const rough = recentRoughDays(history, now);
  const overreached = recentOverreached(history, now);

  const deloadRecommended =
    rising >= SYSTEMIC.RISING_WEEKS_FOR_DELOAD &&
    (rough > SYSTEMIC.ROUGH_DAYS_BEFORE_CUT || overreached > 0);

  const streakCut =
    Math.max(0, streak - SYSTEMIC.CONSECUTIVE_DAYS_BEFORE_CUT) * SYSTEMIC.CUT_PER_EXTRA_DAY;
  const roughCut =
    Math.max(0, rough - SYSTEMIC.ROUGH_DAYS_BEFORE_CUT) * SYSTEMIC.CUT_PER_ROUGH_DAY;
  const deloadCut = deloadRecommended ? SYSTEMIC.DELOAD_CUT : 0;
  const overreachCut = overreached * SYSTEMIC.CUT_PER_OVERREACH;
  const cut = clamp(streakCut + roughCut + deloadCut + overreachCut, 0, SYSTEMIC.MAX_CUT);

  const reasons: string[] = [];
  if (deloadRecommended) reasons.push(`your training load has climbed ${rising} weeks running — taking a planned step back`);
  if (streakCut > 0) reasons.push(`${streak} days trained in a row`);
  if (roughCut > 0) reasons.push(`a few rough check-ins this week`);
  if (overreachCut > 0) reasons.push(`you ran out of gas partway through recently`);

  return {
    consecutiveTrainingDays: streak,
    risingLoadWeeks: rising,
    recentRoughDays: rough,
    recentOverreachedSessions: overreached,
    deloadRecommended,
    volumeFactor: 1 - cut,
    note: reasons.length ? reasons.join('; ') : undefined,
  };
}
