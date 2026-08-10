import type { PlannedExercise, SessionPlan, SessionRecord } from '@/domain/types';

// `services/sessions` resolves `../data/persistence` via a relative import,
// which jest-expo's platform resolution sends to the native SQLite impl
// (crashes outside a device). Mirrors the mocking pattern already used by
// `services/__tests__/health-writeback-test.ts` for the same reason.
const mockRecords = new Map<string, SessionRecord>();

jest.mock('@/services/sessions', () => ({
  savePlan: jest.fn(),
  saveSessionRecord: jest.fn((record: SessionRecord) => mockRecords.set(record.id, record)),
  startSessionRecord: jest.fn((plan: SessionPlan) => {
    const record: SessionRecord = {
      id: `sess-${plan.id}`,
      planId: plan.id,
      plannedFor: plan.plannedFor,
      startedAt: Date.now(),
      performed: plan.blocks.flatMap((b) =>
        b.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          name: ex.name,
          primaryAreas: ex.primaryAreas,
          sets: ex.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, completed: false })),
        })),
      ),
    };
    mockRecords.set(record.id, record);
    return record;
  }),
  listHistory: jest.fn(() => [...mockRecords.values()].filter((r) => r.completedAt != null)),
  deleteSessionRecord: jest.fn((id: string) => mockRecords.delete(id)),
}));

// `services/health-writeback` transitively imports `services/athlete`, which
// hits the same native-SQLite resolution issue — stub it out like
// `health-writeback-test.ts` stubs its own dependencies.
jest.mock('@/services/health-writeback', () => ({ writeWorkoutToHealth: jest.fn() }));

import { useWorkoutStore } from '@/state/workout-store';
import { deleteSessionRecord, saveSessionRecord } from '@/services/sessions';

function plannedSet(reps?: number, weightKg?: number): PlannedExercise['sets'][number] {
  return { reps, weightKg };
}

function planned(exerciseId: string, name: string): PlannedExercise {
  return {
    exerciseId,
    name,
    primaryAreas: [{ group: 'back' }],
    sets: [plannedSet(10, 50), plannedSet(10, 50)],
  };
}

function plan(): SessionPlan {
  return {
    id: `plan-${Math.random()}`,
    plannedFor: Date.now(),
    rationale: '',
    blocks: [{ modality: 'strength', label: 'Main', exercises: [planned('squat', 'Back squat')] }],
  };
}

beforeEach(() => {
  mockRecords.clear();
  jest.clearAllMocks();
  useWorkoutStore.getState().clear();
});

describe('workout-store endEarly', () => {
  it('discards the session entirely when nothing was logged — as if never started', () => {
    useWorkoutStore.getState().start(plan());
    const sessionId = useWorkoutStore.getState().record?.id;
    expect(sessionId).toBeDefined();
    expect(mockRecords.has(sessionId as string)).toBe(true);

    const result = useWorkoutStore.getState().endEarly();

    expect(result).toBeNull();
    expect(useWorkoutStore.getState().plan).toBeNull();
    expect(useWorkoutStore.getState().record).toBeNull();
    expect(deleteSessionRecord).toHaveBeenCalledWith(sessionId);
    expect(saveSessionRecord).not.toHaveBeenCalledWith(expect.objectContaining({ id: sessionId, completedAt: expect.anything() }));
    expect(mockRecords.has(sessionId as string)).toBe(false);
  });

  it('persists a completedAt/endedEarly record when at least one set was logged', () => {
    useWorkoutStore.getState().start(plan());
    useWorkoutStore.getState().toggleComplete('squat', 0);

    const result = useWorkoutStore.getState().endEarly();

    expect(result).not.toBeNull();
    expect(result?.completedAt).toBeDefined();
    expect(result?.endedEarly).toBe(true);
    expect(deleteSessionRecord).not.toHaveBeenCalled();
  });
});

describe('workout-store timer pause', () => {
  it('persists pause and resume state with accumulated paused time', () => {
    useWorkoutStore.getState().start(plan());
    useWorkoutStore.getState().toggleTimerPause();
    expect(useWorkoutStore.getState().record?.pausedAt).toBeDefined();
    useWorkoutStore.getState().toggleTimerPause();
    expect(useWorkoutStore.getState().record?.pausedAt).toBeUndefined();
    expect(useWorkoutStore.getState().record?.pausedDurationMs).toBeGreaterThanOrEqual(0);
  });
});
