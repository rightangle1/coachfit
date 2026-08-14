/**
 * Which catalog exercises a given `WorkoutType` allows (ADR-0137 v2). Pure,
 * no IO — a direct mirror of the equivalent inline pool filters
 * `generateSession()` (rules-engine.ts) already applies during normal
 * (non-routine) generation, so a routine's exercise-eligibility rule is
 * never a stricter or looser rule than the engine's own. Used by the routine
 * builder (what's legal to add) and by the engine's stretch/yoga branch
 * (what a routine-restricted flow pool can draw from).
 */

import type { Exercise, WorkoutType } from '../types';

export function exercisesAllowedForWorkoutType(
  exercises: Exercise[],
  workoutType: WorkoutType | undefined,
): Exercise[] {
  switch (workoutType) {
    // Mirrors the `workoutType === 'bodyweight'` pool restriction at the top
    // of generateSession().
    case 'bodyweight':
      return exercises.filter((e) => e.equipment.every((eq) => eq === 'bodyweight' || eq === 'bench'));
    // Mirrors mainModality === 'cardio' drawing only cardio-modality exercises.
    case 'cardio':
      return exercises.filter((e) => e.modality === 'cardio');
    // Mirrors buildStretchFlow's stretchPool: static/dynamic stretches, plus
    // standalone yoga poses (no `emphasizesArea` gate here — a routine's own
    // curated list is the targeting).
    case 'stretch':
      return exercises.filter(
        (e) =>
          (e.movementPattern === 'stretch' && (e.progression === 'hold' || e.progression === 'reps')) ||
          e.movementPattern === 'yoga_flow',
      );
    // Mirrors buildStageFlow's yoga pool: yoga poses only.
    case 'yoga':
      return exercises.filter((e) => e.movementPattern === 'yoga_flow');
    // Mirrors buildStageFlow's barre pool: barre exercises only.
    case 'barre':
      return exercises.filter((e) => e.movementPattern === 'barre_flow');
    // Mirrors buildStageFlow's pilates pool: pilates exercises only.
    case 'pilates':
      return exercises.filter((e) => e.movementPattern === 'pilates_flow');
    default:
      // 'bodybuilding' / 'sculpting' / Balanced (undefined): the engine
      // doesn't restrict Main's pool by modality for these today — a mixed-
      // modality routine already routes mobility picks to Warmup/Cool down
      // and cardio picks to Conditioning (ADR-0137 v2), so restricting here
      // would be a stricter rule than the engine itself enforces.
      return exercises;
  }
}
