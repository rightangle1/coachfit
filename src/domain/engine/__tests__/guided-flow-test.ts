import { flattenSingleExerciseCardio, flattenStageFlow, resumeIndexFor } from '../guided-flow';
import type { PerformedExercise, PlannedExercise, PlannedSet, SessionBlock } from '../../types';

function stagePose(exerciseId: string, name: string, rounds: number, durationSec = 45): PlannedExercise {
  return {
    exerciseId,
    name,
    primaryAreas: [],
    sets: Array.from({ length: rounds }, () => ({ durationSec })),
  };
}

function stageBlock(exercises: PlannedExercise[]): SessionBlock {
  return { modality: 'mobility', label: 'Yoga flow', exercises };
}

describe('flattenStageFlow', () => {
  it('goes rounds outward, stage order inward — not one exercise fully played before the next', () => {
    const block = stageBlock([stagePose('center-1', 'Child\'s pose', 2), stagePose('standing-1', 'Warrior 2', 2)]);
    const steps = flattenStageFlow(block);
    expect(steps.map((s) => s.exerciseId)).toEqual(['center-1', 'standing-1', 'center-1', 'standing-1']);
  });

  it('step count is stages × rounds, with correct round/roundCount and setIndex', () => {
    const block = stageBlock([stagePose('a', 'A', 3), stagePose('b', 'B', 3), stagePose('c', 'C', 3)]);
    const steps = flattenStageFlow(block);
    expect(steps).toHaveLength(9);
    expect(steps.every((s) => s.roundCount === 3)).toBe(true);
    expect(steps.map((s) => s.round)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(steps.map((s) => s.setIndex)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('carries the planned hold duration and resolves a MovementPattern from the catalog', () => {
    // 'center-1' isn't a real catalog id, so pattern falls back to 'stretch' —
    // exercised here just to confirm the field is always populated.
    const block = stageBlock([stagePose('center-1', 'Child\'s pose', 1, 50)]);
    const [step] = flattenStageFlow(block);
    expect(step.durationSec).toBe(50);
    expect(step.pattern).toBe('stretch');
  });

  it('is empty for a block with no exercises', () => {
    expect(flattenStageFlow(stageBlock([]))).toEqual([]);
  });

  it('is modality-agnostic — also flattens an aerobics/base-multi cardio Main block round-robin (ADR-0406)', () => {
    // Same shape a dedicated Cardio Main block comes out of generateSession()
    // as, whether an aerobics circuit (rotationGroup-linked) or base cardio's
    // several distinct picks (no rotationGroup at all) — flattenStageFlow
    // doesn't inspect modality or rotationGroup, only block.exercises order
    // and equal sets.length, so it flattens both the same way as a flow.
    const block: SessionBlock = {
      modality: 'cardio',
      label: 'Main',
      exercises: [stagePose('cd-run', 'Run', 2, 45), stagePose('cd-row', 'Row', 2, 45), stagePose('cd-bike', 'Bike', 2, 45)],
    };
    const steps = flattenStageFlow(block);
    expect(steps.map((s) => s.exerciseId)).toEqual(['cd-run', 'cd-row', 'cd-bike', 'cd-run', 'cd-row', 'cd-bike']);
  });
});

function cardioExercise(exerciseId: string, name: string, sets: PlannedSet[]): PlannedExercise {
  return { exerciseId, name, primaryAreas: [], sets };
}

describe('flattenSingleExerciseCardio', () => {
  it('labels alternating work/recovery sets by phase, with round counting work phases only', () => {
    const exercise = cardioExercise('cd-run-intervals', 'Interval run', [
      { durationSec: 30, phase: 'work' },
      { durationSec: 60, phase: 'recovery' },
      { durationSec: 30, phase: 'work' },
      { durationSec: 60, phase: 'recovery' },
    ]);
    const steps = flattenSingleExerciseCardio(exercise);
    expect(steps.map((s) => s.label)).toEqual(['Work', 'Recovery', 'Work', 'Recovery']);
    expect(steps.map((s) => s.phase)).toEqual(['work', 'recovery', 'work', 'recovery']);
    expect(steps.map((s) => s.round)).toEqual([0, 0, 1, 1]);
    expect(steps.every((s) => s.roundCount === 2)).toBe(true);
    expect(steps.map((s) => s.setIndex)).toEqual([0, 1, 2, 3]);
  });

  it('falls back to the exercise name and a plain set index when there is no recovery phase (benchmark/base)', () => {
    const exercise = cardioExercise('cd-row-benchmark', 'Rowing benchmark', [{ durationSec: 600, phase: 'work' }]);
    const [step] = flattenSingleExerciseCardio(exercise);
    expect(step.label).toBe('Rowing benchmark');
    expect(step.phase).toBeUndefined();
    expect(step.round).toBe(0);
    expect(step.roundCount).toBe(1);
  });

  it('resolves a MovementPattern from the catalog same as flattenStageFlow', () => {
    const exercise = cardioExercise('cd-bike-base', 'Stationary bike', [{ durationSec: 900, phase: 'work' }]);
    const [step] = flattenSingleExerciseCardio(exercise);
    // Not a real catalog id, so pattern falls back to 'stretch' — exercised
    // here just to confirm the field is always populated, same as the
    // flattenStageFlow test above.
    expect(step.pattern).toBe('stretch');
  });
});

function performed(exerciseId: string, sets: PerformedExercise['sets']): PerformedExercise {
  return { exerciseId, name: exerciseId, primaryAreas: [], sets };
}

describe('resumeIndexFor', () => {
  it('resumes at the first not-completed-and-not-skipped flattened step', () => {
    const block = stageBlock([stagePose('a', 'A', 2), stagePose('b', 'B', 2)]);
    const steps = flattenStageFlow(block);
    const performedList = [
      performed('a', [{ completed: true }, { completed: false }]),
      performed('b', [{ completed: true }, { completed: false }]),
    ];
    // Round 0 (a,b) fully done — round 1's 'a' (index 2) is the first unfinished step.
    expect(resumeIndexFor(steps, performedList)).toBe(2);
  });

  it('skips a step marked skipped, same as one marked completed', () => {
    const block = stageBlock([stagePose('a', 'A', 2)]);
    const steps = flattenStageFlow(block);
    const performedList = [performed('a', [{ completed: false, skipped: true }, { completed: false }])];
    expect(resumeIndexFor(steps, performedList)).toBe(1);
  });

  it('falls back to 0 once every step is done', () => {
    const block = stageBlock([stagePose('a', 'A', 1)]);
    const steps = flattenStageFlow(block);
    const performedList = [performed('a', [{ completed: true }])];
    expect(resumeIndexFor(steps, performedList)).toBe(0);
  });
});
