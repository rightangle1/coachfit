import type { Exercise, SessionRecord } from '../../types';
import { cardioSets, type Prescription } from '../rules-engine';

const NOW = Date.UTC(2026, 7, 1);
const RX: Prescription = { mainSets: 3, mainReps: 10, mainRpe: 7, coreSeconds: 30, cardioSeconds: 600 };
const BIKE: Exercise = {
  id: 'test-bike', name: 'Bike', modality: 'cardio', movementPattern: 'steady_cardio',
  primaryAreas: ['quads'], equipment: ['cardio_machine'], progression: 'time',
  description: 'fixture', steps: [],
};
const INTERVALS: Exercise = { ...BIKE, id: 'test-intervals', movementPattern: 'interval' };

function history(exercise: Exercise, sets: SessionRecord['performed'][number]['sets']): SessionRecord[] {
  return [{
    id: 's', planId: 'p', plannedFor: NOW - 86_400_000, completedAt: NOW - 86_400_000,
    performed: [{ exerciseId: exercise.id, name: exercise.name, primaryAreas: [{ group: 'quads' }], sets }],
  }];
}

describe('cardio multi-week progression', () => {
  it('changes only steady-work duration after a successful exposure', () => {
    const prior = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, rpe: 6, completed: true, phase: 'work' }]);
    const next = cardioSets(BIKE, RX, 'base', undefined, prior);
    expect(next).toHaveLength(1);
    expect(next[0].durationSec).toBe(330);
    expect(next[0].targetRpe).toBeDefined();
  });

  it('changes only interval round count while holding work duration and recovery ratio', () => {
    const sets = Array.from({ length: 5 }, () => [
      { durationSec: 30, prescribedDurationSec: 30, rpe: 7, completed: true, phase: 'work' as const },
      { durationSec: 30, prescribedDurationSec: 30, rpe: 3, completed: true, phase: 'recovery' as const },
    ]).flat();
    const next = cardioSets(INTERVALS, RX, 'intervals', undefined, history(INTERVALS, sets));
    expect(next.filter((set) => set.phase === 'work')).toHaveLength(6);
    expect(new Set(next.filter((set) => set.phase === 'work').map((set) => set.durationSec))).toEqual(new Set([30]));
  });

  it('does not progress after missed work or during recovery intent', () => {
    const missed = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, completed: false, skipped: true, phase: 'work' }]);
    expect(cardioSets(BIKE, RX, 'base', undefined, missed)[0].durationSec).toBe(300);
    const successful = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, completed: true, phase: 'work' }]);
    expect(cardioSets(BIKE, RX, 'base', undefined, successful, 'recovery')[0].durationSec).toBe(300);
  });

  it.each([
    [2, 'distance', 1050, 300, 7],
    [3, 'pace', 1030, 300, 7],
    [4, 'perceived_intensity', 1000, 300, 8],
  ] as const)('advances one steady-cardio axis at exposure %s: %s', (count, variable, distance, duration, rpe) => {
    const records = Array.from({ length: count }, (_, index): SessionRecord => ({
      id: `s${index}`, planId: 'p', plannedFor: NOW - (index + 1) * 86_400_000,
      completedAt: NOW - (index + 1) * 86_400_000,
      performed: [{
        exerciseId: BIKE.id, name: BIKE.name, primaryAreas: [{ group: 'quads' }],
        sets: [{ durationSec: 300, prescribedDurationSec: 300, distanceM: 1000, prescribedDistanceM: 1000, rpe: 6, completed: true, phase: 'work' }],
      }],
    }));
    const next = cardioSets(BIKE, RX, 'base', undefined, records)[0];
    expect(next.progressionVariable).toBe(variable);
    expect(next.distanceM).toBe(distance);
    expect(next.durationSec).toBe(duration);
    expect(next.targetRpe).toBe(rpe);
  });
});
