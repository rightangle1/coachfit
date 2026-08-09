/**
 * Matching helpers (ADR-0106) — how a body area (from an avoidance flag,
 * constraint, or targeting entry) relates to an exercise. Pure, deterministic.
 */

import {
  GROUP_TO_REGION,
  WEIGHTED_EQUIPMENT_TYPES,
  type BodyArea,
  type EquipmentInventory,
  type EquipmentType,
  type Exercise,
  type LiveAdjustmentContext,
  type MuscleGroup,
} from '../types';

const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

/**
 * Replacement candidates always come from the enriched catalog (`CatalogExercise`
 * in domain/catalog), which guarantees these fields — but importing that type
 * here would create an engine↔catalog circular import, so this is the same
 * shape spelled out locally instead.
 */
type ReplacementCandidate = Exercise & Required<Pick<Exercise, 'movementSlot' | 'difficulty' | 'prerequisites'>>;

/** Every required piece of equipment must be present in the inventory, except
 * any type listed in `optional` — treated as satisfied whether owned or not
 * (e.g. yoga poses fall back to no-mat when the athlete doesn't have one). */
export function equipmentSatisfied(
  ex: Exercise,
  inventory: EquipmentInventory,
  optional: EquipmentType[] = [],
): boolean {
  const owned = new Set(inventory.items.map((i) => i.type));
  return ex.equipment.every((e) => owned.has(e) || optional.includes(e));
}

/**
 * The owned weights (canonical kg, ascending) that constrain this exercise's
 * load, or undefined if unconstrained (ADR-0115) — either the exercise doesn't
 * use a weighted-equipment type, or the athlete hasn't specified owned weights
 * for it. An exercise can only list one weighted-equipment type in practice
 * (dumbbells vs. kettlebell vs. bands aren't combined), so the first match wins.
 */
export function availableWeightsForExercise(
  ex: Exercise,
  inventory: EquipmentInventory,
): number[] | undefined {
  for (const type of WEIGHTED_EQUIPMENT_TYPES) {
    if (!ex.equipment.includes(type)) continue;
    const item = inventory.items.find((i) => i.type === type);
    const weights = item?.availableWeightsKg?.filter((weight) => Number.isFinite(weight) && weight > 0);
    if (weights?.length) {
      return weights.slice().sort((a, b) => a - b);
    }
    return undefined;
  }
  return undefined;
}

export type MatchStrength = 'primary' | 'secondary' | 'joint' | null;

/** How strongly an area is loaded by an exercise (null = not loaded). */
export function matchStrength(area: BodyArea, ex: Exercise): MatchStrength {
  const secondary = ex.secondaryAreas ?? [];

  if (area.group) {
    if (ex.primaryAreas.includes(area.group)) return 'primary';
    if (secondary.includes(area.group)) return 'secondary';
  }

  if (area.region) {
    const groupsInRegion = (gs: MuscleGroup[]) =>
      gs.some((g) => GROUP_TO_REGION[g] === area.region);
    if (groupsInRegion(ex.primaryAreas)) return 'primary';
    if (groupsInRegion(secondary)) return 'secondary';
  }

  if (area.joint && ex.jointLoad) {
    const j = area.joint.toLowerCase();
    if (ex.jointLoad.some((tag) => tag.toLowerCase() === j)) return 'joint';
  }

  return null;
}

export function areaMatchesExercise(area: BodyArea, ex: Exercise): boolean {
  return matchStrength(area, ex) !== null;
}

/** True if any of the areas loads the exercise. */
export function anyAreaMatches(areas: BodyArea[], ex: Exercise): boolean {
  return areas.some((a) => areaMatchesExercise(a, ex));
}

/** Does the exercise train at least one emphasized area (as a primary)? */
export function emphasizesArea(emphasize: BodyArea[], ex: Exercise): boolean {
  return emphasize.some((a) => matchStrength(a, ex) === 'primary');
}

/** True when targeting carries the "Full Body" session-structure directive
 * (region: 'full_body' never appears in GROUP_TO_REGION, so it deliberately
 * never matches per-exercise via emphasizesArea/matchStrength — this is how
 * the engine detects the directive instead). */
export function isFullBodyTargeting(areas: BodyArea[]): boolean {
  return areas.some((a) => a.region === 'full_body');
}

/**
 * The non-negotiable floor for swapping one exercise for another, live or
 * pre-workout (ADR-0106/ADR-0134): same training type, not user-excluded, and
 * not loading whatever the athlete flagged as bothering them today. Avoidance
 * flags are a hard constraint no other component may override (CLAUDE.md
 * §2/§6) — never a soft "suggested" signal the way movement/muscle/difficulty
 * fit is. Any exercise that fails this can never be offered as a replacement,
 * in "Suggested"/"Best Replacements" or browsed.
 *
 * Equipment ownership is included in the floor by default, but is the one
 * check a caller can knowingly waive via `options.ignoreEquipment` — a
 * deliberate manual pick (e.g. "Any Equipment" in the picker, athlete is at a
 * different gym today) is allowed to swap in gear they don't have on file.
 * Session *generation* must never do this — only a manual replace action sets
 * the flag, and it does so per-pick, not as a standing override.
 */
export function replacementAllowed(
  original: ReplacementCandidate,
  candidate: ReplacementCandidate,
  context: LiveAdjustmentContext,
  options?: { ignoreEquipment?: boolean },
): boolean {
  return (
    candidate.id !== original.id &&
    candidate.modality === original.modality &&
    (options?.ignoreEquipment || equipmentSatisfied(candidate, context.equipment)) &&
    !context.excludedExerciseIds?.includes(candidate.id) &&
    !context.avoidToday?.flags.some((flag) => anyAreaMatches([flag.area], candidate))
  );
}

/**
 * How good a genuine fit this candidate is (ADR-0134), continuous rather than
 * pass/fail — feeds the picker's "Best Replacements" ranking. Callers must
 * already have applied `replacementAllowed`; this never re-checks the hard
 * floor and assumes every candidate passed it. Purely about closeness of fit
 * — same movement slot, how much it overlaps the muscles being replaced, how
 * close its difficulty sits to the athlete's experience, and whether its
 * prerequisites are already trained. Deliberately independent of how often
 * the athlete has logged it — usage is a separate, explicit sort the picker
 * offers ("Your Most/Least Logged"), not folded into "best."
 */
export function replacementFitScore(
  original: ReplacementCandidate,
  candidate: ReplacementCandidate,
  context: LiveAdjustmentContext,
): number {
  let score = 0;
  if (candidate.movementSlot === original.movementSlot) score += 3;
  const originalAreas = new Set([...original.primaryAreas, ...(original.secondaryAreas ?? [])]);
  const candidateAreas = [...candidate.primaryAreas, ...(candidate.secondaryAreas ?? [])];
  score += candidateAreas.filter((area) => originalAreas.has(area)).length;
  if (context.experience) {
    const gap = Math.abs(DIFFICULTY_RANK[candidate.difficulty] - DIFFICULTY_RANK[context.experience]);
    score += Math.max(0, 2 - gap);
  }
  const prerequisitesMet = candidate.prerequisites.every((id) =>
    context.history?.some((record) =>
      record.performed.some((exercise) => exercise.exerciseId === id && exercise.sets.some((set) => set.completed && !set.skipped)),
    ),
  );
  if (prerequisitesMet) score += 1;
  return score;
}

/** How many past sessions the athlete completed at least one set of this
 * exercise in — feeds the picker's "Your Most/Least/Never Logged" sorts and
 * the log-count badge shown next to each candidate. */
export function replacementLogCount(exerciseId: string, history: LiveAdjustmentContext['history']): number {
  return (history ?? []).filter((record) =>
    record.performed.some((exercise) => exercise.exerciseId === exerciseId && exercise.sets.some((set) => set.completed)),
  ).length;
}
