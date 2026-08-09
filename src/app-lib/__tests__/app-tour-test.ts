import type { AthleteProfile } from '@/domain/types';
import { markAppTourComplete, needsAppTour } from '../app-tour';

function profile(appTour?: AthleteProfile['appTour']): AthleteProfile {
  return {
    id: 'me',
    experience: 'intermediate',
    goals: { weights: {} } as AthleteProfile['goals'],
    constraints: [],
    createdAt: 1,
    updatedAt: 1,
    appTour,
  };
}

describe('first-run app tour state', () => {
  it('does not auto-prompt established profiles without an eligibility marker', () => {
    expect(needsAppTour(profile())).toBe(false);
  });

  it('prompts an eligible new profile until the tour is completed', () => {
    const eligible = profile({ eligibleAt: 100 });
    expect(needsAppTour(eligible)).toBe(true);

    const complete = markAppTourComplete(eligible, 200);
    expect(complete.appTour).toEqual({ eligibleAt: 100, completedAt: 200 });
    expect(needsAppTour(complete)).toBe(false);
  });
});
