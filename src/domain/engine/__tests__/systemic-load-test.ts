import type { ReadinessInput, SessionRecord } from '../../types';
import { isoWeekStart } from '../../metrics';
import { SYSTEMIC, systemicState } from '../systemic-load';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 5, 17, 18, 0, 0); // mid-week
const THIS_WEEK = isoWeekStart(NOW);
const MID = 2 * DAY + 12 * 3_600_000;

function session(at: number, opts: { rpe?: number; minutes?: number; readiness?: ReadinessInput; id?: string } = {}): SessionRecord {
  const { rpe = 7, minutes = 45, readiness, id } = opts;
  return {
    id: id ?? `s-${at}`,
    planId: 'p',
    plannedFor: at,
    completedAt: at,
    startedAt: at - minutes * 60_000,
    readiness,
    performed: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        primaryAreas: [{ group: 'chest' }],
        sets: [{ reps: 10, weightKg: 60, rpe, completed: true }],
      },
    ],
    debrief: { overallRpe: rpe },
  };
}

/** n sessions on consecutive days, most recent ending `endingDaysAgo` ago. */
function streak(n: number, endingDaysAgo = 0): SessionRecord[] {
  return Array.from({ length: n }, (_, i) => session(NOW - (endingDaysAgo + i) * DAY, { id: `k${i}` }));
}

describe('systemicState — the fatigue per-muscle accounting cannot see', () => {
  it('is inert with no history', () => {
    expect(systemicState([], NOW).volumeFactor).toBe(1);
  });

  it('leaves an ordinary training week alone', () => {
    const history = [session(NOW - DAY), session(NOW - 3 * DAY), session(NOW - 5 * DAY)];
    const state = systemicState(history, NOW);
    expect(state.volumeFactor).toBe(1);
    expect(state.note).toBeUndefined();
  });

  it('counts consecutive training days', () => {
    expect(systemicState(streak(4), NOW).consecutiveTrainingDays).toBe(4);
  });

  it('starts easing off once the athlete has trained too many days straight', () => {
    // The regression this exists to prevent: six days running with perfectly
    // rotated splits used to cost nothing, because no single muscle ever
    // crossed a threshold.
    const ok = systemicState(streak(SYSTEMIC.CONSECUTIVE_DAYS_BEFORE_CUT), NOW);
    const tooMany = systemicState(streak(SYSTEMIC.CONSECUTIVE_DAYS_BEFORE_CUT + 3), NOW);
    expect(ok.volumeFactor).toBe(1);
    expect(tooMany.volumeFactor).toBeLessThan(1);
    expect(tooMany.note).toMatch(/days trained in a row/);
  });

  it('does not deload from a rising load trend without a corroborating signal', () => {
    const history: SessionRecord[] = [
      session(THIS_WEEK - 4 * WEEK + MID, { minutes: 30, id: 'w4' }),
      session(THIS_WEEK - 3 * WEEK + MID, { minutes: 45, id: 'w3' }),
      session(THIS_WEEK - 2 * WEEK + MID, { minutes: 60, id: 'w2' }),
      session(THIS_WEEK - 1 * WEEK + MID, { minutes: 90, id: 'w1' }),
    ];
    const state = systemicState(history, NOW);
    expect(state.risingLoadWeeks).toBeGreaterThanOrEqual(SYSTEMIC.RISING_WEEKS_FOR_DELOAD);
    expect(state.deloadRecommended).toBe(false);
  });

  it('deloads when a rising trend is corroborated by repeated rough readiness', () => {
    const rough: ReadinessInput = { energy: 2, sleepQuality: 2, soreness: 4 };
    const history: SessionRecord[] = [
      session(THIS_WEEK - 4 * WEEK + MID, { minutes: 30, id: 'w4' }),
      session(THIS_WEEK - 3 * WEEK + MID, { minutes: 45, id: 'w3' }),
      session(THIS_WEEK - 2 * WEEK + MID, { minutes: 60, id: 'w2' }),
      session(THIS_WEEK - 1 * WEEK + MID, { minutes: 90, id: 'w1' }),
      session(NOW - DAY, { readiness: rough, id: 'r1' }),
      session(NOW - 2 * DAY, { readiness: rough, id: 'r2' }),
      session(NOW - 3 * DAY, { readiness: rough, id: 'r3' }),
    ];
    const state = systemicState(history, NOW);
    expect(state.deloadRecommended).toBe(true);
    expect(state.volumeFactor).toBeLessThan(1);
    expect(state.note).toMatch(/climbed \d+ weeks running/);
  });

  it('does not deload on a flat or falling load trend', () => {
    const history: SessionRecord[] = [
      session(THIS_WEEK - 3 * WEEK + MID, { minutes: 90, id: 'w3' }),
      session(THIS_WEEK - 2 * WEEK + MID, { minutes: 60, id: 'w2' }),
      session(THIS_WEEK - 1 * WEEK + MID, { minutes: 45, id: 'w1' }),
    ];
    expect(systemicState(history, NOW).deloadRecommended).toBe(false);
  });

  it('compounds repeated rough check-ins, which readiness alone forgets each day', () => {
    const rough: ReadinessInput = { energy: 2, sleepQuality: 2, soreness: 4 };
    const history = [
      session(NOW - DAY, { readiness: rough, id: 'r1' }),
      session(NOW - 2 * DAY, { readiness: rough, id: 'r2' }),
      session(NOW - 3 * DAY, { readiness: rough, id: 'r3' }),
    ];
    const state = systemicState(history, NOW);
    expect(state.recentRoughDays).toBe(3);
    expect(state.volumeFactor).toBeLessThan(1);
  });

  it('ignores good check-ins', () => {
    const good: ReadinessInput = { energy: 4, sleepQuality: 4, soreness: 1 };
    const history = [
      session(NOW - DAY, { readiness: good, id: 'g1' }),
      session(NOW - 3 * DAY, { readiness: good, id: 'g2' }),
      session(NOW - 5 * DAY, { readiness: good, id: 'g3' }),
    ];
    expect(systemicState(history, NOW).recentRoughDays).toBe(0);
  });

  it('never cuts more than the documented maximum, and never raises', () => {
    const rough: ReadinessInput = { energy: 1, sleepQuality: 1, soreness: 5 };
    const history = [
      ...streak(14).map((r, i) => ({ ...r, readiness: rough, id: `x${i}` })),
      session(THIS_WEEK - 3 * WEEK + MID, { minutes: 30, id: 'w3' }),
      session(THIS_WEEK - 2 * WEEK + MID, { minutes: 60, id: 'w2' }),
      session(THIS_WEEK - 1 * WEEK + MID, { minutes: 120, id: 'w1' }),
    ];
    const state = systemicState(history, NOW);
    expect(state.volumeFactor).toBeGreaterThanOrEqual(1 - SYSTEMIC.MAX_CUT);
    expect(state.volumeFactor).toBeLessThanOrEqual(1);
  });
});

describe('systemicState — ending early only counts when it means something', () => {
  function endedEarly(daysAgo: number, reason: 'out_of_time' | 'too_hard' | undefined, skipped: boolean, id: string): SessionRecord {
    const at = NOW - daysAgo * DAY;
    return {
      id,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      startedAt: at - 30 * 60_000,
      endedEarly: true,
      ...(reason ? { endedEarlyReason: reason } : {}),
      performed: [
        {
          exerciseId: 'bench',
          name: 'Bench',
          primaryAreas: [{ group: 'chest' }],
          sets: [
            { reps: 10, weightKg: 60, rpe: 7, completed: true },
            { reps: 10, weightKg: 60, rpe: 7, completed: false, skipped },
          ],
        },
      ],
      debrief: { overallRpe: 7 },
    };
  }

  it('ignores a session cut short for time, even with sets left unfinished', () => {
    const state = systemicState([endedEarly(1, 'out_of_time', true, 'a')], NOW);
    expect(state.recentOverreachedSessions).toBe(0);
    expect(state.volumeFactor).toBe(1);
  });

  it('ignores a bare endedEarly with no reason recorded', () => {
    const state = systemicState([endedEarly(1, undefined, true, 'b')], NOW);
    expect(state.recentOverreachedSessions).toBe(0);
    expect(state.volumeFactor).toBe(1);
  });

  it('ignores "too hard" when nothing was actually left unfinished', () => {
    const state = systemicState([endedEarly(1, 'too_hard', false, 'c')], NOW);
    expect(state.recentOverreachedSessions).toBe(0);
    expect(state.volumeFactor).toBe(1);
  });

  it('eases off only when both halves are true — too hard AND sets skipped', () => {
    const state = systemicState([endedEarly(1, 'too_hard', true, 'd')], NOW);
    expect(state.recentOverreachedSessions).toBe(1);
    expect(state.volumeFactor).toBeLessThan(1);
    expect(state.note).toMatch(/ran out of gas/);
  });
});
