import type { Exercise, MuscleGroup, SessionRecord } from '../../types';
import {
  RECENCY_HALF_LIFE_DAYS,
  type ScoreContext,
  buildHistoryIndex,
  emphasisStrength,
  experienceFit,
  orderForSession,
  scoreExercise,
} from '../selection-score';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function exercise(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: id,
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['chest'],
    equipment: ['bodyweight'],
    progression: 'weight',
    description: 'fixture',
    steps: [],
    ...over,
  };
}

function context(over: Partial<ScoreContext> = {}): ScoreContext {
  return {
    emphasize: [],
    favorites: new Set(),
    experience: 'intermediate',
    weeklyVolume: {},
    fatigueByGroup: {},
    lastPerformedAt: new Map(),
    withProgressionBasis: new Set(),
    usedPatterns: new Map(),
    usedFamilies: new Map(),
    now: NOW,
    profile: 'accessory',
    ...over,
  };
}

describe('emphasisStrength — graded, not primary-only', () => {
  const dip = exercise('dip', { primaryAreas: ['triceps'], secondaryAreas: ['chest'] });
  const press = exercise('press', { primaryAreas: ['chest'] });
  const curl = exercise('curl', { primaryAreas: ['biceps'] });

  it('scores a primary match highest, a secondary match partially, and a miss at zero', () => {
    const emphasize = [{ group: 'chest' as MuscleGroup }];
    expect(emphasisStrength(emphasize, press)).toBe(1);
    expect(emphasisStrength(emphasize, dip)).toBe(0.5);
    expect(emphasisStrength(emphasize, curl)).toBe(0);
  });

  it('ranks a secondary match above an unrelated exercise', () => {
    const ctx = context({ emphasize: [{ group: 'chest' }] });
    expect(scoreExercise(dip, ctx)).toBeGreaterThan(scoreExercise(curl, ctx));
    expect(scoreExercise(press, ctx)).toBeGreaterThan(scoreExercise(dip, ctx));
  });
});

describe('experienceFit — beginners toward the common catalog, advanced toward the deeper one', () => {
  it('rewards beginner-tier and penalizes harder tiers for a beginner athlete', () => {
    expect(experienceFit('beginner', exercise('a', { difficulty: 'beginner' }))).toBeGreaterThan(0);
    expect(experienceFit('beginner', exercise('a', { difficulty: 'intermediate' }))).toBeLessThan(0);
    expect(experienceFit('beginner', exercise('a', { difficulty: 'advanced' }))).toBeLessThan(
      experienceFit('beginner', exercise('a', { difficulty: 'intermediate' })),
    );
  });

  it('gives an advanced athlete no penalty for beginner-tier work, but a real pull toward the deeper catalog', () => {
    const beginnerTier = experienceFit('advanced', exercise('a', { difficulty: 'beginner' }));
    const intermediateTier = experienceFit('advanced', exercise('a', { difficulty: 'intermediate' }));
    const advancedTier = experienceFit('advanced', exercise('a', { difficulty: 'advanced' }));
    expect(beginnerTier).toBe(0);
    expect(intermediateTier).toBeGreaterThan(beginnerTier);
    expect(advancedTier).toBeGreaterThan(intermediateTier);
  });

  it('treats a fixture with no difficulty tag as beginner-tier, the common case', () => {
    const untagged = exercise('a');
    expect(experienceFit('beginner', untagged)).toBe(experienceFit('beginner', exercise('b', { difficulty: 'beginner' })));
  });

  it('prefers the common beginner-tier lift over an equally-relevant harder one, for a beginner', () => {
    const common = exercise('pushup', { difficulty: 'beginner' });
    const harder = exercise('single-leg-pushup', { difficulty: 'advanced' });
    const ctx = context({ experience: 'beginner' });
    expect(scoreExercise(common, ctx)).toBeGreaterThan(scoreExercise(harder, ctx));
  });

  it('lets an advanced athlete favor the deeper-catalog lift over the beginner-tier one, all else equal', () => {
    const common = exercise('pushup', { difficulty: 'beginner' });
    const harder = exercise('single-leg-pushup', { difficulty: 'advanced' });
    const ctx = context({ experience: 'advanced' });
    expect(scoreExercise(harder, ctx)).toBeGreaterThan(scoreExercise(common, ctx));
  });

  it('damps the bias almost away for anchor picks, so a difficulty reshuffle cannot bump a stable progression lift', () => {
    const common = exercise('pushup', { difficulty: 'beginner' });
    const harder = exercise('single-leg-pushup', { difficulty: 'advanced' });
    const accessory = context({ experience: 'advanced', profile: 'accessory' });
    const anchor = context({ experience: 'advanced', profile: 'anchor' });
    const accessoryGap = scoreExercise(harder, accessory) - scoreExercise(common, accessory);
    const anchorGap = scoreExercise(harder, anchor) - scoreExercise(common, anchor);
    expect(anchorGap).toBeGreaterThan(0);
    expect(anchorGap).toBeLessThan(accessoryGap);
  });
});

describe('recency — the term that stops the same session repeating forever', () => {
  const a = exercise('a');
  const b = exercise('b');

  it('penalises an exercise performed today', () => {
    const ctx = context({ lastPerformedAt: new Map([['a', NOW]]) });
    expect(scoreExercise(a, ctx)).toBeLessThan(scoreExercise(b, ctx));
  });

  it('decays by half over the documented half-life', () => {
    const fresh = context();
    const today = context({ lastPerformedAt: new Map([['a', NOW]]) });
    const halfLifeAgo = context({ lastPerformedAt: new Map([['a', NOW - RECENCY_HALF_LIFE_DAYS * DAY]]) });

    const fullPenalty = scoreExercise(a, fresh) - scoreExercise(a, today);
    const halfPenalty = scoreExercise(a, fresh) - scoreExercise(a, halfLifeAgo);
    expect(halfPenalty).toBeCloseTo(fullPenalty / 2, 5);
  });

  it('lets a fresh non-favorite beat a favorite that was trained today', () => {
    // The exact trade-off the old boolean cascade could not express.
    const ctx = context({
      favorites: new Set(['a']),
      lastPerformedAt: new Map([['a', NOW]]),
    });
    expect(scoreExercise(b, ctx)).toBeGreaterThan(scoreExercise(a, ctx));
  });

  it('damps recency for anchor lifts so progression stays measurable', () => {
    const asAccessory = context({ lastPerformedAt: new Map([['a', NOW]]), profile: 'accessory' });
    const asAnchor = context({ lastPerformedAt: new Map([['a', NOW]]), profile: 'anchor' });
    expect(scoreExercise(a, asAnchor)).toBeGreaterThan(scoreExercise(a, asAccessory));
  });
});

describe('volume need — graded by deficit, not a boolean flag', () => {
  const empty = exercise('empty', { primaryAreas: ['shoulders'] });
  const nearlyDone = exercise('nearlyDone', { primaryAreas: ['back'] });

  it('prefers the muscle that is further from its weekly minimum', () => {
    const ctx = context({ weeklyVolume: { shoulders: 2, back: 9 } });
    expect(scoreExercise(empty, ctx)).toBeGreaterThan(scoreExercise(nearlyDone, ctx));
  });

  it('penalises a muscle already past its weekly ceiling', () => {
    const under = context({ weeklyVolume: { shoulders: 2 } });
    const over = context({ weeklyVolume: { shoulders: 40 } });
    expect(scoreExercise(empty, over)).toBeLessThan(scoreExercise(empty, under));
  });
});

describe('fatigue and pattern saturation', () => {
  it('prefers the fresher muscle', () => {
    const tired = exercise('tired', { primaryAreas: ['chest'] });
    const fresh = exercise('fresh', { primaryAreas: ['back'], movementPattern: 'pull' });
    const ctx = context({ fatigueByGroup: { chest: 0.6 } });
    expect(scoreExercise(fresh, ctx)).toBeGreaterThan(scoreExercise(tired, ctx));
  });

  it('gives diminishing returns to a movement pattern already used today', () => {
    const push = exercise('push2');
    const clean = context();
    const saturated = context({ usedPatterns: new Map([['push', 2]]) });
    expect(scoreExercise(push, saturated)).toBeLessThan(scoreExercise(push, clean));
  });
});

describe('orderForSession — compounds while fresh, isolation last', () => {
  it('puts a compound before an isolation lift regardless of selection order', () => {
    const squat = exercise('squat', { movementPattern: 'squat', primaryAreas: ['quads'], mechanic: 'compound' });
    const extension = exercise('tri-ext', { primaryAreas: ['triceps'], mechanic: 'isolation' });
    expect(orderForSession([extension, squat]).map((e) => e.id)).toEqual(['squat', 'tri-ext']);
  });

  it('orders compounds by systemic demand, heaviest first', () => {
    const heavy = exercise('heavy', { movementPattern: 'squat', primaryAreas: ['quads'], mechanic: 'compound', loadDemand: 1.3 });
    const lighter = exercise('lighter', { movementPattern: 'pull', primaryAreas: ['back'], mechanic: 'compound', loadDemand: 0.9 });
    expect(orderForSession([lighter, heavy]).map((e) => e.id)).toEqual(['heavy', 'lighter']);
  });

  it('is stable among equals, preserving the spread selection built', () => {
    const a = exercise('a', { mechanic: 'isolation' });
    const b = exercise('b', { mechanic: 'isolation' });
    const c = exercise('c', { mechanic: 'isolation' });
    expect(orderForSession([b, c, a]).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('buildHistoryIndex', () => {
  function record(id: string, at: number, sets: { completed: boolean; weightKg?: number; skipped?: boolean }[]): SessionRecord {
    return {
      id: `r-${id}-${at}`,
      planId: 'p',
      plannedFor: at,
      completedAt: at,
      performed: [{ exerciseId: id, name: id, primaryAreas: [{ group: 'chest' }], sets }],
    };
  }

  it('records the most recent completion per exercise', () => {
    const { lastPerformedAt } = buildHistoryIndex([
      record('a', NOW - 10 * DAY, [{ completed: true }]),
      record('a', NOW - 2 * DAY, [{ completed: true }]),
    ]);
    expect(lastPerformedAt.get('a')).toBe(NOW - 2 * DAY);
  });

  it('ignores skipped and incomplete sets', () => {
    const { lastPerformedAt } = buildHistoryIndex([
      record('a', NOW, [{ completed: false }, { completed: true, skipped: true }]),
    ]);
    expect(lastPerformedAt.has('a')).toBe(false);
  });

  it('flags only exercises with real weighted work as having a progression basis', () => {
    const { withProgressionBasis } = buildHistoryIndex([
      record('weighted', NOW, [{ completed: true, weightKg: 40 }]),
      record('bodyweight', NOW, [{ completed: true }]),
      record('zero', NOW, [{ completed: true, weightKg: 0 }]),
    ]);
    expect(withProgressionBasis.has('weighted')).toBe(true);
    expect(withProgressionBasis.has('bodyweight')).toBe(false);
    expect(withProgressionBasis.has('zero')).toBe(false);
  });
});
