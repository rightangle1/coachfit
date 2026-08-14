import { familyOfWorkoutType, WORKOUT_TYPE_FAMILY, WORKOUT_TYPE_OPTIONS } from '../options';

describe('familyOfWorkoutType — ADR-0407', () => {
  it('groups every WorkoutType into exactly one family, with no gaps', () => {
    for (const option of WORKOUT_TYPE_OPTIONS) {
      if (option.value === undefined) continue;
      expect(WORKOUT_TYPE_FAMILY[option.value]).toBeDefined();
    }
  });

  it('resolves the mobility family — stretch, yoga, barre, and pilates', () => {
    expect(familyOfWorkoutType('stretch')).toBe('mobility');
    expect(familyOfWorkoutType('yoga')).toBe('mobility');
    expect(familyOfWorkoutType('barre')).toBe('mobility');
    expect(familyOfWorkoutType('pilates')).toBe('mobility');
  });

  it('resolves the strength family — bodybuilding, sculpting, bodyweight', () => {
    expect(familyOfWorkoutType('bodybuilding')).toBe('strength');
    expect(familyOfWorkoutType('sculpting')).toBe('strength');
    expect(familyOfWorkoutType('bodyweight')).toBe('strength');
  });

  it('resolves cardio to its own family', () => {
    expect(familyOfWorkoutType('cardio')).toBe('cardio');
  });

  it('resolves unset (Balanced) to strength', () => {
    expect(familyOfWorkoutType(undefined)).toBe('strength');
  });
});
