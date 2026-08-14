import type { Modality, WorkoutType } from '@/domain/types';
import { familyOfWorkoutType } from '@/app-lib/options';

import type { ContextTone } from './tokens';

/** The visual vocabulary for training context. Keep status feedback separate. */
export function toneForModality(modality: Modality): ContextTone {
  if (modality === 'strength') return 'strength';
  if (modality === 'cardio') return 'endurance';
  if (modality === 'mobility') return 'mobility';
  return 'primary';
}

/**
 * Workout styles are broader than modalities, but should still carry context.
 * Derived from `familyOfWorkoutType` (ADR-0407) rather than its own hardcoded
 * bucket list, so a new mobility style (e.g. Pilates) picks up the right tone
 * for free. Note the behavior change this folds in: Balanced (`undefined`)
 * used to get its own distinct `'primary'` tone — `familyOfWorkoutType`
 * resolves unset to `'strength'` instead, so Balanced now reads as Strength's
 * tone everywhere (the Balanced tile, the workout overview/pre-start tint,
 * onboarding, workout-details) — a deliberate, visible side effect (ADR-0407),
 * not a regression.
 */
export function toneForWorkoutType(workoutType: WorkoutType | undefined): ContextTone {
  const family = familyOfWorkoutType(workoutType);
  if (family === 'cardio') return 'endurance';
  if (family === 'mobility') return 'mobility';
  return 'strength';
}
