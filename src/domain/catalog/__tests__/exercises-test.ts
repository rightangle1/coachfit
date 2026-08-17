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

  it('gives cardio exercises exactly a cardioModality, and nothing else one (ADR-0139)', () => {
    const missing = SEED_EXERCISES.filter((exercise) => exercise.modality === 'cardio' && !exercise.cardioModality);
    const misplaced = SEED_EXERCISES.filter((exercise) => exercise.modality !== 'cardio' && exercise.cardioModality);
    expect(missing.map((exercise) => exercise.id)).toEqual([]);
    expect(misplaced.map((exercise) => exercise.id)).toEqual([]);
  });

  it('gives the "general" modality a real, resistance-shaped exercise pool', () => {
    // Regression guard: 'general' only ever pulls into a session's Main
    // block via the compound resistance patterns (rules-engine.ts's
    // resistanceModality path) — a mobility/cardio exercise accidentally
    // retagged into 'general' would silently break Warmup/Cool
    // down/Conditioning pools that filter by modality, not movementPattern.
    const RESISTANCE_PATTERNS = new Set(['squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'core']);
    const general = SEED_EXERCISES.filter((exercise) => exercise.modality === 'general');
    expect(general.length).toBeGreaterThanOrEqual(15);
    const wrongShape = general.filter((exercise) => !RESISTANCE_PATTERNS.has(exercise.movementPattern));
    expect(wrongShape.map((exercise) => exercise.id)).toEqual([]);
  });

  it('shares a variantFamily between burpees and its own named variant (ADR-0134 regression)', () => {
    // Auto-derivation split these apart because "jump" in the variant's name
    // routed it to a different movementSlot than plain "Burpees" — which let
    // FAMILY_SATURATION miss the one pair of cardio exercises most obviously
    // the same movement, and both could land in one session together.
    const burpees = EXERCISES.find((exercise) => exercise.id === 'ca-burpees');
    const comboVariant = EXERCISES.find((exercise) => exercise.id === 'ca-burpee-broad-jump-combo');
    expect(burpees?.variantFamily).toBeTruthy();
    expect(burpees?.variantFamily).toBe(comboVariant?.variantFamily);
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
