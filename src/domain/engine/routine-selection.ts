/**
 * Routine recommendation (ADR-0137) — "have the system pick from my custom
 * routines." Pure, deterministic: ranks saved routines by how equipment-ready
 * they are today, how much they'd conflict with today's severe avoidance
 * flags, and how long it's been since the athlete last ran them.
 */

import { EXERCISES } from '../catalog';
import type { AvoidanceInput, EquipmentInventory, Routine } from '../types';
import { anyAreaMatches, equipmentSatisfied } from './matching';

export interface RoutineRecommendationContext {
  equipment: EquipmentInventory;
  avoidToday: AvoidanceInput;
  now?: number;
}

const WEIGHTS = {
  EQUIPMENT_COVERAGE: 60,
  AVOIDANCE_PENALTY: 80,
  RECENCY: 30,
} as const;

/** Recency bonus saturates two weeks out — a routine untouched for a month
 * shouldn't outrank one untouched for two weeks by an ever-growing margin. */
const RECENCY_SATURATION_DAYS = 14;
const DAY_MS = 86_400_000;

function scoreRoutine(routine: Routine, context: RoutineRecommendationContext): number {
  const exercises = routine.exerciseIds
    .map((id) => EXERCISES.find((candidate) => candidate.id === id))
    .filter((exercise): exercise is (typeof EXERCISES)[number] => exercise != null);
  if (exercises.length === 0) return -Infinity;

  const equipmentReady = exercises.filter((exercise) => equipmentSatisfied(exercise, context.equipment)).length;
  const coveragePct = equipmentReady / exercises.length;

  const severeAreas = context.avoidToday.flags.filter((flag) => flag.severity === 'severe').map((flag) => flag.area);
  const blocked = exercises.filter((exercise) => anyAreaMatches(severeAreas, exercise)).length;
  const avoidancePct = blocked / exercises.length;

  const now = context.now ?? Date.now();
  const daysSinceUsed = routine.lastUsedAt != null ? (now - routine.lastUsedAt) / DAY_MS : RECENCY_SATURATION_DAYS;
  const recencyBonus = Math.min(1, Math.max(0, daysSinceUsed) / RECENCY_SATURATION_DAYS);

  return (
    WEIGHTS.EQUIPMENT_COVERAGE * coveragePct -
    WEIGHTS.AVOIDANCE_PENALTY * avoidancePct +
    WEIGHTS.RECENCY * recencyBonus
  );
}

/** Best routine to suggest for today, or undefined if none are usable
 * (empty list, or every routine scored `-Infinity` — no exercises resolve
 * in the catalog). Ties break on whichever routine is older. */
export function recommendRoutine(
  routines: Routine[],
  context: RoutineRecommendationContext,
): Routine | undefined {
  if (routines.length === 0) return undefined;
  const [best] = routines
    .map((routine) => ({ routine, score: scoreRoutine(routine, context) }))
    .sort((a, b) => b.score - a.score || a.routine.createdAt - b.routine.createdAt);
  return best && best.score > -Infinity ? best.routine : undefined;
}
