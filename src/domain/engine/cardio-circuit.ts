/**
 * Aerobics circuit grouping (ADR-0138). Unlike `supersets.ts`'s pairing —
 * which classifies *why* two exercises belong together (antagonist,
 * pre/post-exhaust) — an aerobics circuit has no such relationship to
 * discover: every station in the Main block rotates together by
 * construction. This just assigns the shared `rotationGroup`/`group` fields
 * so the tracker's existing round-based flatten (built for supersets) renders
 * the circuit for free, with no new UI.
 *
 * Pure, deterministic, offline (ADR-0003).
 */

import type { PlannedExercise, SupersetGroup } from '../types';

/**
 * Groups every exercise in an aerobics Main block into one round-based
 * circuit. No-op below two exercises — a "circuit" of one station is just a
 * regular exercise, and single-member groups would only add UI plumbing that
 * has nothing to rotate through.
 *
 * Each station's round count is computed independently in `cardioSets()`
 * (its own progression state can nudge it up or down a round), so members
 * can arrive with slightly different set counts. Trim every member to the
 * shortest one — mirrors `supersets.ts`'s `equalizeSetCounts`: never extend
 * a shorter member up to match, since a shorter count may itself be a
 * safety de-load, and trimming never increases volume.
 */
export function applyAerobicsCircuit(exercises: PlannedExercise[]): void {
  if (exercises.length < 2) return;

  const target = Math.min(...exercises.map((exercise) => exercise.sets.length));
  for (const exercise of exercises) {
    if (exercise.sets.length > target) exercise.sets = exercise.sets.slice(0, target);
  }

  const id = 'aerobics-circuit';
  const group: SupersetGroup = {
    id,
    type: 'circuit',
    rationale: 'Aerobics circuit — rotate through each move, then repeat for the next round.',
  };
  for (const exercise of exercises) {
    exercise.rotationGroup = id;
    exercise.group = group;
  }
}
