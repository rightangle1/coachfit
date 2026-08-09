import { goalWeekPayoff, primaryGoal } from '../personalization';

describe('goal personalization', () => {
  it('keeps the strongest goal weight as the primary experience lens', () => {
    expect(primaryGoal({
      weights: { strength: 0.5, cardio: 0.35, mobility: 0.35, general: 0.65 },
    })).toBe('general');
  });

  it('provides useful zero states before the first workout', () => {
    expect(goalWeekPayoff('general', [], { bodyweightKg: 75, weightUnit: 'lb' }, 1_000)).toEqual({
      value: '0',
      label: 'KCAL THIS WEEK',
      detail: 'Your burn total starts with your first workout',
    });
  });
});
