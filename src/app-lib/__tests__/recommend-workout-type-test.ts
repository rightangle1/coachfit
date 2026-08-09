import { GOAL_DOMINANCE_THRESHOLD, recommendWorkoutType } from '../presentation';
import { GOAL_LEVEL_WEIGHT } from '../options';
import type { ModalityWeights } from '@/domain/types';

const HIGH = GOAL_LEVEL_WEIGHT.high;    // primary goal
const MEDIUM = GOAL_LEVEL_WEIGHT.medium; // unpicked
const SUPPORTING = 0.5;                  // second goal (onboarding-form.tsx)

/** Exactly how onboarding builds weights (features/onboarding-form.tsx). */
function weightsFor(primary: keyof ModalityWeights, supporting?: keyof ModalityWeights): ModalityWeights {
  const of = (m: keyof ModalityWeights) => (m === primary ? HIGH : m === supporting ? SUPPORTING : MEDIUM);
  return { strength: of('strength'), cardio: of('cardio'), mobility: of('mobility'), general: of('general') };
}

describe('recommendWorkoutType — goal dominance', () => {
  it('preselects a style when one goal is clearly dominant', () => {
    expect(recommendWorkoutType({ weights: weightsFor('strength') })).toBe('bodybuilding');
    expect(recommendWorkoutType({ weights: weightsFor('cardio') })).toBe('cardio');
    expect(recommendWorkoutType({ weights: weightsFor('mobility') })).toBe('stretch');
  });

  it('still preselects when the athlete picked a supporting goal too', () => {
    // The regression this guards: the old raw comparison cleared its own
    // threshold by 2e-17 here, so a nudge to the goal constants would have
    // silently disabled the default for every two-goal athlete.
    expect(recommendWorkoutType({ weights: weightsFor('strength', 'cardio') })).toBe('bodybuilding');
    expect(recommendWorkoutType({ weights: weightsFor('cardio', 'strength') })).toBe('cardio');
  });

  it('has real headroom on both sides rather than sitting on a knife-edge', () => {
    const norm = (w: ModalityWeights) => {
      const total = w.strength + w.cardio + w.mobility + w.general;
      return [w.strength, w.cardio, w.mobility, w.general].map((v) => v / total).sort((a, b) => b - a);
    };
    const [oneTop, oneSecond] = norm(weightsFor('strength'));
    const [twoTop, twoSecond] = norm(weightsFor('strength', 'cardio'));
    expect(oneTop - oneSecond).toBeGreaterThan(GOAL_DOMINANCE_THRESHOLD * 2);
    expect(twoTop - twoSecond).toBeGreaterThan(GOAL_DOMINANCE_THRESHOLD * 1.5);
  });

  it('declines to preselect when goals are flat', () => {
    const flat: ModalityWeights = { strength: 0.25, cardio: 0.25, mobility: 0.25, general: 0.25 };
    expect(recommendWorkoutType({ weights: flat })).toBeUndefined();
  });

  it('is scale-invariant — only the shape of the goals matters', () => {
    const small: ModalityWeights = { strength: 0.065, cardio: 0.035, mobility: 0.035, general: 0.035 };
    const large: ModalityWeights = { strength: 65, cardio: 35, mobility: 35, general: 35 };
    expect(recommendWorkoutType({ weights: small })).toBe('bodybuilding');
    expect(recommendWorkoutType({ weights: large })).toBe('bodybuilding');
  });

  it('never preselects a style for a general-fitness lead', () => {
    expect(recommendWorkoutType({ weights: weightsFor('general') })).toBeUndefined();
  });

  it('handles an all-zero profile without dividing by zero', () => {
    const zero: ModalityWeights = { strength: 0, cardio: 0, mobility: 0, general: 0 };
    expect(recommendWorkoutType({ weights: zero })).toBeUndefined();
  });
});
