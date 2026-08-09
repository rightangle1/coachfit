import { deriveLiveFocus } from '@/app-lib/live-activity-focus';
import type { PerformedExercise, PerformedSet, PlannedExercise, SessionPlan, SessionRecord } from '@/domain/types';

function plannedSet(reps?: number, weightKg?: number): PlannedExercise['sets'][number] {
  return { reps, weightKg };
}

function planned(exerciseId: string, name: string): PlannedExercise {
  return {
    exerciseId,
    name,
    primaryAreas: [{ group: 'back' }],
    sets: [plannedSet(10, 50), plannedSet(10, 50), plannedSet(8, 55)],
  };
}

function performedSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { reps: 10, weightKg: 50, completed: false, ...overrides };
}

function performed(exerciseId: string, name: string, sets: PerformedSet[]): PerformedExercise {
  return { exerciseId, name, primaryAreas: [{ group: 'back' }], sets };
}

const plan: SessionPlan = {
  id: 'plan-1',
  plannedFor: Date.now(),
  rationale: '',
  blocks: [
    {
      modality: 'strength',
      label: 'Main',
      exercises: [planned('squat', 'Back squat'), planned('bench', 'Bench press'), planned('row', 'Barbell row')],
    },
  ],
};

function record(performedExercises: PerformedExercise[]): SessionRecord {
  return {
    id: 'rec-1',
    planId: 'plan-1',
    plannedFor: plan.plannedFor,
    startedAt: Date.now(),
    performed: performedExercises,
  };
}

describe('deriveLiveFocus', () => {
  it('returns null with no plan or record', () => {
    expect(deriveLiveFocus(null, null)).toBeNull();
    expect(deriveLiveFocus(plan, null)).toBeNull();
  });

  it('focuses the first incomplete set of the first exercise with one', () => {
    const r = record([
      performed('squat', 'Back squat', [performedSet({ completed: true }), performedSet(), performedSet()]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    const focus = deriveLiveFocus(plan, r);
    expect(focus).not.toBeNull();
    expect(focus?.exerciseId).toBe('squat');
    expect(focus?.setIndex).toBe(2); // 1-based, second set
    expect(focus?.totalSets).toBe(3);
    expect(focus?.targetReps).toBe(10);
    expect(focus?.targetWeightKg).toBe(50);
  });

  it('moves to the next exercise once the current one is fully logged', () => {
    const r = record([
      performed('squat', 'Back squat', [
        performedSet({ completed: true }),
        performedSet({ completed: true }),
        performedSet({ completed: true }),
      ]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    expect(deriveLiveFocus(plan, r)?.exerciseId).toBe('bench');
  });

  it('treats a skipped set like an incomplete one is not — skip does not count as remaining', () => {
    const r = record([
      performed('squat', 'Back squat', [
        performedSet({ skipped: true }),
        performedSet({ skipped: true }),
        performedSet({ skipped: true }),
      ]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    expect(deriveLiveFocus(plan, r)?.exerciseId).toBe('bench');
  });

  it('returns null once every set is completed or skipped', () => {
    const done = (id: string, name: string) =>
      performed(id, name, [performedSet({ completed: true }), performedSet({ skipped: true }), performedSet({ completed: true })]);
    const r = record([done('squat', 'Back squat'), done('bench', 'Bench press'), done('row', 'Barbell row')]);
    expect(deriveLiveFocus(plan, r)).toBeNull();
  });

  it('computes session-wide setsCompleted/setsRemaining, not just the focused exercise', () => {
    const r = record([
      performed('squat', 'Back squat', [
        performedSet({ completed: true }),
        performedSet({ completed: true }),
        performedSet(),
      ]),
      performed('bench', 'Bench press', [performedSet({ skipped: true }), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    const focus = deriveLiveFocus(plan, r);
    expect(focus?.setsCompleted).toBe(2);
    expect(focus?.setsRemaining).toBe(6); // 9 sets - 2 completed - 1 skipped
  });

  it('reports prevExerciseId/nextExerciseId from the flattened plan order, undefined at the boundaries', () => {
    const r = record([
      performed('squat', 'Back squat', [performedSet(), performedSet(), performedSet()]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    const first = deriveLiveFocus(plan, r);
    expect(first?.exerciseId).toBe('squat');
    expect(first?.prevExerciseId).toBeUndefined();
    expect(first?.nextExerciseId).toBe('bench');

    const last = deriveLiveFocus(plan, r, 'row');
    expect(last?.prevExerciseId).toBe('bench');
    expect(last?.nextExerciseId).toBeUndefined();
  });

  it('honors a manual focus override even when an earlier exercise still has incomplete sets', () => {
    const r = record([
      performed('squat', 'Back squat', [performedSet(), performedSet(), performedSet()]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    expect(deriveLiveFocus(plan, r, 'row')?.exerciseId).toBe('row');
  });

  it('falls back to the last set when a manually-focused exercise has nothing left to do', () => {
    const r = record([
      performed('squat', 'Back squat', [
        performedSet({ completed: true }),
        performedSet({ completed: true }),
        performedSet({ completed: true }),
      ]),
      performed('bench', 'Bench press', [performedSet(), performedSet(), performedSet()]),
      performed('row', 'Barbell row', [performedSet(), performedSet(), performedSet()]),
    ]);
    const focus = deriveLiveFocus(plan, r, 'squat');
    expect(focus?.exerciseId).toBe('squat');
    expect(focus?.setIndex).toBe(3);
    expect(focus?.totalSets).toBe(3);
  });
});
