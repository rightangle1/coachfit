import type { SessionPlan, SessionRecord } from '@/domain/types';

/**
 * Each test gets a fresh, isolated module registry (`jest.isolateModules`)
 * so the web/Node persistence port's module-level in-memory store starts
 * empty, mirroring `equipment-profiles-test.ts`'s pattern.
 */
function freshModules() {
  let mods!: {
    persistence: typeof import('@/data/persistence');
    routines: typeof import('@/services/routines');
    sessions: typeof import('@/services/sessions');
  };
  jest.isolateModules(() => {
    const persistence = require('@/data/persistence') as typeof import('@/data/persistence');
    const routines = require('@/services/routines') as typeof import('@/services/routines');
    const sessions = require('@/services/sessions') as typeof import('@/services/sessions');
    persistence.initStorage();
    mods = { persistence, routines, sessions };
  });
  return mods;
}

describe('routines service (ADR-0137)', () => {
  it('bootstraps to an empty list', () => {
    const { routines } = freshModules();
    expect(routines.listRoutines()).toEqual([]);
  });

  it('creates, lists, and gets a routine', () => {
    const { routines } = freshModules();
    const created = routines.createRoutine({ name: '  Push Day  ', exerciseIds: ['pu-db-bench', 'sq-db-front'] });
    expect(created.name).toBe('Push Day');
    expect(routines.listRoutines()).toHaveLength(1);
    expect(routines.getRoutine(created.id)).toEqual(created);
  });

  it('renames a routine and updates its exercise list', () => {
    const { routines } = freshModules();
    const created = routines.createRoutine({ name: 'Legs', exerciseIds: ['sq-db-front'] });

    const renamed = routines.renameRoutine(created.id, 'Leg Day');
    expect(renamed?.name).toBe('Leg Day');

    const updated = routines.updateRoutineExercises(created.id, ['sq-db-front', 'pl-db-row']);
    expect(updated?.exerciseIds).toEqual(['sq-db-front', 'pl-db-row']);

    expect(routines.renameRoutine('missing', 'X')).toBeUndefined();
    expect(routines.updateRoutineExercises('missing', [])).toBeUndefined();
  });

  it('sets and clears recurrence', () => {
    const { routines } = freshModules();
    const created = routines.createRoutine({ name: 'Push', exerciseIds: ['pu-db-bench'] });
    const withRecurrence = routines.updateRoutineRecurrence(created.id, [1, 3, 5]);
    expect(withRecurrence?.recurrenceDaysOfWeek).toEqual([1, 3, 5]);
    const cleared = routines.updateRoutineRecurrence(created.id, undefined);
    expect(cleared?.recurrenceDaysOfWeek).toBeUndefined();
  });

  it('deletes a routine', () => {
    const { routines } = freshModules();
    const created = routines.createRoutine({ name: 'Push', exerciseIds: ['pu-db-bench'] });
    routines.deleteRoutine(created.id);
    expect(routines.getRoutine(created.id)).toBeUndefined();
    expect(routines.listRoutines()).toEqual([]);
  });

  it('bumps lastUsedAt and useCount on markRoutineUsed', () => {
    const { routines } = freshModules();
    const created = routines.createRoutine({ name: 'Push', exerciseIds: ['pu-db-bench'] });
    expect(created.useCount).toBeUndefined();

    const usedOnce = routines.markRoutineUsed(created.id);
    expect(usedOnce?.useCount).toBe(1);
    expect(usedOnce?.lastUsedAt).toBeDefined();

    const usedTwice = routines.markRoutineUsed(created.id);
    expect(usedTwice?.useCount).toBe(2);

    expect(routines.markRoutineUsed('missing')).toBeUndefined();
  });

  it('routineHistory filters completed sessions to the ones run from this routine', () => {
    const { routines, sessions } = freshModules();
    const created = routines.createRoutine({ name: 'Push', exerciseIds: ['pu-db-bench'] });

    const matching: SessionRecord = {
      id: 'sess-match',
      planId: 'plan-match',
      plannedFor: 1,
      completedAt: 1,
      routineId: created.id,
      performed: [],
    };
    const other: SessionRecord = {
      id: 'sess-other',
      planId: 'plan-other',
      plannedFor: 2,
      completedAt: 2,
      routineId: 'some-other-routine',
      performed: [],
    };
    const generated: SessionRecord = {
      id: 'sess-generated',
      planId: 'plan-generated',
      plannedFor: 3,
      completedAt: 3,
      performed: [],
    };
    sessions.saveSessionRecord(matching);
    sessions.saveSessionRecord(other);
    sessions.saveSessionRecord(generated);

    const history = routines.routineHistory(created.id);
    expect(history.map((r) => r.id)).toEqual(['sess-match']);
  });

  it('createRoutineFromSession extracts ordered, distinct exercise ids, dropping Warmup/Cool down', () => {
    const { routines, sessions } = freshModules();
    const plan: SessionPlan = {
      id: 'plan-1',
      plannedFor: 1,
      rationale: 'test',
      blocks: [
        {
          modality: 'mobility',
          label: 'Warmup',
          exercises: [{ exerciseId: 'mob-warmup-stretch', name: 'Warmup stretch', primaryAreas: [], sets: [] }],
        },
        {
          modality: 'strength',
          label: 'Main',
          exercises: [
            { exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [], sets: [] },
            { exerciseId: 'pu-db-bench', name: 'DB bench press', primaryAreas: [], sets: [] },
            // Duplicate id (e.g. a superset repeat) — kept once, in first-seen order.
            { exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [], sets: [] },
          ],
        },
        {
          modality: 'mobility',
          label: 'Cool down',
          exercises: [{ exerciseId: 'mob-cooldown-stretch', name: 'Cool down stretch', primaryAreas: [], sets: [] }],
        },
      ],
    };
    sessions.savePlan(plan);
    const record: SessionRecord = { id: 'sess-1', planId: plan.id, plannedFor: 1, completedAt: 1, performed: [] };

    const routine = routines.createRoutineFromSession(record, 'My Push Day');
    expect(routine?.exerciseIds).toEqual(['sq-db-front', 'pu-db-bench']);
    expect(routine?.createdFromSessionId).toBe('sess-1');
  });

  it('createRoutineFromSession returns undefined when the plan no longer exists', () => {
    const { routines } = freshModules();
    const record: SessionRecord = { id: 'sess-1', planId: 'missing-plan', plannedFor: 1, completedAt: 1, performed: [] };
    expect(routines.createRoutineFromSession(record, 'X')).toBeUndefined();
  });
});
