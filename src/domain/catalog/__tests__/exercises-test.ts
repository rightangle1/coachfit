import { EXERCISES as SEED_EXERCISES } from '../exercises';
import { EXERCISES } from '..';
import { EXERCISE_MEDIA } from '../media';
import { LOAD_DEMAND_HI, LOAD_DEMAND_LO } from '../../engine/intensity';

describe('exercise catalog invariants', () => {
  it('has no duplicate ids', () => {
    const ids = SEED_EXERCISES.map((exercise) => exercise.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('gives every stretch-pattern exercise a non-empty description and steps', () => {
    const stretches = SEED_EXERCISES.filter((exercise) => exercise.movementPattern === 'stretch');
    const invalid = stretches.filter(
      (exercise) => !exercise.description.trim() || exercise.steps.length === 0,
    );
    expect(invalid.map((exercise) => exercise.id)).toEqual([]);
  });

  it('keys EXERCISE_MEDIA only by ids that exist in the catalog', () => {
    const ids = new Set(SEED_EXERCISES.map((exercise) => exercise.id));
    const orphaned = Object.keys(EXERCISE_MEDIA).filter((id) => !ids.has(id));
    expect(orphaned).toEqual([]);
  });

  it('keeps every explicit loadDemand override within the fixed scale (ADR-0123)', () => {
    const outOfRange = SEED_EXERCISES.filter(
      (exercise) => exercise.loadDemand != null && (exercise.loadDemand < LOAD_DEMAND_LO || exercise.loadDemand > LOAD_DEMAND_HI),
    );
    expect(outOfRange.map((exercise) => exercise.id)).toEqual([]);
  });

  it('gives every explicit metValue a plausible positive value (ADR-0123)', () => {
    const invalid = SEED_EXERCISES.filter((exercise) => exercise.metValue != null && !(exercise.metValue > 0));
    expect(invalid.map((exercise) => exercise.id)).toEqual([]);
  });

  it('gives every selectable exercise complete programming and substitution metadata', () => {
    const invalid = EXERCISES.filter((exercise) =>
      !exercise.difficulty ||
      !exercise.impact ||
      !exercise.movementSlot ||
      !exercise.substitutionFamily ||
      exercise.jointLoad.length === 0 ||
      !Array.isArray(exercise.prerequisites) ||
      !Array.isArray(exercise.regressionIds) ||
      !Array.isArray(exercise.progressionIds),
    );
    expect(invalid.map((exercise) => exercise.id)).toEqual([]);
  });
});
