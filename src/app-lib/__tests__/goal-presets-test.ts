import { GOAL_PRESETS, GOAL_PRESETS_BY_ID, PRIMARY_GOAL_OPTIONS } from '../goal-presets';

describe('goal-presets — onboarding artwork', () => {
  it('gives every primary goal and subtype an image-backed card', () => {
    expect(PRIMARY_GOAL_OPTIONS.every((goal) => goal.cardImage)).toBe(true);
    expect(GOAL_PRESETS.every((preset) => preset.cardImage)).toBe(true);
  });
});

describe('goal-presets — lose_weight.metabolic_conditioning (Phase 2 circuit structure)', () => {
  it('resolves circuit cardio format and the cardio-centered weight table', () => {
    const preset = GOAL_PRESETS_BY_ID['lose_weight.metabolic_conditioning'];
    expect(preset).toBeDefined();
    expect(preset.resolve.preferredCardioIntent).toBe('circuit');
    expect(preset.resolve.preferredWorkoutType).toBe('cardio');
    expect(preset.resolve.weights).toEqual({ strength: 0.15, cardio: 0.50, mobility: 0.05, general: 0.30 });
  });
});

describe('goal-presets — restPacing (Phase 3 dense pacing, ADR-0145)', () => {
  it('sets dense pacing on all three lose_weight subtypes', () => {
    for (const id of ['lose_weight.with_strength', 'lose_weight.with_cardio', 'lose_weight.metabolic_conditioning']) {
      expect(GOAL_PRESETS_BY_ID[id]?.resolve.restPacing).toBe('dense');
    }
  });

  it('leaves restPacing unset everywhere else', () => {
    const denseIds = new Set(['lose_weight.with_strength', 'lose_weight.with_cardio', 'lose_weight.metabolic_conditioning']);
    for (const preset of GOAL_PRESETS) {
      if (denseIds.has(preset.id)) continue;
      expect(preset.resolve.restPacing).toBeUndefined();
    }
  });
});
