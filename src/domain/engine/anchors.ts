/**
 * Stable progression anchors (ADR-0133, ADR-0142) — up to two exercises per
 * movement slot that already have a logged progression baseline, preferred
 * as a tiebreak in Main's ordering so the same 1-2 lifts stay measurable
 * week over week instead of rotating every session.
 *
 * Extracted from the now-retired `weekly-program.ts`'s six-week schedule,
 * which computed this identically but wrapped it in a full hypothetical
 * `sessions[]` array (movement slots, priority muscles, target set ranges)
 * that nothing else ever consumed (ADR-0142) — and which derived "today"'s
 * modality from its OWN separately-recomputed schedule rather than the
 * modality `generateSession` actually decided, a small inconsistency this
 * extraction also fixes by taking that modality as a parameter instead.
 */

import { EXERCISES } from '../catalog';
import type { Modality, MovementSlot, SessionContext } from '../types';
import { buildHistoryIndex } from './selection-score';
import { equipmentSatisfied } from './matching';

const STRENGTH_SLOTS: MovementSlot[][] = [
  ['squat', 'horizontal_push', 'horizontal_pull', 'anti_extension'],
  ['hinge', 'vertical_push', 'vertical_pull', 'lunge'],
  ['squat', 'hinge', 'carry', 'anti_rotation'],
  ['lunge', 'horizontal_push', 'horizontal_pull', 'lateral_core'],
];

/** Which movement slots today's anchor search rotates through, keyed by
 * modality and how many sessions have already run this ISO week. */
export function slotsFor(modality: Modality, index: number): MovementSlot[] {
  if (modality === 'strength') return [...STRENGTH_SLOTS[index % STRENGTH_SLOTS.length]];
  if (modality === 'cardio') return [(['steady_cardio', 'intervals', 'aerobics'] as const)[index % 3]];
  if (modality === 'mobility') return ['mobility', 'balance'];
  return ['squat', 'horizontal_push', 'horizontal_pull', 'steady_cardio', 'anti_extension'];
}

/**
 * Up to two exercise ids — one per movement slot (first two only) — that
 * already carry a progression baseline for `modality`, preferred by
 * `orderForSession` so progressive overload stays measurable on a stable
 * lift rather than a different one every session.
 */
export function stableAnchorExerciseIds(
  context: SessionContext,
  modality: Modality,
  movementSlots: MovementSlot[],
): string[] {
  const { withProgressionBasis } = buildHistoryIndex(context.history);
  const available = EXERCISES.filter((exercise) =>
    equipmentSatisfied(exercise, context.equipment) &&
    !context.excludedExerciseIds?.includes(exercise.id),
  );
  return movementSlots.slice(0, 2).flatMap((slot) => {
    const candidates = available.filter((exercise) => exercise.modality === modality && exercise.movementSlot === slot);
    return [candidates.find((exercise) => withProgressionBasis.has(exercise.id)) ?? candidates[0]]
      .filter((exercise): exercise is (typeof available)[number] => exercise != null)
      .map((exercise) => exercise.id);
  });
}
