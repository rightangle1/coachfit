/**
 * Guided flow sequencer (docs/methodology/guided-flow-sequencer.md). Reads an
 * already-generated plan's ordering — `SessionBlock` exercises for a
 * stage-ordered flow (yoga/stretch/barre), `rotationGroup` membership for a
 * circuit — and flattens it into one linear step list a touchless player can
 * walk through. Pure functions only; never touches `generateSession()`'s
 * output shape.
 */

import { EXERCISES } from '@/domain/catalog';
import type { MovementPattern, PerformedExercise, PlannedExercise, SessionBlock, WorkoutType } from '@/domain/types';

/** Which block a step came from, and where in plan order — lets a flow
 * spanning several blocks (e.g. Warmup → Main → Cool down) still tell
 * sections apart in the UI (ADR-0408) while playing as one continuous list. */
export interface GuidedFlowSection {
  label: string;
  index: number;
}

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
  /** The block this step came from (its `label`, e.g. "Warmup"/"Main"). */
  section: string;
  /** That block's position within the flow's own block run — distinguishes
   * two blocks that happen to share a label and lets the UI insert a break
   * exactly where the section changes. */
  sectionIndex: number;
}

function patternFor(exerciseId: string): MovementPattern {
  return EXERCISES.find((exercise) => exercise.id === exerciseId)?.movementPattern ?? 'stretch';
}

/**
 * Yoga/Stretch/Barre (ADR-0114, ADR-0404) AND a multi-exercise cardio Main
 * block (ADR-0406) — an aerobics circuit (ADR-0138, every station sharing
 * `rotationGroup: 'aerobics-circuit'`) or base cardio's several distinct
 * picks (`cardioFocusCount`, no `rotationGroup` at all). Both cardio shapes
 * still land as one `SessionBlock` whose exercises all carry the same
 * `sets.length` (Main is exactly the circuit/pick, nothing else is mixed
 * into that block) — the identical shape `buildStageFlow`/`buildStretchFlow`
 * already produce for a flow's stage order. This function doesn't care *why*
 * the exercises share a block, only that they do, so both stages reuse it
 * unchanged rather than adding a second, rotation-group-aware flattener.
 * Flattening goes rounds outward, exercise-order inward: round 0's full
 * sequence, then round 1's, etc. A single-exercise cardio bout
 * (benchmark/intervals/base-with-one-pick) has nothing to page between and
 * uses `flattenSingleExerciseCardio` instead.
 */
export function flattenStageFlow(block: SessionBlock, section: GuidedFlowSection = { label: block.label, index: 0 }): GuidedFlowStep[] {
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
        section: section.label,
        sectionIndex: section.index,
      });
    }
  }
  return steps;
}

/**
 * Whether a cardio exercise's sets alternate work/recovery phases (interval
 * cardio) rather than one flat set per round (steady/benchmark cardio).
 * Shared by the guided-flow flattener and the manual tracker (ADR-0409's
 * investigation found the tracker had drifted from this) so "what counts as
 * an interval" has one definition instead of being reimplemented per screen.
 */
export function hasIntervalPhases(sets: { phase?: 'work' | 'recovery' }[]): boolean {
  return sets.some((set) => set.phase === 'recovery');
}

/**
 * How many *work* rounds a cardio exercise's sets represent — a work+recovery
 * pair is one round, matching how "ROUND X OF Y" should read. Falls back to
 * the plain set count when there's no recovery phase to exclude.
 */
export function cardioRoundCount(sets: { phase?: 'work' | 'recovery' }[]): number {
  return hasIntervalPhases(sets) ? sets.filter((set) => set.phase !== 'recovery').length : sets.length;
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
export function flattenSingleExerciseCardio(exercise: PlannedExercise, section: GuidedFlowSection = { label: exercise.name, index: 0 }): GuidedFlowStep[] {
  const hasIntervals = hasIntervalPhases(exercise.sets);
  const roundCount = cardioRoundCount(exercise.sets);
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
      section: section.label,
      sectionIndex: section.index,
    };
  });
}

/**
 * Whether a block plays inside a touchless guided flow at all — mobility
 * blocks always do; a cardio block only when the whole plan is a cardio
 * workout, so a Conditioning finisher tacked onto e.g. a lifting day (also
 * `modality: 'cardio'`, but not what the athlete came here to do hands-free)
 * stays a manual block. The single source of truth for this gate — both
 * `workout.tsx` (deciding whether to enter `/workout-flow` at all) and
 * `workout-flow.tsx` (deciding how far the flow can chain forward) read it,
 * so they can't drift out of sync the way they did before ADR-0408.
 */
export function isGuidedFlowBlock(block: SessionBlock, workoutType?: WorkoutType): boolean {
  return block.modality === 'mobility' || (block.modality === 'cardio' && workoutType === 'cardio');
}

/**
 * Flattens every block in a contiguous guided-flow-eligible run (ADR-0408)
 * into one step list spanning all of them, e.g. Warmup → Main → Cool down —
 * so the touchless player plays straight through instead of stopping and
 * kicking back to the overview at the end of each individual block. Each
 * block still picks its own flattener the same way `workout-flow.tsx` used
 * to choose inline: a stage-ordered sequence for mobility or a multi-exercise
 * cardio Main, the phase-based one for a single cardio exercise.
 */
export function flattenGuidedFlow(blocks: SessionBlock[]): GuidedFlowStep[] {
  return blocks.flatMap((block, index) => {
    const section: GuidedFlowSection = { label: block.label, index };
    return block.modality === 'mobility' || block.exercises.length > 1
      ? flattenStageFlow(block, section)
      : flattenSingleExerciseCardio(block.exercises[0], section);
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
