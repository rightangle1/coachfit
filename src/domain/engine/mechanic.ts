/**
 * Compound vs. isolation classification (ADR-0120, ADR-0123), plus the
 * "what actually supplies the resistance" classification (`implementFor`,
 * ADR-0134/ADR-0144) — both pure per-exercise classifiers, so they share this
 * leaf module. Extracted from timing.ts into its own leaf module so
 * intensity.ts (which needs `mechanicOf`) and timing.ts (which needs
 * intensity.ts for graded rest) can both depend on this without depending on
 * each other; `implementFor` moved here from `catalog/index.ts` (ADR-0144) so
 * `progression.ts` can resolve an exercise's load-bearing equipment without a
 * catalog dependency.
 *
 * Kept free of catalog/data imports (ADR-0003): callers pass the resolved
 * `Exercise`, so this stays trivially unit-testable.
 */

import type { Exercise, EquipmentType, MuscleGroup } from '../types';

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

/**
 * Equipment that positions the body rather than supplying the resistance. A
 * push-up and a decline push-up are the same movement whether or not a bench
 * is involved, so these must not split a variant family (ADR-0134).
 */
const POSITIONING_EQUIPMENT = new Set<EquipmentType>(['bench', 'squat_rack', 'yoga_mat', 'foam_roller', 'barre']);

/** What actually supplies the resistance — the family's defining implement,
 * and (ADR-0144) what determines a weight floor (e.g. barbell → bar weight). */
export function implementFor(exercise: Exercise): EquipmentType {
  return exercise.equipment.find((type) => !POSITIONING_EQUIPMENT.has(type) && type !== 'bodyweight')
    ?? 'bodyweight';
}
