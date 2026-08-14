/**
 * The athlete profile — stable-ish facts about the person. Session-specific,
 * day-to-day inputs live in readiness/targeting/avoidance (see session.ts).
 */

import type { BodyArea, MuscleGroup } from './body-area';
import type { ExperienceLevel, TrainingGoals } from './goals';
import type { RollingPlan, WorkoutOptions, WorkoutType } from './session';

/** Display unit for weight entry/output. Storage stays kg-canonical everywhere
 * else (progression, achievements, decision log) — this only drives the UI
 * conversion boundary (`@/app-lib/units`). */
export type WeightUnit = 'kg' | 'lb';

/**
 * Used only for the BMR term in calorie estimation (ADR-0127). 'unspecified'
 * falls back to the sex-neutral average, so declining to answer is a fully
 * supported choice rather than a degraded one.
 */
export type BiologicalSex = 'female' | 'male' | 'unspecified';

/** A dated bodyweight reading (ADR-0127). */
export interface BodyweightEntry {
  at: number;
  kg: number;
}

export interface AthleteProfile {
  id: string;
  displayName?: string;
  experience: ExperienceLevel;
  goals: TrainingGoals;
  /** Persistent constraints/injuries the engine must always respect. */
  constraints: Constraint[];
  /** Optional bodyweight for calorie/strength estimates; canonical kg. */
  bodyweightKg?: number;
  /**
   * Bodyweight over time (ADR-0127), newest entry appended. `bodyweightKg`
   * remains the "current" scalar the rest of the app reads; this is additive.
   *
   * Without it, weight loss — a first-class goal in CLAUDE.md §1/§8 — is
   * untrackable, and editing your weight silently rewrites the calorie estimate
   * on every session you have ever completed.
   */
  bodyweightLog?: BodyweightEntry[];
  /**
   * Birth year (ADR-0127). Optional; absent means today's exact behavior.
   *
   * The ONE demographic the programming engine reads, and only through four
   * documented hooks: recovery half-life, the warm-up floor, max-day cadence,
   * and max-day gating. A 24-year-old and a 62-year-old were previously given
   * identical recovery curves.
   */
  birthYear?: number;
  /**
   * METRICS ONLY (ADR-0127) — never read by anything under `domain/engine/`,
   * and there is a test that enforces it.
   *
   * These exist solely so calorie estimation can use a BMR-adjusted model
   * (Mifflin–St Jeor) instead of raw MET × kg × h. They are deliberately kept
   * out of programming: the engine already measures the individual directly
   * through logged loads and RPE, and the strength metric is self-relative, so
   * a population-level prior on top of that would make it worse, not better.
   */
  sex?: BiologicalSex;
  heightCm?: number;
  /** Preferred display unit for weight entry/output. Defaults to 'kg' when unset. */
  weightUnit?: WeightUnit;
  /** Warmup/stretching preference (ADR-0111). Unset = prior fixed behavior. */
  warmup?: WarmupPreferences;
  /** Cool-down stretching/foam-rolling preference (ADR-0116). Unset = default cool-down. */
  cooldown?: CooldownPreferences;
  /** Opt-in cadence for the controlled rep-max recommendations in bodybuilding. */
  maxDay?: MaxDayPreferences;
  /** Lightweight week-ahead intent; the exact session is regenerated on the day. */
  scheduledWorkouts?: ScheduledWorkout[];
  /**
   * Rolling day-level forecast (workout/rest + focus areas, no exercises/
   * weights) over the next several days. Recomputed only after a workout
   * completes or on first app-open of a new day when a workout was missed
   * (`services/rolling-plan.ts`), never on every render.
   */
  rollingPlan?: RollingPlan;
  /** Standing default workout style (e.g. 'sculpting'). Pre-fills the Today
   * screen's per-session picker; the athlete can always override per session. */
  preferredWorkoutType?: WorkoutType;
  /** When the athlete accepted the Terms & Conditions (`app-lib/terms.ts`). Unset = not yet accepted. */
  termsAcceptedAt?: number;
  /** Which `TERMS_VERSION` was accepted, so a future content change can prompt re-acceptance. */
  termsVersion?: string;
  /** When the athlete accepted the Privacy Policy (`app-lib/privacy.ts`). Unset = not yet accepted. */
  privacyAcceptedAt?: number;
  /** Which `PRIVACY_VERSION` was accepted, so a future content change can prompt re-acceptance. */
  privacyVersion?: string;
  /** Explicit opt-in to write completed workouts to Apple Health (CLAUDE.md §10,
   * ADR-0402). Unset/false = don't write, even if the device supports HealthKit. */
  healthSyncEnabled?: boolean;
  /** Explicit opt-in to local reminder notifications (ADR-0403). Unset/false = no reminders scheduled. */
  notificationsEnabled?: boolean;
  /** "HH:mm" local time for the two daily-scheduled reminder kinds. Unset = defaults (08:00 / 19:00). */
  notificationTimes?: { todayWorkout: string; streakKeeper: string };
  /**
   * First-run product education. Older profiles intentionally omit this field
   * so a newly added tour never interrupts people who already use the app.
   */
  appTour?: {
    /** Set only while creating a brand-new profile. */
    eligibleAt: number;
    /** Set when the athlete finishes, skips, or follows a tour destination. */
    completedAt?: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface Constraint {
  area: BodyArea;
  /** How the engine should treat it. */
  severity: 'avoid' | 'limit' | 'caution';
  note?: string;
}

export interface WarmupPreferences {
  /** Total warmup/stretch block time. */
  totalMinutes: number;
  /** Preferred drill variety; the engine repeats each movement for several rounds. */
  activityCount: number;
  /** Areas to bias selection toward — must be muscle-group level (ADR-0111). */
  focus: BodyArea[];
}

export interface MaxDayPreferences {
  /** Days between recommendations for one named lift. Zero/unset disables it. */
  byExercise?: Record<string, number>;
  /** Muscle-level fallback when no lift-specific cadence is configured. */
  byMuscleGroup?: Partial<Record<MuscleGroup, number>>;
}

export interface ScheduledWorkout {
  /** Local calendar day (stored as noon) to avoid daylight-saving ambiguity. */
  plannedFor: number;
  workoutType?: WorkoutType;
  workoutOptions?: WorkoutOptions;
  trainingIntent?: 'recovery' | 'balanced' | 'challenge';
  /** Routine (ADR-0137) to run this day, if any. */
  routineId?: string;
}

export const DEFAULT_WARMUP_PREFERENCES: WarmupPreferences = {
  totalMinutes: 5,
  // Several short drills, not one long static hold (methodology §7 / ADR-0111).
  activityCount: 4,
  focus: [],
};

/** Mirrors WarmupPreferences (ADR-0116) — same shape, drawn from the catalog's
 * `flowStage: 'cooldown'` pool (stretches + foam-rolling) instead of warmup stretches. */
export interface CooldownPreferences {
  /** Total cool-down block time. */
  totalMinutes: number;
  /** Preferred stretch/roll variety; the engine repeats each movement for several rounds. */
  activityCount: number;
  /** Areas to bias selection toward — must be muscle-group level (ADR-0111). */
  focus: BodyArea[];
}

export const DEFAULT_COOLDOWN_PREFERENCES: CooldownPreferences = {
  totalMinutes: 5,
  // A few distinct stretches, not one multi-minute hold (methodology §7 / ADR-0116).
  activityCount: 4,
  focus: [],
};

/** Age in whole years from `birthYear`, or undefined when not provided (ADR-0127). */
export function ageYearsOf(profile: Pick<AthleteProfile, 'birthYear'>, now: number = Date.now()): number | undefined {
  const year = profile.birthYear;
  if (year == null || !Number.isFinite(year)) return undefined;
  const age = new Date(now).getUTCFullYear() - year;
  return age > 0 && age < 120 ? age : undefined;
}
