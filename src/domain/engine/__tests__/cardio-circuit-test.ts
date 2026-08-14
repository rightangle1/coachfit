import { applyAerobicsCircuit } from '../cardio-circuit';
import type { PlannedExercise } from '../../types';

function station(id: string, rounds: number): PlannedExercise {
  return {
    exerciseId: id,
    name: id,
    primaryAreas: [],
    sets: Array.from({ length: rounds }, () => ({ durationSec: 45, targetRpe: 5, phase: 'work' as const })),
  };
}

describe('applyAerobicsCircuit (ADR-0138)', () => {
  it('is a no-op below two stations — nothing to rotate through', () => {
    const exercises = [station('a', 4)];
    applyAerobicsCircuit(exercises);
    expect(exercises[0].rotationGroup).toBeUndefined();
    expect(exercises[0].group).toBeUndefined();
  });

  it('groups every station under one shared rotationGroup, typed as a circuit', () => {
    const exercises = [station('a', 4), station('b', 4), station('c', 4)];
    applyAerobicsCircuit(exercises);
    const groupIds = new Set(exercises.map((e) => e.rotationGroup));
    expect(groupIds.size).toBe(1);
    expect(exercises.every((e) => e.group?.type === 'circuit')).toBe(true);
    expect(exercises.every((e) => e.group?.id === exercises[0].rotationGroup)).toBe(true);
  });

  it('trims every station to the shortest round count, never extends a shorter one up', () => {
    const exercises = [station('a', 5), station('b', 3), station('c', 4)];
    applyAerobicsCircuit(exercises);
    expect(exercises.every((e) => e.sets.length === 3)).toBe(true);
  });
});
