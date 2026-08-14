/**
 * HealthKit write-back port (mirrors the ADR-0007 persistence-port pattern).
 * Write-only by design (CLAUDE.md §10's reserved write-back seam) — there is no
 * read path here.
 */

export type HealthActivityType = 'strength' | 'cardio' | 'yoga' | 'barre' | 'pilates' | 'flexibility' | 'functional';

export interface HealthWorkoutInput {
  activityType: HealthActivityType;
  startedAt: number;
  completedAt: number;
  totalEnergyKcal?: number;
}

export interface HealthWritePort {
  isSupported(): boolean;
  requestWriteAuthorization(): Promise<boolean>;
  /** Resolves to the saved workout's HealthKit UUID, or undefined on failure. */
  saveWorkout(input: HealthWorkoutInput): Promise<string | undefined>;
}
