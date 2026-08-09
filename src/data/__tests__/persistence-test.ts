import { initStorage, saveAthlete, getAthlete, saveSessionRecord, getSessionRecord, deleteSessionRecord } from '@/data/persistence';

// Guards the ADR-0007 platform port: under Jest, `@/data/persistence` must
// resolve to this web/Node (localStorage/in-memory) implementation, not
// `persistence.native.ts` — which calls expo-sqlite's `openDatabaseSync` at
// module load and crashes immediately outside a real native runtime.
describe('persistence (web/Node port)', () => {
  it('initializes and round-trips a row without touching native SQLite', () => {
    expect(() => initStorage()).not.toThrow();

    const row = { id: 'athlete-1', profileJson: '{}', createdAt: 1, updatedAt: 1 };
    saveAthlete(row);

    expect(getAthlete('athlete-1')).toEqual(row);
  });

  it('deletes a session record row', () => {
    const row = { id: 'sess-1', planId: 'plan-1', plannedFor: 1, recordJson: '{}', updatedAt: 1 };
    saveSessionRecord(row);
    expect(getSessionRecord('sess-1')).toEqual(row);

    deleteSessionRecord('sess-1');

    expect(getSessionRecord('sess-1')).toBeUndefined();
  });
});
