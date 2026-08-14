/**
 * Guided flow sequencer (docs/methodology/guided-flow-sequencer.md). Reads an
 * already-generated plan's ordering — `SessionBlock` exercises for a
 * stage-ordered flow (yoga/stretch/barre), `rotationGroup` membership for a
 * circuit — and flattens it into one linear step list a touchless player can
 * walk through. Pure functions only; never touches `generateSession()`'s
 * output shape.
 */

import { EXERCISES } from '@/domain/catalog';
import type { MovementPattern, PerformedExercise, PlannedExercise, SessionBlock } from '@/domain/types';

export interface GuidedFlowStep {
  exerciseId: string;
  /** Index into that exercise's `sets[]` / `performed.sets[]` — what the
   * player writes updateSet/toggleComplete/skipSet against. */
  setIndex: number;
  /** Exercise name for a stage-ordered step; 'Work'/'Recovery' for an
   * interval-cardio step (added in Stage 2), since the exercise doesn't
   * change there, only the phase. */
  label: string;
  durationSec: number;
  pattern: MovementPattern;
  phase?: 'work' | 'recovery';
  round: number;
  roundCount: number;
}

function patternFor(exerciseId: string): MovementPattern {
  return EXERCISES.find((exercise) => exercise.id === exerciseId)?.movementPattern ?? 'stretch';
}

/**
 * Yoga/Stretch/Barre (ADR-0114, ADR-0404) AND a multi-exercise cardio Main
 * block (ADR-0406) — an aerobics circuit (ADR-0138, every station sharing
 * `rotationGroup: 'aerobics-circuit'`) or base-intent cardio picking several
 * distinct exercises (`cardioFocusCount`, no `rotationGroup` at all). Both
 * cardio shapes still land as one `SessionBlock` whose exercises all carry
 * the same `sets.length` (Main is exactly the circuit/pick, nothing else is
 * mixed into that block) — the identical shape `buildStageFlow`/
 * `buildStretchFlow` already produce for a flow's stage order. This function
 * doesn't care *why* the exercises share a block, only that they do, so both
 * stages reuse it unchanged rather than adding a second, rotation-group-aware
 * flattener. Flattening goes rounds outward, exercise-order inward: round 0's
 * full sequence, then round 1's, etc. A single-exercise cardio bout
 * (benchmark/intervals/base-with-one-pick) has nothing to page between and
 * uses `flattenSingleExerciseCardio` instead.
 */
export function flattenStageFlow(block: SessionBlock): GuidedFlowStep[] {
  const roundCount = block.exercises[0]?.sets.length ?? 0;
  const steps: GuidedFlowStep[] = [];
  for (let round = 0; round < roundCount; round += 1) {
    for (const exercise of block.exercises) {
      const set = exercise.sets[round];
      if (!set) continue;
      steps.push({
        exerciseId: exercise.exerciseId,
        setIndex: round,
        label: exercise.name,
        durationSec: set.durationSec ?? 0,
        pattern: patternFor(exercise.exerciseId),
        round,
        roundCount,
      });
    }
  }
  return steps;
}

/**
 * Steady/interval cardio (ADR-0406): benchmark, intervals, or base cardio
 * when only one exercise was picked — the one case where Main isn't a
 * multi-exercise sequence, so there's nothing for `flattenStageFlow` to page
 * between. `cardioSets()` already produces every phase as this one
 * exercise's `sets[]` — alternating work/recovery pairs for intervals, a
 * single work set for benchmark/base. One step per set; `round` counts work
 * phases only (a work+recovery pair is one round), matching how the phase
 * timer's "ROUND X OF Y" should read. When there's no recovery phase at all
 * (benchmark/base), `round`/`roundCount` just track the plain set index and
 * `label` falls back to the exercise's name instead of 'Work' — there's no
 * phase to announce.
 */
export function flattenSingleExerciseCardio(exercise: PlannedExercise): GuidedFlowStep[] {
  const hasIntervals = exercise.sets.some((set) => set.phase === 'recovery');
  const roundCount = hasIntervals
    ? exercise.sets.filter((set) => set.phase !== 'recovery').length
    : exercise.sets.length;
  let round = -1;
  return exercise.sets.map((set, setIndex) => {
    if (!hasIntervals || set.phase !== 'recovery') round += 1;
    return {
      exerciseId: exercise.exerciseId,
      setIndex,
      label: hasIntervals ? (set.phase === 'recovery' ? 'Recovery' : 'Work') : exercise.name,
      durationSec: set.durationSec ?? 0,
      pattern: patternFor(exercise.exerciseId),
      phase: hasIntervals ? (set.phase === 'recovery' ? 'recovery' : 'work') : undefined,
      round: Math.max(0, round),
      roundCount,
    };
  });
}

/**
 * Which flattened step to resume on — generalizes `openExercise()`'s
 * rotation-group resume logic (workout.tsx) from "first not-completed round"
 * to "first not-completed-and-not-skipped flattened step". Falls back to 0
 * (the very start) once everything is done, matching that same precedent.
 */
export function resumeIndexFor(steps: GuidedFlowStep[], performed: PerformedExercise[]): number {
  const index = steps.findIndex((step) => {
    const actual = performed.find((exercise) => exercise.exerciseId === step.exerciseId)?.sets[step.setIndex];
    return actual != null && !actual.completed && !actual.skipped;
  });
  return index === -1 ? 0 : index;
}
