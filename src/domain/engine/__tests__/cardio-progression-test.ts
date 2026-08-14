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
const AEROBICS: Exercise = { ...BIKE, id: 'test-aerobics', movementPattern: 'aerobics' };
const LIGHT_BIKE: Exercise = { ...BIKE, id: 'test-light-bike', metValue: 4 };

function history(exercise: Exercise, sets: SessionRecord['performed'][number]['sets']): SessionRecord[] {
  return [{
    id: 's', planId: 'p', plannedFor: NOW - 86_400_000, completedAt: NOW - 86_400_000,
    performed: [{ exerciseId: exercise.id, name: exercise.name, primaryAreas: [{ group: 'quads' }], sets }],
  }];
}

describe('cardio multi-week progression', () => {
  it('changes only steady-work duration after a successful exposure', () => {
    const prior = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, rpe: 6, completed: true, phase: 'work' }]);
    const next = cardioSets(BIKE, RX, 'basic', undefined, prior);
    expect(next).toHaveLength(1);
    expect(next[0].durationSec).toBe(330);
    expect(next[0].targetRpe).toBeDefined();
  });

  it('no longer pins RPE to a fixed 7 for a fresh session — basic uses MET-derived RPE like base always did (ADR-0141)', () => {
    const next = cardioSets(LIGHT_BIKE, RX, 'basic', undefined, []);
    expect(next[0].targetRpe).toBe(5);
  });

  it('changes only interval round count while holding work duration and recovery ratio', () => {
    const sets = Array.from({ length: 5 }, () => [
      { durationSec: 30, prescribedDurationSec: 30, rpe: 7, completed: true, phase: 'work' as const },
      { durationSec: 30, prescribedDurationSec: 30, rpe: 3, completed: true, phase: 'recovery' as const },
    ]).flat();
    const next = cardioSets(INTERVALS, RX, 'interval', undefined, history(INTERVALS, sets));
    expect(next.filter((set) => set.phase === 'work')).toHaveLength(6);
    expect(new Set(next.filter((set) => set.phase === 'work').map((set) => set.durationSec))).toEqual(new Set([30]));
  });

  it('does not progress after missed work or during recovery intent', () => {
    const missed = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, completed: false, skipped: true, phase: 'work' }]);
    expect(cardioSets(BIKE, RX, 'basic', undefined, missed)[0].durationSec).toBe(300);
    const successful = history(BIKE, [{ durationSec: 300, prescribedDurationSec: 300, completed: true, phase: 'work' }]);
    expect(cardioSets(BIKE, RX, 'basic', undefined, successful, 'recovery')[0].durationSec).toBe(300);
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
    const next = cardioSets(BIKE, RX, 'basic', undefined, records)[0];
    expect(next.progressionVariable).toBe(variable);
    expect(next.distanceM).toBe(distance);
    expect(next.durationSec).toBe(duration);
    expect(next.targetRpe).toBe(rpe);
  });
});

// ---------------------------------------------------------------------------
// ADR-0143: cardio session shape integrity
// ---------------------------------------------------------------------------

describe('cardioSets — first-exposure exact shape (ADR-0143)', () => {
  it('interval, no history: exactly the base 5 rounds x work+recovery = 10 sets — the literal shape behind the reported bug, but capped and legitimate', () => {
    const next = cardioSets(INTERVALS, RX, 'interval', undefined, []);
    expect(next.filter((s) => s.phase === 'work')).toHaveLength(5);
    expect(next.filter((s) => s.phase === 'recovery')).toHaveLength(5);
    expect(next).toHaveLength(10);
  });

  it('circuit/aerobics, no history, a long cardioSeconds budget with the default stationCount=1: capped at MAX_CARDIO_ROUNDS(8), never the ~22 rounds the uncapped time-budget division used to produce', () => {
    // Regression: round(1200 / 1 station / (45s work + 10s transition)) ≈ 22
    // same-exercise work sets — exactly the "Round 1 of 22" bug.
    const longRx: Prescription = { ...RX, cardioSeconds: 1200 };
    const next = cardioSets(AEROBICS, longRx, 'circuit', undefined, []);
    expect(next).toHaveLength(8);
    expect(next.every((s) => s.phase === 'work')).toBe(true);
  });
});

describe('cardioSets — intent is authoritative over the exercise\'s own tag (ADR-0143)', () => {
  it('a fresh interval-tagged exercise requested under basic intent produces steady shape, not interval structure', () => {
    const next = cardioSets(INTERVALS, RX, 'basic', undefined, []);
    expect(next).toHaveLength(1);
    expect(next.some((s) => s.phase === 'recovery')).toBe(false);
    expect(next[0].durationSec).toBe(RX.cardioSeconds);
  });

  it('a fresh aerobics-tagged exercise requested under basic intent produces steady shape, not circuit structure', () => {
    const next = cardioSets(AEROBICS, RX, 'basic', undefined, []);
    expect(next).toHaveLength(1);
    expect(next[0].durationSec).toBe(RX.cardioSeconds);
  });

  it('a fresh steady_cardio-tagged exercise requested under interval intent DOES produce interval structure — intent governs, not the tag', () => {
    const next = cardioSets(BIKE, RX, 'interval', undefined, []);
    expect(next.some((s) => s.phase === 'work')).toBe(true);
    expect(next.some((s) => s.phase === 'recovery')).toBe(true);
  });
});

describe('cardioSets — volumeScale (ADR-0143, readiness/recovery-intent volume reduction)', () => {
  it('scales down interval rounds on a reduced-volume day, never below the round floor', () => {
    const full = cardioSets(INTERVALS, RX, 'interval', undefined, [], 'balanced', 1, 1);
    const reduced = cardioSets(INTERVALS, RX, 'interval', undefined, [], 'balanced', 1, 0.7);
    const fullRounds = full.filter((s) => s.phase === 'work').length;
    const reducedRounds = reduced.filter((s) => s.phase === 'work').length;
    expect(reducedRounds).toBeLessThan(fullRounds);
    expect(reducedRounds).toBeGreaterThanOrEqual(2);
  });

  it('scales down circuit/aerobics rounds the same way', () => {
    const longRx: Prescription = { ...RX, cardioSeconds: 1200 };
    const full = cardioSets(AEROBICS, longRx, 'circuit', undefined, [], 'balanced', 1, 1);
    const reduced = cardioSets(AEROBICS, longRx, 'circuit', undefined, [], 'balanced', 1, 0.7);
    expect(reduced.length).toBeLessThan(full.length);
    expect(reduced.length).toBeGreaterThanOrEqual(2);
  });

  it('scales down basic/steady duration, floored at a real 3-minute minimum bout', () => {
    const full = cardioSets(BIKE, RX, 'basic', undefined, [], 'balanced', 1, 1);
    const reduced = cardioSets(BIKE, RX, 'basic', undefined, [], 'balanced', 1, 0.3);
    expect(reduced[0].durationSec).toBeLessThan(full[0].durationSec as number);
    expect(reduced[0].durationSec).toBeGreaterThanOrEqual(180);
  });

  it('a volumeScale above 1 never inflates volume — downward-only, matching strengthSets\' own volumeScale contract', () => {
    const baseline = cardioSets(INTERVALS, RX, 'interval', undefined, []);
    const scaledUp = cardioSets(INTERVALS, RX, 'interval', undefined, [], 'balanced', 1, 1.3);
    expect(scaledUp.filter((s) => s.phase === 'work').length).toBe(baseline.filter((s) => s.phase === 'work').length);
  });

  it('omitting volumeScale is byte-identical to passing 1 — old call sites are unaffected', () => {
    const withDefault = cardioSets(INTERVALS, RX, 'interval', undefined, []);
    const explicit1 = cardioSets(INTERVALS, RX, 'interval', undefined, [], 'balanced', 1, 1);
    expect(withDefault).toEqual(explicit1);
  });
});
