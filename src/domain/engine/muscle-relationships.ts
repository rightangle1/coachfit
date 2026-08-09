/**
 * Agonist/antagonist muscle relationships (ADR-0121). Pure data + helpers used
 * to build *antagonist supersets* — pairing opposing muscles so one recovers
 * while the other works (methodology §5). Provisional alongside the body-area
 * taxonomy (ADR-0004); refine as the taxonomy hardens.
 */

import type { Exercise, MuscleGroup } from '../types';
import { mechanicOf } from './timing';

/** Opposing muscle groups. Symmetric — both directions listed for direct lookup. */
export const ANTAGONISTS: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  chest: ['back'],
  back: ['chest'],
  biceps: ['triceps'],
  triceps: ['biceps'],
  quads: ['hamstrings'],
  hamstrings: ['quads', 'glutes'],
  glutes: ['quads'],
  abs: ['lower_back'],
  lower_back: ['abs'],
};

/** Movement patterns that oppose each other (a coarser fallback than muscles). */
const PATTERN_ANTAGONISTS: Partial<Record<string, string[]>> = {
  push: ['pull'],
  pull: ['push'],
  squat: ['hinge'],
  hinge: ['squat'],
};

function muscleAntagonists(a: Exercise, b: Exercise): boolean {
  return a.primaryAreas.some((ga) => (ANTAGONISTS[ga] ?? []).some((opp) => b.primaryAreas.includes(opp)));
}

// Pattern opposition (push/pull, squat/hinge) is a coarse fallback that only
// makes sense between two COMPOUND movements — an arm-only curl is 'pull' but
// isn't the antagonist of a bench press. Muscle-level pairs (biceps↔triceps)
// handle isolation work.
function patternAntagonists(a: Exercise, b: Exercise): boolean {
  if (mechanicOf(a) !== 'compound' || mechanicOf(b) !== 'compound') return false;
  return (PATTERN_ANTAGONISTS[a.movementPattern] ?? []).includes(b.movementPattern);
}

/**
 * True when two exercises train opposing muscles (or opposing movement patterns)
 * and share no primary muscle — the definition of an antagonist pairing.
 */
export function areAntagonists(a: Exercise, b: Exercise): boolean {
  if (a.primaryAreas.some((g) => b.primaryAreas.includes(g))) return false;
  return muscleAntagonists(a, b) || patternAntagonists(a, b);
}

/** A muscle group both exercises train (used to name a pre/post-exhaust pairing). */
export function sharedPrimaryMuscle(a: Exercise, b: Exercise): MuscleGroup | undefined {
  return a.primaryAreas.find((g) => b.primaryAreas.includes(g));
}
