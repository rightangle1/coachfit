import { getAthleteProfile, recordBodyweight, saveAthleteProfile } from '@/services/athlete';
import type { AthleteProfile } from '@/domain/types';

jest.mock('@/data/persistence', () => {
  let profileJson: string | undefined;
  return {
    getAthlete: () => (profileJson ? { id: 'me', profileJson, createdAt: 1, updatedAt: 1 } : undefined),
    saveAthlete: (row: { profileJson: string }) => { profileJson = row.profileJson; },
  };
});

const profile: AthleteProfile = {
  id: 'me', experience: 'beginner', goals: { weights: { strength: 1, cardio: 0, mobility: 0, general: 0 } },
  constraints: [], bodyweightKg: 70, bodyweightLog: [{ at: 20, kg: 70 }], createdAt: 1, updatedAt: 1,
};

describe('recordBodyweight', () => {
  it('appends dated entries and updates the current weight without mutating earlier readings', () => {
    saveAthleteProfile(profile);
    recordBodyweight(71.5, 30);
    expect(getAthleteProfile()?.bodyweightKg).toBe(71.5);
    expect(getAthleteProfile()?.bodyweightLog).toEqual([{ at: 20, kg: 70 }, { at: 30, kg: 71.5 }]);
  });

  it('keeps corrected or backdated entries in chronological order', () => {
    saveAthleteProfile(profile);
    recordBodyweight(69.5, 10);
    recordBodyweight(70.5, 20);
    expect(getAthleteProfile()?.bodyweightLog).toEqual([{ at: 10, kg: 69.5 }, { at: 20, kg: 70.5 }]);
  });
});
