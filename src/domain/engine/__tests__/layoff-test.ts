import type { SessionRecord } from '../../types';
import { LAYOFF, layoffState } from '../layoff';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function sessionDaysAgo(days: number, id = `s-${days}`): SessionRecord {
  const at = NOW - days * DAY;
  return {
    id,
    planId: 'plan-1',
    plannedFor: at,
    completedAt: at,
    performed: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, weightKg: 60, completed: true }],
      },
    ],
  };
}

describe('layoffState — ADR-0125 return-to-training ramp', () => {
  it('does nothing for a brand-new athlete with no history', () => {
    const state = layoffState([], NOW);
    expect(state.loadFactor).toBe(1);
    expect(state.volumeFactor).toBe(1);
    expect(state.note).toBeUndefined();
  });

  it('does nothing for normal rest days inside the grace window', () => {
    const state = layoffState([sessionDaysAgo(3), sessionDaysAgo(6)], NOW);
    expect(state.loadFactor).toBe(1);
    expect(state.volumeFactor).toBe(1);
    expect(state.daysSinceLastSession).toBeCloseTo(3);
  });

  it('does nothing at exactly the grace boundary', () => {
    const state = layoffState([sessionDaysAgo(LAYOFF.GRACE_DAYS)], NOW);
    expect(state.loadFactor).toBe(1);
  });

  it('eases both load and volume after a three-week gap', () => {
    const state = layoffState([sessionDaysAgo(21)], NOW);
    expect(state.loadFactor).toBeLessThan(1);
    expect(state.volumeFactor).toBeLessThan(state.loadFactor); // volume falls faster
    expect(state.note).toMatch(/first session back after 3 weeks off/);
  });

  it('never cuts deeper than the documented maximums', () => {
    const state = layoffState([sessionDaysAgo(365)], NOW);
    expect(state.loadFactor).toBeCloseTo(1 - LAYOFF.MAX_LOAD_CUT);
    expect(state.volumeFactor).toBeCloseTo(1 - LAYOFF.MAX_VOLUME_CUT);
  });

  it('deepens the ramp as the gap grows', () => {
    const short = layoffState([sessionDaysAgo(14)], NOW);
    const long = layoffState([sessionDaysAgo(45)], NOW);
    expect(long.loadFactor).toBeLessThan(short.loadFactor);
  });

  it('halves the ramp on the second session back, then clears it', () => {
    // One session logged since a 30-day gap.
    const oneBack = layoffState([sessionDaysAgo(2), sessionDaysAgo(32)], NOW);
    const firstBack = layoffState([sessionDaysAgo(30)], NOW);
    expect(oneBack.loadFactor).toBeLessThan(1);
    expect(oneBack.loadFactor).toBeGreaterThan(firstBack.loadFactor);
    expect(oneBack.note).toMatch(/still easing back in/);

    // Two sessions logged since the same gap — they are simply training again.
    const twoBack = layoffState([sessionDaysAgo(1), sessionDaysAgo(4), sessionDaysAgo(34)], NOW);
    expect(twoBack.loadFactor).toBe(1);
    expect(twoBack.volumeFactor).toBe(1);
    expect(twoBack.note).toBeUndefined();
  });

  it('only ever reduces — it can never raise load or volume', () => {
    for (const days of [0, 1, 5, 10, 11, 20, 40, 90, 400]) {
      const state = layoffState([sessionDaysAgo(days)], NOW);
      expect(state.loadFactor).toBeLessThanOrEqual(1);
      expect(state.volumeFactor).toBeLessThanOrEqual(1);
    }
  });

  it('ignores sessions that were never completed', () => {
    const abandoned: SessionRecord = { ...sessionDaysAgo(1, 'abandoned'), completedAt: undefined };
    const state = layoffState([abandoned, sessionDaysAgo(30)], NOW);
    expect(state.loadFactor).toBeLessThan(1); // the 30-day gap still counts
  });
});
