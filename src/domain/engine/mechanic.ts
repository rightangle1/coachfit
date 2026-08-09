/**
 * Compound vs. isolation classification (ADR-0120, ADR-0123). Extracted from
 * timing.ts into its own leaf module so intensity.ts (which needs
 * `mechanicOf`) and timing.ts (which needs intensity.ts for graded rest) can
 * both depend on this without depending on each other.
 *
 * Kept free of catalog/data imports (ADR-0003): callers pass the resolved
 * `Exercise`, so this stays trivially unit-testable.
 */

import type { Exercise, MuscleGroup } from '../types';

export type Mechanic = 'compound' | 'isolation';

/** Large prime movers — a push/pull that drives one of these reads as compound. */
const BIG_MOVERS = new Set<MuscleGroup>([
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
]);

/**
 * Compound vs. isolation. Honors an explicit `exercise.mechanic` override; else
 * derives it: squat/hinge/lunge/carry are inherently multi-joint; a push/pull is
 * compound only when it drives a big mover (an arm-only curl/pushdown is
 * isolation); everything else (core, mobility, cardio) is treated as isolation
 * for rest purposes.
 */
export function mechanicOf(exercise: Exercise): Mechanic {
  if (exercise.mechanic) return exercise.mechanic;
  switch (exercise.movementPattern) {
    case 'squat':
    case 'hinge':
    case 'lunge':
    case 'carry':
      return 'compound';
    case 'push':
    case 'pull':
      return exercise.primaryAreas.some((g) => BIG_MOVERS.has(g)) ? 'compound' : 'isolation';
    default:
      return 'isolation';
  }
}
