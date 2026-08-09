import type { ReadinessInput } from '../../types';
import { readinessFactor, readinessSuggestsRecovery } from '../readiness';

// The values the prebrief actually emits (src/app/index.tsx).
const UI = {
  sleep: { low: 2, okay: 3, great: 4 },
  energy: { low: 2, okay: 3, great: 4 },
  soreness: { none: 1, some: 3, alot: 4 },
};

const VOLUME_MAX_CUT = 0.3;
const VOLUME_SCALE = 2;
const LOAD_MAX_CUT = 0.1;

const volume = (r: ReadinessInput) => readinessFactor(r, VOLUME_MAX_CUT, VOLUME_SCALE);
const load = (r: ReadinessInput) => readinessFactor(r, LOAD_MAX_CUT);

describe('readiness bands — calibrated to what the prebrief can actually report', () => {
  const best: ReadinessInput = { sleepQuality: UI.sleep.great, energy: UI.energy.great, soreness: UI.soreness.none };
  const neutral: ReadinessInput = { sleepQuality: UI.sleep.okay, energy: UI.energy.okay, soreness: UI.soreness.none };
  const worst: ReadinessInput = { sleepQuality: UI.sleep.low, energy: UI.energy.low, soreness: UI.soreness.alot };

  it('leaves a neutral day completely untouched', () => {
    expect(volume(neutral)).toBe(1);
    expect(load(neutral)).toBe(1);
  });

  it('never raises anything, even on the best possible report', () => {
    // Deliberate (ADR-0103): a good day is earned through performance, not a
    // self-report, so "Great" is neutral rather than a bonus.
    expect(volume(best)).toBe(1);
    expect(load(best)).toBe(1);
  });

  it('the worst reportable day actually reaches the designed maximum cut', () => {
    // The regression this exists to prevent: the bands used to be calibrated
    // for values the UI could not emit, so the grimmest check-in cost ~8% of
    // reps against a 30% design ceiling.
    expect(volume(worst)).toBeCloseTo(1 - VOLUME_MAX_CUT * 0.933, 2);
    expect(volume(worst)).toBeLessThan(0.75);
    expect(load(worst)).toBeCloseTo(1 - LOAD_MAX_CUT, 5);
  });

  it('grades between neutral and worst rather than jumping', () => {
    const oneBadSignal: ReadinessInput = { ...neutral, energy: UI.energy.low };
    const twoBadSignals: ReadinessInput = { ...oneBadSignal, sleepQuality: UI.sleep.low };
    expect(volume(oneBadSignal)).toBeLessThan(volume(neutral));
    expect(volume(twoBadSignals)).toBeLessThan(volume(oneBadSignal));
    expect(volume(worst)).toBeLessThan(volume(twoBadSignals));
  });

  it('treats mild soreness as a real, small signal', () => {
    expect(volume({ ...neutral, soreness: UI.soreness.some })).toBeLessThan(1);
  });

  it('only suggests a recovery day when several signals are genuinely bad', () => {
    expect(readinessSuggestsRecovery(neutral)).toBe(false);
    expect(readinessSuggestsRecovery({ ...neutral, soreness: UI.soreness.some })).toBe(false);
    expect(readinessSuggestsRecovery({ ...neutral, energy: UI.energy.low })).toBe(false);
    expect(readinessSuggestsRecovery(worst)).toBe(true);
  });

  it('ignores signals the athlete did not answer', () => {
    expect(volume({})).toBe(1);
    expect(load({})).toBe(1);
  });
});
