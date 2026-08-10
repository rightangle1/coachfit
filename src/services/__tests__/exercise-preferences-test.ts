import { getExercisePreferences, setExerciseFavorite } from '@/services/exercise-preferences';

jest.mock('@/data/persistence', () => {
  let excludedJson: string | undefined;
  return {
    getExercisePreferences: () => (excludedJson ? { id: 'me', excludedJson, updatedAt: 1 } : undefined),
    saveExercisePreferences: (row: { excludedJson: string }) => { excludedJson = row.excludedJson; },
  };
});

describe('exercise preferences', () => {
  it('persists favorites without changing exclusions', () => {
    setExerciseFavorite('squat', true);
    setExerciseFavorite('row', true);
    setExerciseFavorite('squat', false);
    expect(getExercisePreferences().favoriteExerciseIds).toEqual(['row']);
    expect(getExercisePreferences().excludedExerciseIds).toEqual([]);
  });
});
