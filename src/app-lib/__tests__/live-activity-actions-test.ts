import { applyLiveActivityAction, type LiveActivityActionStore } from '@/app-lib/live-activity-actions';
import type { LiveWorkoutFocus } from '@/app-lib/live-activity-focus';
import type { PerformedSet, SessionRecord } from '@/domain/types';

function focus(overrides: Partial<LiveWorkoutFocus> = {}): LiveWorkoutFocus {
  return {
    exerciseId: 'bench',
    exerciseName: 'Bench press',
    setIndex: 2,
    totalSets: 3,
    setsCompleted: 3,
    setsRemaining: 5,
    prevExerciseId: 'squat',
    nextExerciseId: 'row',
    ...overrides,
  };
}

function set(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return { reps: 10, weightKg: 50, completed: false, ...overrides };
}

function makeStore(liveFocus: LiveWorkoutFocus | null, record: SessionRecord | null) {
  return {
    liveFocus,
    record,
    toggleComplete: jest.fn(),
    setManualFocus: jest.fn(),
  } satisfies LiveActivityActionStore;
}

describe('applyLiveActivityAction', () => {
  it('does nothing when there is no live focus', () => {
    const store = makeStore(null, null);
    applyLiveActivityAction('log_set', store);
    expect(store.toggleComplete).not.toHaveBeenCalled();
    expect(store.setManualFocus).not.toHaveBeenCalled();
  });

  it('log_set completes the currently focused set (converting to a 0-based index)', () => {
    const store = makeStore(focus({ setIndex: 2 }), null);
    applyLiveActivityAction('log_set', store);
    expect(store.toggleComplete).toHaveBeenCalledWith('bench', 1);
  });

  it('log_all_sets completes every remaining incomplete/unskipped set on the focused exercise only', () => {
    const record: SessionRecord = {
      id: 'r',
      planId: 'p',
      plannedFor: Date.now(),
      performed: [
        {
          exerciseId: 'bench',
          name: 'Bench press',
          primaryAreas: [],
          sets: [set({ completed: true }), set({ skipped: true }), set()],
        },
        { exerciseId: 'row', name: 'Barbell row', primaryAreas: [], sets: [set(), set()] },
      ],
    };
    const store = makeStore(focus(), record);
    applyLiveActivityAction('log_all_sets', store);
    expect(store.toggleComplete).toHaveBeenCalledTimes(1);
    expect(store.toggleComplete).toHaveBeenCalledWith('bench', 2);
  });

  it('prev_exercise moves manual focus to prevExerciseId', () => {
    const store = makeStore(focus(), null);
    applyLiveActivityAction('prev_exercise', store);
    expect(store.setManualFocus).toHaveBeenCalledWith('squat');
  });

  it('next_exercise moves manual focus to nextExerciseId', () => {
    const store = makeStore(focus(), null);
    applyLiveActivityAction('next_exercise', store);
    expect(store.setManualFocus).toHaveBeenCalledWith('row');
  });

  it('prev/next clear manual focus at a plan boundary instead of throwing', () => {
    const store = makeStore(focus({ prevExerciseId: undefined, nextExerciseId: undefined }), null);
    applyLiveActivityAction('prev_exercise', store);
    applyLiveActivityAction('next_exercise', store);
    expect(store.setManualFocus).toHaveBeenNthCalledWith(1, null);
    expect(store.setManualFocus).toHaveBeenNthCalledWith(2, null);
  });

  it('ignores an unrecognized target instead of throwing', () => {
    const store = makeStore(focus(), null);
    expect(() => applyLiveActivityAction('something_else', store)).not.toThrow();
    expect(store.toggleComplete).not.toHaveBeenCalled();
    expect(store.setManualFocus).not.toHaveBeenCalled();
  });
});
