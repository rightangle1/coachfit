/**
 * Achievements (ADR-0204 v2). Stateless — recomputed fresh from history every
 * call, so there's never drift between "unlocked" and what the data shows.
 *
 * v2 adds a catalog model: bounded/tiered families (streaks, session counts,
 * lifetime tonnage, lifetime cardio minutes, workout-style exploration,
 * per-muscle-group PRs) report both what's unlocked AND the next locked tier
 * with progress, for the trophy-case view. Open-ended families (per-exercise
 * PR, comeback-after-a-break, cardio-duration PR) stay unlocked-only — there's
 * no sensible "locked placeholder" for an unbounded, per-exercise stream.
 */

import type { MuscleGroup, SessionRecord, WorkoutType } from '../types';
import { ALL_MUSCLE_GROUPS } from '../types';
import { cardioMinutesBySession } from './endurance';
import { exerciseHistory } from './strength';

export type AchievementFamily =
  | 'first-session'
  | 'streak'
  | 'sessions'
  | 'tonnage'
  | 'endurance-minutes'
  | 'workout-style'
  | 'muscle-pr'
  | 'exercise-pr'
  | 'comeback'
  | 'cardio-pr';

export interface Achievement {
  id: string;
  family: AchievementFamily;
  title: string;
  description: string;
  achievedAt: number;
  /** Present only for exercise-pr; canonical kg — display converts per athlete unit. */
  e1rmKg?: number;
  /** Present only for cardio-pr. */
  minutes?: number;
}

export interface LockedAchievement {
  id: string;
  family: AchievementFamily;
  title: string;
  /** Short "how to unlock" or "x/y" progress text for the trophy case. */
  hint: string;
  progress?: { current: number; target: number };
}

type CompletedRecord = SessionRecord & { completedAt: number };

const DAY_MS = 86_400_000;

/** Local calendar-day key (not UTC — must match local-midnight cursors below). */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Human label for a muscle group. Duplicated (not imported) from
 * `app-lib/options.ts`'s `MUSCLE_GROUP_LABELS` deliberately — domain code
 * must not depend on the app-lib/UI layer (CLAUDE.md §14 layering). */
const MUSCLE_GROUP_TITLE: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_back: 'Lower back',
  neck: 'Neck',
};

/** The still-active streak (0 if the last session was 2+ days ago). For display. */
export function currentStreakDays(history: SessionRecord[], now = Date.now()): number {
  const completed = history.filter((r) => r.completedAt != null).map((r) => r.completedAt as number);
  if (completed.length === 0) return 0;
  const days = new Set(completed.map(dayKey));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

/** Best streak ever achieved (used to decide if a streak milestone was earned). */
export function longestCurrentStreak(sortedCompletedAt: number[]): number {
  if (sortedCompletedAt.length === 0) return 0;
  const days = [...new Set(sortedCompletedAt.map(dayKey))].sort();
  let streak = 1;
  let best = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]).getTime();
    const cur = new Date(days[i]).getTime();
    if (cur - prev === DAY_MS) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 1;
    }
  }
  return best;
}

/** Shared id-builder — the live in-workout celebration path (`workout.tsx`)
 * and this catalog both need to construct the exact same id shape. */
export function exercisePrId(exerciseId: string, dateMs: number): string {
  return `pr-${exerciseId}-${dateMs}`;
}

/** For an ascending-by-date value series, returns the date the running SUM
 *  first reached/exceeded each tier (null if never reached). */
function cumulativeThresholdCrossings(
  points: { date: number; value: number }[],
  tiers: number[],
): Map<number, number | null> {
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const ascending = [...tiers].sort((a, b) => a - b);
  const out = new Map<number, number | null>();
  let running = 0;
  let ti = 0;
  for (const p of sorted) {
    running += p.value;
    while (ti < ascending.length && running >= ascending[ti]) out.set(ascending[ti++], p.date);
  }
  while (ti < ascending.length) out.set(ascending[ti++], null);
  return out;
}

// ---------------------------------------------------------------------------
// Scalar-tier families: a running value crossing an ascending list of
// thresholds (streaks, session counts, lifetime tonnage, lifetime cardio
// minutes). One generic evaluator instead of hand-writing each tier.
// ---------------------------------------------------------------------------

interface ScalarTierFamily {
  family: AchievementFamily;
  tiers: number[];
  currentValue(completed: CompletedRecord[], now: number): number;
  crossingDates(completed: CompletedRecord[]): Map<number, number | null>;
  title(tier: number): string;
  description(tier: number): string;
  hint(current: number, target: number): string;
}

function evaluateScalarTierFamily(
  f: ScalarTierFamily,
  completed: CompletedRecord[],
  now: number,
): { unlocked: Achievement[]; nextLocked: LockedAchievement | null } {
  const crossings = f.crossingDates(completed);
  const unlocked: Achievement[] = [];
  let nextTier: number | null = null;
  for (const tier of [...f.tiers].sort((a, b) => a - b)) {
    const at = crossings.get(tier);
    if (at != null) {
      unlocked.push({
        id: `${f.family}-${tier}`,
        family: f.family,
        title: f.title(tier),
        description: f.description(tier),
        achievedAt: at,
      });
    } else if (nextTier == null) {
      nextTier = tier;
    }
  }
  if (nextTier == null) return { unlocked, nextLocked: null };
  const current = f.currentValue(completed, now);
  return {
    unlocked,
    nextLocked: {
      id: `${f.family}-${nextTier}`,
      family: f.family,
      title: f.title(nextTier),
      hint: f.hint(current, nextTier),
      progress: { current, target: nextTier },
    },
  };
}

const STREAK_TIERS = [3, 7, 14, 30, 50, 75, 100];

const streakFamily: ScalarTierFamily = {
  family: 'streak',
  tiers: STREAK_TIERS,
  currentValue: (completed, now) => currentStreakDays(completed, now),
  crossingDates: (completed) => {
    const best = longestCurrentStreak(completed.map((c) => c.completedAt));
    const at = completed.length ? completed[completed.length - 1].completedAt : null;
    const out = new Map<number, number | null>();
    for (const tier of STREAK_TIERS) out.set(tier, best >= tier ? at : null);
    return out;
  },
  title: (tier) => `${tier}-day streak`,
  description: (tier) => `Trained ${tier} days in a row.`,
  hint: (current, target) => `${current}/${target} days`,
};

const SESSION_TIERS = [5, 10, 25, 50, 100];

const sessionsFamily: ScalarTierFamily = {
  family: 'sessions',
  tiers: SESSION_TIERS,
  currentValue: (completed) => completed.length,
  crossingDates: (completed) => {
    const out = new Map<number, number | null>();
    for (const tier of SESSION_TIERS) out.set(tier, completed.length >= tier ? completed[tier - 1].completedAt : null);
    return out;
  },
  title: (tier) => `${tier} sessions`,
  description: (tier) => `Completed ${tier} workouts.`,
  hint: (current, target) => `${current}/${target} sessions`,
};

function lifetimeTonnagePoints(completed: CompletedRecord[]): { date: number; value: number }[] {
  return completed.map((r) => {
    let kg = 0;
    for (const ex of r.performed) {
      for (const s of ex.sets) {
        if (s.completed && s.weightKg != null && s.reps != null) kg += s.weightKg * s.reps;
      }
    }
    return { date: r.completedAt, value: kg };
  });
}

const TONNAGE_TIERS = [5000, 25000, 100000, 250000];

const tonnageFamily: ScalarTierFamily = {
  family: 'tonnage',
  tiers: TONNAGE_TIERS,
  currentValue: (completed) => lifetimeTonnagePoints(completed).reduce((a, p) => a + p.value, 0),
  crossingDates: (completed) => cumulativeThresholdCrossings(lifetimeTonnagePoints(completed), TONNAGE_TIERS),
  title: (tier) => `${formatThousands(tier)} kg lifted`,
  description: (tier) => `Lifted a lifetime total of ${formatThousands(tier)} kg.`,
  hint: (current, target) => `${formatThousands(current)}/${formatThousands(target)} kg`,
};

const ENDURANCE_MINUTE_TIERS = [60, 300, 600, 1500];

const enduranceMinutesFamily: ScalarTierFamily = {
  family: 'endurance-minutes',
  tiers: ENDURANCE_MINUTE_TIERS,
  currentValue: (completed) => cardioMinutesBySession(completed).reduce((a, p) => a + p.minutes, 0),
  crossingDates: (completed) =>
    cumulativeThresholdCrossings(
      cardioMinutesBySession(completed).map((p) => ({ date: p.date, value: p.minutes })),
      ENDURANCE_MINUTE_TIERS,
    ),
  title: (tier) => `${tier} cardio minutes`,
  description: (tier) => `Logged a lifetime total of ${tier} cardio minutes.`,
  hint: (current, target) => `${Math.round(current)}/${target} min`,
};

const SCALAR_TIER_FAMILIES: ScalarTierFamily[] = [streakFamily, sessionsFamily, tonnageFamily, enduranceMinutesFamily];

// ---------------------------------------------------------------------------
// Keyed families: a small, fixed key set, binary locked/unlocked per key.
// ---------------------------------------------------------------------------

interface KeyedFamily<K extends string> {
  family: AchievementFamily;
  keys: readonly K[];
  achievedAtForKey(completed: CompletedRecord[], key: K): number | null;
  title(key: K): string;
  description(key: K): string;
  hint(key: K): string;
}

function evaluateKeyedFamily<K extends string>(
  f: KeyedFamily<K>,
  completed: CompletedRecord[],
): { unlocked: Achievement[]; locked: LockedAchievement[] } {
  const unlocked: Achievement[] = [];
  const locked: LockedAchievement[] = [];
  for (const key of f.keys) {
    const at = f.achievedAtForKey(completed, key);
    if (at != null) {
      unlocked.push({
        id: `${f.family}-${key}`,
        family: f.family,
        title: f.title(key),
        description: f.description(key),
        achievedAt: at,
      });
    } else {
      locked.push({ id: `${f.family}-${key}`, family: f.family, title: f.title(key), hint: f.hint(key) });
    }
  }
  return { unlocked, locked };
}

export const WORKOUT_STYLE_KEYS = ['bodybuilding', 'sculpting', 'cardio', 'yoga', 'stretch', 'bodyweight'] as const satisfies readonly WorkoutType[];

export const WORKOUT_STYLE_LABELS: Record<(typeof WORKOUT_STYLE_KEYS)[number], string> = {
  bodybuilding: 'Bodybuilding',
  sculpting: 'Sculpting',
  cardio: 'Cardio',
  yoga: 'Yoga',
  stretch: 'Stretch',
  bodyweight: 'Bodyweight',
};

const workoutStyleFamily: KeyedFamily<(typeof WORKOUT_STYLE_KEYS)[number]> = {
  family: 'workout-style',
  keys: WORKOUT_STYLE_KEYS,
  achievedAtForKey: (completed, key) => completed.find((r) => r.workoutType === key)?.completedAt ?? null,
  title: (key) => `${WORKOUT_STYLE_LABELS[key]} explorer`,
  description: (key) => `Completed a ${WORKOUT_STYLE_LABELS[key].toLowerCase()} workout.`,
  hint: (key) => `Complete a ${WORKOUT_STYLE_LABELS[key].toLowerCase()} workout.`,
};

// ---------------------------------------------------------------------------
// Open-ended / dynamic families: unlocked-only, no locked placeholder makes
// sense (per-exercise PR is unbounded; comeback/cardio-PR are recurring).
// ---------------------------------------------------------------------------

interface ExercisePrEvent {
  exerciseId: string;
  name: string;
  date: number;
  e1rm: number;
  groups: MuscleGroup[];
}

/** Every exercise's PR-crossing events (first-ever logged weight excluded —
 * there's nothing to beat yet), each tagged with the muscle groups it
 * touches. Shared by `exercisePrAchievements` and the muscle-pr family so
 * both read off one pass instead of two. */
function exercisePrEvents(completed: CompletedRecord[]): ExercisePrEvent[] {
  const exerciseIds = new Set<string>();
  const names = new Map<string, string>();
  const groupsByExercise = new Map<string, Set<MuscleGroup>>();
  for (const rec of completed) {
    for (const ex of rec.performed) {
      exerciseIds.add(ex.exerciseId);
      names.set(ex.exerciseId, ex.name);
      const groups = groupsByExercise.get(ex.exerciseId) ?? new Set<MuscleGroup>();
      for (const area of ex.primaryAreas) if (area.group) groups.add(area.group);
      groupsByExercise.set(ex.exerciseId, groups);
    }
  }

  const events: ExercisePrEvent[] = [];
  for (const id of exerciseIds) {
    const points = exerciseHistory(completed, id);
    let max = 0;
    for (const p of points) {
      if (p.e1rm > max) {
        if (max > 0) {
          events.push({
            exerciseId: id,
            name: names.get(id) ?? id,
            date: p.date,
            e1rm: p.e1rm,
            groups: Array.from(groupsByExercise.get(id) ?? []),
          });
        }
        max = p.e1rm;
      }
    }
  }
  return events.sort((a, b) => a.date - b.date);
}

function exercisePrAchievements(events: ExercisePrEvent[]): Achievement[] {
  return events.map((e) => ({
    id: exercisePrId(e.exerciseId, e.date),
    family: 'exercise-pr',
    title: `New PR: ${e.name}`,
    description: 'Estimated 1RM of',
    e1rmKg: e.e1rm,
    achievedAt: e.date,
  }));
}

/** First PR event that touches each muscle group — bounded (14 groups), so
 * unlike `exercise-pr` this gets a locked/progress slot in the trophy case. */
function evaluateMusclePrFamily(events: ExercisePrEvent[]): { unlocked: Achievement[]; locked: LockedAchievement[] } {
  const firstByGroup = new Map<MuscleGroup, { date: number; e1rm: number; exerciseName: string }>();
  for (const e of events) {
    for (const group of e.groups) {
      if (!firstByGroup.has(group)) firstByGroup.set(group, { date: e.date, e1rm: e.e1rm, exerciseName: e.name });
    }
  }
  const unlocked: Achievement[] = [];
  const locked: LockedAchievement[] = [];
  for (const group of ALL_MUSCLE_GROUPS) {
    const label = MUSCLE_GROUP_TITLE[group];
    const first = firstByGroup.get(group);
    if (first) {
      unlocked.push({
        id: `muscle-pr-${group}`,
        family: 'muscle-pr',
        title: `${label} PR`,
        // The value (e1rmKg) is the point — the "you'll set one within days"
        // moment is trivial (the first-ever logged weight already excluded,
        // see exercisePrEvents), so what's worth showing is what was lifted.
        description: `${first.exerciseName} — estimated 1RM of`,
        e1rmKg: first.e1rm,
        achievedAt: first.date,
      });
    } else {
      locked.push({
        id: `muscle-pr-${group}`,
        family: 'muscle-pr',
        title: `${label} PR`,
        hint: `Set a personal record involving ${label}.`,
      });
    }
  }
  return { unlocked, locked };
}

const COMEBACK_TIERS = [30, 14, 7]; // descending — highest matching tier wins, not stacked

/** A session after a 7+/14+/30+ day gap since the previous one. Recurring by
 * nature (can happen more than once), so unlocked-only. */
function comebackAchievements(completed: CompletedRecord[]): Achievement[] {
  const out: Achievement[] = [];
  for (let i = 1; i < completed.length; i++) {
    const gapDays = Math.floor((completed[i].completedAt - completed[i - 1].completedAt) / DAY_MS);
    const tier = COMEBACK_TIERS.find((t) => gapDays >= t);
    if (tier) {
      out.push({
        id: `comeback-${completed[i].completedAt}`,
        family: 'comeback',
        title: 'Welcome back',
        description: `Returned to training after ${gapDays} days away.`,
        achievedAt: completed[i].completedAt,
      });
    }
  }
  return out;
}

/** Longest single cardio session, PR-loop style (first-ever value excluded). */
function cardioPrAchievements(completed: CompletedRecord[]): Achievement[] {
  const points = cardioMinutesBySession(completed);
  const out: Achievement[] = [];
  let max = 0;
  for (const p of points) {
    if (p.minutes > max) {
      if (max > 0) {
        out.push({
          id: `cardio-pr-${p.date}`,
          family: 'cardio-pr',
          title: 'New cardio PR',
          description: 'Longest cardio session:',
          minutes: p.minutes,
          achievedAt: p.date,
        });
      }
      max = p.minutes;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function evaluateAchievements(
  history: SessionRecord[],
  now = Date.now(),
): { unlocked: Achievement[]; locked: LockedAchievement[] } {
  const completed = history
    .filter((r): r is CompletedRecord => r.completedAt != null)
    .sort((a, b) => a.completedAt - b.completedAt);

  const unlocked: Achievement[] = [];
  const locked: LockedAchievement[] = [];

  // Scalar-tier families (streak/sessions/tonnage/endurance-minutes) and
  // first-session have nothing to compute with zero history. Keyed families
  // (workout-style, muscle-pr) below stay unconditional — their "locked"
  // hints ("Complete a yoga workout.") are genuinely useful before the
  // athlete's very first session, not just after.
  if (completed.length > 0) {
    unlocked.push({
      id: 'first-session',
      family: 'first-session',
      title: 'First session',
      description: 'Completed your first workout.',
      achievedAt: completed[0].completedAt,
    });

    for (const f of SCALAR_TIER_FAMILIES) {
      const { unlocked: u, nextLocked } = evaluateScalarTierFamily(f, completed, now);
      unlocked.push(...u);
      if (nextLocked) locked.push(nextLocked);
    }
  }

  const style = evaluateKeyedFamily(workoutStyleFamily, completed);
  unlocked.push(...style.unlocked);
  locked.push(...style.locked);

  const prEvents = exercisePrEvents(completed);
  unlocked.push(...exercisePrAchievements(prEvents));
  const musclePr = evaluateMusclePrFamily(prEvents);
  unlocked.push(...musclePr.unlocked);
  locked.push(...musclePr.locked);

  unlocked.push(...comebackAchievements(completed));
  unlocked.push(...cardioPrAchievements(completed));

  unlocked.sort((a, b) => b.achievedAt - a.achievedAt);
  return { unlocked, locked };
}

/** Preserved for backward compatibility — behaves identically to v1 for every
 * achievement that existed then (first-session, streak-3/7, sessions-5/10/25,
 * exercise-pr), now just one of several families `evaluateAchievements` composes. */
export function detectAchievements(history: SessionRecord[]): Achievement[] {
  return evaluateAchievements(history).unlocked;
}
