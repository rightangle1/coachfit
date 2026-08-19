/**
 * Routines — a user-curated, reusable list of exercises (ADR-0137). Fixes
 * WHICH exercises Main draws from; the rules engine still owns everything
 * else (load/rep prescription, safety caps, warmup/cooldown, fatigue).
 */

import type { WorkoutType } from './session';

export interface Routine {
  id: string;
  name: string;
  /** Ordered, user-curated catalog exercise ids. */
  exerciseIds: string[];
  /** Optional default session style applied when this routine is run. */
  workoutType?: WorkoutType;
  /** Optional recurring days (0=Sun..6=Sat) — overlaid onto the weekly plan, never materialized ahead of time. */
  recurrenceDaysOfWeek?: number[];
  /**
   * When true, Warmup/Conditioning/Cool down draw only from this routine's
   * own exercises (or are skipped) instead of being backfilled from the
   * catalog — the routine's list becomes the entire session, not just Main
   * (which is already exclusive to the routine regardless of this flag).
   */
  onlyRoutineExercises?: boolean;
  /** Set when this routine was created from a completed workout. */
  createdFromSessionId?: string;
  lastUsedAt?: number;
  useCount?: number;
  createdAt: number;
  updatedAt: number;
}
