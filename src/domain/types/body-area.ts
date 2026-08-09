/**
 * Body-area taxonomy — the shared vocabulary the whole rules engine speaks.
 *
 * ⚠️ PROVISIONAL (ADR-0004 is still "Proposed"). This is a v0 so the rest of the
 * app can compile and be built against a stable shape. The exact granularity
 * (region vs. group vs. individual muscle) must be ratified in ADR-0004 before
 * Phase 1 fatigue/targeting logic hardens around it.
 *
 * Used by: targeting (emphasize/avoid), avoidance flags, per-area fatigue,
 * exercise tagging, and strength trends.
 */

/** Coarse regions — always safe to reason about at this level. */
export type BodyRegion =
  | 'upper_body'
  | 'lower_body'
  | 'core'
  | 'full_body';

/**
 * Muscle groups — the primary granularity the engine targets and recovers.
 * (v0 list — extend/split in ADR-0004.)
 */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'neck';

/**
 * A referenced body area at any granularity, plus optional laterality so a user
 * can flag e.g. "left knee". Joints/areas that aren't muscles are captured as
 * free-form `region`-adjacent labels via `joint`.
 */
export interface BodyArea {
  group?: MuscleGroup;
  region?: BodyRegion;
  /** Non-muscle areas users commonly flag (knee, shoulder joint, wrist, etc.). */
  joint?: string;
  side?: 'left' | 'right' | 'bilateral';
}

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques',
  'lower_back', 'neck',
];

/** Rough region mapping for coarse reasoning; refine in ADR-0004. */
export const GROUP_TO_REGION: Record<MuscleGroup, BodyRegion> = {
  chest: 'upper_body',
  back: 'upper_body',
  shoulders: 'upper_body',
  biceps: 'upper_body',
  triceps: 'upper_body',
  forearms: 'upper_body',
  quads: 'lower_body',
  hamstrings: 'lower_body',
  glutes: 'lower_body',
  calves: 'lower_body',
  abs: 'core',
  obliques: 'core',
  lower_back: 'core',
  neck: 'upper_body',
};
