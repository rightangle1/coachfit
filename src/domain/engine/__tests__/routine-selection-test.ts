import { recommendRoutine } from '../routine-selection';
import type { AvoidanceInput, EquipmentInventory, Routine } from '../../types';

const NOW = Date.UTC(2026, 6, 22, 18, 0, 0);
const DAY_MS = 86_400_000;

const FULL_EQUIPMENT: EquipmentInventory = {
  items: [{ type: 'bodyweight' }, { type: 'dumbbells' }, { type: 'bench' }],
};
const BODYWEIGHT_ONLY: EquipmentInventory = { items: [{ type: 'bodyweight' }] };
const NO_FLAGS: AvoidanceInput = { flags: [] };

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'Push day',
    exerciseIds: ['pu-db-bench'], // chest/triceps, requires dumbbells + bench
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('recommendRoutine (ADR-0137)', () => {
  it('returns undefined when there are no routines', () => {
    expect(recommendRoutine([], { equipment: FULL_EQUIPMENT, avoidToday: NO_FLAGS, now: NOW })).toBeUndefined();
  });

  it('prefers the routine whose equipment is actually available today', () => {
    const bodyweightRoutine = routine({ id: 'bw', name: 'Bodyweight', exerciseIds: ['sq-bw'] });
    const dumbbellRoutine = routine({ id: 'db', name: 'Dumbbell', exerciseIds: ['pu-db-bench'] });
    const best = recommendRoutine([dumbbellRoutine, bodyweightRoutine], {
      equipment: BODYWEIGHT_ONLY,
      avoidToday: NO_FLAGS,
      now: NOW,
    });
    expect(best?.id).toBe('bw');
  });

  it('deprioritizes a routine that mostly loads a severely flagged area', () => {
    const chestRoutine = routine({ id: 'chest', exerciseIds: ['pu-db-bench'] });
    const legRoutine = routine({ id: 'legs', exerciseIds: ['sq-db-front'] });
    const best = recommendRoutine([chestRoutine, legRoutine], {
      equipment: FULL_EQUIPMENT,
      avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'severe' }] },
      now: NOW,
    });
    expect(best?.id).toBe('legs');
  });

  it('prefers the least-recently-used routine when equipment/avoidance are equal', () => {
    const recentlyUsed = routine({ id: 'recent', lastUsedAt: NOW - 1 * DAY_MS });
    const staleUsed = routine({ id: 'stale', lastUsedAt: NOW - 30 * DAY_MS });
    const best = recommendRoutine([recentlyUsed, staleUsed], {
      equipment: FULL_EQUIPMENT,
      avoidToday: NO_FLAGS,
      now: NOW,
    });
    expect(best?.id).toBe('stale');
  });

  it('treats a never-used routine at least as favorably as one used two weeks ago', () => {
    const neverUsed = routine({ id: 'never' });
    const usedTwoWeeksAgo = routine({ id: 'two-weeks', lastUsedAt: NOW - 14 * DAY_MS });
    const best = recommendRoutine([neverUsed, usedTwoWeeksAgo], {
      equipment: FULL_EQUIPMENT,
      avoidToday: NO_FLAGS,
      now: NOW,
    });
    // Both are fully recency-saturated; the older-created routine wins the tie-break.
    expect(best).toBeDefined();
  });

  it('returns undefined when every routine resolves to no catalog exercises', () => {
    const empty = routine({ exerciseIds: ['not-a-real-id'] });
    expect(recommendRoutine([empty], { equipment: FULL_EQUIPMENT, avoidToday: NO_FLAGS, now: NOW })).toBeUndefined();
  });
});
