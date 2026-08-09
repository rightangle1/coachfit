/**
 * ADR-0134 — per-session volume ceiling and movement redundancy.
 *
 * CLAUDE.md §14 requires explicit tests for safety caps. The ceiling is a hard
 * constraint, so the tests here are about what CANNOT happen (no emphasis mode,
 * duration request, or swap may exceed it) and — just as important — what MUST
 * still be reachable: an athlete who wants nothing but push-ups still gets them.
 */

import { RulesEngine } from '../rules-engine';
import { EXERCISES } from '../../catalog';
import { SELECTION_WEIGHTS, scoreExercise, type ScoreContext } from '../selection-score';
import { allocateDailyVolume, dailySetCeiling, trimToWorkingSets } from '../session-volume';
import type {
  AthleteProfile,
  EquipmentInventory,
  Exercise,
  ModalityWeights,
  MuscleGroup,
  PlannedSet,
  SessionContext,
  SessionPlan,
} from '../../types';

const NOW = Date.UTC(2026, 6, 22, 18, 0, 0); // a Wednesday, mid-week

const HOME_GYM: EquipmentInventory = {
  items: [{ type: 'bodyweight' }, { type: 'dumbbells' }, { type: 'bench' }, { type: 'yoga_mat' }],
};

const STRENGTH_WEIGHTS: ModalityWeights = { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 };

function athlete(): AthleteProfile {
  return {
    id: 'athlete-1',
    experience: 'intermediate',
    goals: { weights: STRENGTH_WEIGHTS },
    constraints: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function context(over: Partial<SessionContext> = {}): SessionContext {
  const profile = athlete();
  return {
    athlete: profile,
    equipment: HOME_GYM,
    history: [],
    fatigue: { byGroup: {}, updatedAt: NOW },
    readiness: {},
    goals: profile.goals,
    targeting: { emphasize: [{ group: 'chest' }], avoid: [] },
    avoidToday: { flags: [] },
    plannedFor: NOW,
    targetDurationMin: 60,
    ...over,
  };
}

/** Working sets credited to `group` across the Main block. */
function mainSetsFor(plan: SessionPlan, group: MuscleGroup): number {
  return plan.blocks
    .filter((block) => block.label === 'Main' && block.modality === 'strength')
    .flatMap((block) => block.exercises)
    .filter((exercise) => exercise.primaryAreas.some((area) => area.group === group))
    .reduce((sum, exercise) => sum + exercise.sets.filter((set) => !set.isWarmup && !set.isCalibration).length, 0);
}

function mainExercises(plan: SessionPlan) {
  return plan.blocks
    .filter((block) => block.label === 'Main' && block.modality === 'strength')
    .flatMap((block) => block.exercises);
}

/** Every chest-primary strength exercise except the ids kept. */
function excludeAllChestExcept(keep: string[]): string[] {
  return EXERCISES.filter(
    (e) => e.modality === 'strength' && e.primaryAreas.includes('chest') && !keep.includes(e.id),
  ).map((e) => e.id);
}

const PUSHUP_FAMILY = EXERCISES.filter(
  (e) => e.variantFamily === 'horizontal_push:bodyweight:compound' && e.primaryAreas.includes('chest'),
).map((e) => e.id);

// The intermediate/general landmark is mrv 16 → ceiling 9.
const CEILING = dailySetCeiling({ mev: 8, mrv: 16 });

describe('dailySetCeiling — derived from the weekly landmark, hard-bounded', () => {
  it('is a share of MRV, so it inherits experience and focus adjustments', () => {
    expect(dailySetCeiling({ mev: 6, mrv: 12 })).toBe(7); // beginner/general
    expect(dailySetCeiling({ mev: 8, mrv: 16 })).toBe(9); // intermediate/general
  });

  it('never exceeds the absolute per-session maximum, however generous MRV is', () => {
    expect(dailySetCeiling({ mev: 20, mrv: 40 })).toBe(10);
    expect(dailySetCeiling({ mev: 100, mrv: 1000 })).toBe(10);
  });

  it('never drops below a trainable minimum, however conservative MRV is', () => {
    expect(dailySetCeiling({ mev: 1, mrv: 2 })).toBe(4);
  });
});

describe('allocateDailyVolume — shares the ceiling instead of draining it', () => {
  const chest = (id: string) => ({ id, groups: { primary: ['chest' as MuscleGroup], secondary: [] } });

  it('spreads a 9-set ceiling across three exercises rather than two', () => {
    const { allowance, dropped } = allocateDailyVolume(
      [chest('a'), chest('b'), chest('c'), chest('d')],
      9,
      () => 5,
      3,
    );
    expect(allowance.get('a')).toBe(3);
    expect(allowance.get('b')).toBe(3);
    expect(allowance.get('c')).toBe(3);
    // A fourth would only fit as a stub, so it is dropped outright.
    expect(dropped).toEqual(['d']);
    const total = ['a', 'b', 'c'].reduce((sum, id) => sum + (allowance.get(id) ?? 0), 0);
    expect(total).toBe(9);
  });

  it('tops surviving exercises up toward their full prescription with what is left', () => {
    const { allowance } = allocateDailyVolume([chest('a'), chest('b')], 9, () => 5, 3);
    // 3+3 reserved, then 3 left over goes to the higher-priority lift first.
    expect(allowance.get('a')).toBe(5);
    expect(allowance.get('b')).toBe(4);
  });

  it('honors priority order — the first-listed exercise is the one that survives', () => {
    const { allowance, dropped } = allocateDailyVolume([chest('keep'), chest('drop')], 3, () => 3, 3);
    expect(allowance.get('keep')).toBe(3);
    expect(dropped).toEqual(['drop']);
  });

  it('credits secondary areas at a discount, so assistance work is not free', () => {
    const press = { id: 'press', groups: { primary: ['chest' as MuscleGroup], secondary: ['triceps' as MuscleGroup] } };
    const extension = { id: 'ext', groups: { primary: ['triceps' as MuscleGroup], secondary: [] } };
    const { allowance, dropped } = allocateDailyVolume([press, extension], 4, () => 4, 3);
    expect(allowance.get('press')).toBe(4);
    // The press already spent 1.6 of the triceps ceiling as assistance, leaving
    // 2.4 — not enough for a real 3-set block, so the extension is dropped
    // rather than run as a stub.
    expect(dropped).toEqual(['ext']);
  });

  it('never grants a fractional set, even though secondary credit is fractional', () => {
    const press = { id: 'press', groups: { primary: ['chest' as MuscleGroup], secondary: ['triceps' as MuscleGroup] } };
    const extension = { id: 'ext', groups: { primary: ['triceps' as MuscleGroup], secondary: [] } };
    const { allowance } = allocateDailyVolume([press, extension], 9, () => 5, 1);
    for (const granted of allowance.values()) expect(Number.isInteger(granted)).toBe(true);
  });
});

describe('trimToWorkingSets — trims volume, never the warm-up ramp', () => {
  it('drops working sets from the end and keeps ramp/calibration sets', () => {
    const sets: PlannedSet[] = [
      { reps: 5, isWarmup: true },
      { reps: 3, isCalibration: true },
      { reps: 10 },
      { reps: 10 },
      { reps: 10 },
    ];
    const trimmed = trimToWorkingSets(sets, 1);
    expect(trimmed).toHaveLength(3);
    expect(trimmed.filter((set) => !set.isWarmup && !set.isCalibration)).toHaveLength(1);
    expect(trimmed[0].isWarmup).toBe(true);
    expect(trimmed[1].isCalibration).toBe(true);
  });

  it('is a no-op when already within the allowance', () => {
    const sets: PlannedSet[] = [{ reps: 10 }, { reps: 10 }];
    expect(trimToWorkingSets(sets, 5)).toBe(sets);
  });
});

describe('the ceiling is a hard constraint — nothing exceeds it', () => {
  it('caps a balanced chest-emphasis session (was 14 sets / 140 reps)', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'balanced' } }),
    );
    expect(mainSetsFor(plan, 'chest')).toBeLessThanOrEqual(CEILING);
  });

  it('caps a priority chest-emphasis session (was 22 sets / 220 reps)', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' } }),
    );
    expect(mainSetsFor(plan, 'chest')).toBeLessThanOrEqual(CEILING);
  });

  it('caps even with warmup, conditioning and cooldown all skipped', async () => {
    // Those blocks' minutes fold back into Main, which used to make stripping a
    // session down produce MORE volume, not less.
    const plan = await new RulesEngine().generateSession(
      context({
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        workoutOptions: { includeWarmup: false, includeConditioning: false, includeCooldown: false },
      }),
    );
    expect(mainSetsFor(plan, 'chest')).toBeLessThanOrEqual(CEILING);
  });

  it('caps when the athlete is ALREADY over the weekly ceiling — the case that used to add volume', async () => {
    const history = [
      {
        id: 'prior',
        planId: 'p',
        plannedFor: NOW - 2 * 86_400_000,
        completedAt: NOW - 2 * 86_400_000,
        performed: [
          {
            exerciseId: 'pu-db-bench',
            name: 'Dumbbell bench press',
            primaryAreas: [{ group: 'chest' as MuscleGroup }],
            sets: Array.from({ length: 18 }, () => ({ reps: 10, weightKg: 20, completed: true })),
          },
        ],
      },
    ];
    const plan = await new RulesEngine().generateSession(
      context({ history, targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' } }),
    );
    // Previously: detected the over-MRV state, trimmed each exercise, then added
    // another one — 18 further chest sets on top of 18 already logged.
    expect(mainSetsFor(plan, 'chest')).toBeLessThanOrEqual(CEILING);
  });

  it('never leaves a one-set stub — the ceiling drops the exercise instead', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' } }),
    );
    for (const exercise of mainExercises(plan)) {
      const working = exercise.sets.filter((set) => !set.isWarmup && !set.isCalibration).length;
      expect(working).toBeGreaterThanOrEqual(3);
      expect(working).toBeLessThanOrEqual(5);
    }
  });

  it('explains itself when the session comes back shorter than requested', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' } }),
    );
    expect(plan.rationale).toContain(`at ${CEILING} sets`);
    expect(plan.rationale).toContain('runs shorter than you asked for');
  });

  it('stays quiet about the ceiling when it cost the athlete nothing', async () => {
    // A balanced session spreads volume without dropping work; announcing a cap
    // there is noise that teaches people to ignore the rationale.
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [], avoid: [] } }),
    );
    expect(plan.rationale).not.toContain('runs shorter than you asked for');
  });
});

describe('an all-push-up session stays reachable — the redundancy rule is a bias, not a filter', () => {
  it('gives push-ups when the athlete has excluded every other chest exercise', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        excludedExerciseIds: excludeAllChestExcept(PUSHUP_FAMILY),
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        workoutOptions: { includeWarmup: false, includeConditioning: false, includeCooldown: false },
      }),
    );
    const names = mainExercises(plan).map((exercise) => exercise.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name.toLowerCase().includes('push-up'))).toBe(true);
    // Reachable, but still bounded by the hard ceiling.
    expect(mainSetsFor(plan, 'chest')).toBeLessThanOrEqual(CEILING);
  });

  it('gives exactly one exercise when only one is left, rather than changing the subject', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        excludedExerciseIds: excludeAllChestExcept(['pu-pushup']),
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        workoutOptions: { includeWarmup: false, includeConditioning: false, includeCooldown: false },
      }),
    );
    expect(mainExercises(plan).map((e) => e.name)).toEqual(['Push-up']);
  });

  it('blames the exclusion list, not the equipment, when exclusions emptied the pool', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        excludedExerciseIds: excludeAllChestExcept(['pu-pushup']),
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
      }),
    );
    expect(plan.rationale).toContain("the exercises you've excluded left");
    expect(plan.rationale).not.toContain("your equipment and what's safe to train left");
  });

  it("keeps a priority session on the emphasized area instead of padding with squats", async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        excludedExerciseIds: excludeAllChestExcept(PUSHUP_FAMILY),
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        workoutOptions: { includeWarmup: false, includeConditioning: false, includeCooldown: false },
      }),
    );
    const trainsChest = mainExercises(plan).every((exercise) =>
      exercise.primaryAreas.some((area) => area.group === 'chest'),
    );
    expect(trainsChest).toBe(true);
    expect(plan.rationale).toContain('Kept the whole session on chest');
  });
});

describe('variant families — the redundancy key, narrower than substitutionFamily', () => {
  it('collapses every push-up variant into one family', () => {
    const families = new Set(
      ['pu-pushup', 'pu-incline-pushup', 'pu-decline-pushup', 'pu-wide-pushup', 'pu-diamond-pushup']
        .map((id) => EXERCISES.find((e) => e.id === id)?.variantFamily),
    );
    expect(families.size).toBe(1);
  });

  it('keeps a press apart from a fly, and bodyweight apart from loaded', () => {
    const family = (id: string) => EXERCISES.find((e) => e.id === id)?.variantFamily;
    expect(family('pu-db-bench')).not.toBe(family('pu-db-fly'));
    expect(family('pu-pushup')).not.toBe(family('pu-db-bench'));
    expect(family('pu-db-bench')).not.toBe(family('pu-bb-bench'));
  });

  it('is narrower than substitutionFamily, which lumps all three together', () => {
    // substitutionFamily answers "what can replace what" and is deliberately
    // wide — using it as the redundancy key would cap a chest day at ONE lift.
    const sub = (id: string) => EXERCISES.find((e) => e.id === id)?.substitutionFamily;
    expect(sub('pu-pushup')).toBe(sub('pu-db-bench'));
    expect(sub('pu-pushup')).toBe(sub('pu-db-fly'));
  });

  it('a bench does not split a family — it positions the body, it is not the load', () => {
    const family = (id: string) => EXERCISES.find((e) => e.id === id)?.variantFamily;
    expect(family('pu-incline-pushup')).toBe(family('pu-pushup'));
  });
});

describe('family saturation — penalises repeats without ever excluding them', () => {
  function scoreContext(over: Partial<ScoreContext> = {}): ScoreContext {
    return {
      emphasize: [],
      favorites: new Set(),
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

  const pushup: Exercise = {
    id: 'x-pushup',
    name: 'Push-up variant',
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['chest'],
    equipment: ['bodyweight'],
    progression: 'reps',
    variantFamily: 'horizontal_push:bodyweight:compound',
    description: 'fixture',
    steps: [],
  };
  const press: Exercise = { ...pushup, id: 'x-press', variantFamily: 'horizontal_push:dumbbells:compound' };

  it('prefers a different family once one has been used', () => {
    const ctx = scoreContext({ usedFamilies: new Map([['horizontal_push:bodyweight:compound', 1]]) });
    expect(scoreExercise(press, ctx)).toBeGreaterThan(scoreExercise(pushup, ctx));
  });

  it('escalates with each repeat but saturates rather than growing without bound', () => {
    const once = scoreExercise(pushup, scoreContext({ usedFamilies: new Map([[pushup.variantFamily!, 1]]) }));
    const twice = scoreExercise(pushup, scoreContext({ usedFamilies: new Map([[pushup.variantFamily!, 2]]) }));
    const many = scoreExercise(pushup, scoreContext({ usedFamilies: new Map([[pushup.variantFamily!, 9]]) }));
    expect(twice).toBeLessThan(once);
    expect(many).toBe(twice); // clamped at the full penalty
    expect(once - many).toBeLessThanOrEqual(SELECTION_WEIGHTS.FAMILY_SATURATION);
  });

  it('is outweighed by an explicit emphasis, so a repeat still beats the wrong muscle', () => {
    // This is what keeps "only push-ups" reachable: the penalty reorders chest
    // work, it never lets chest lose to a group the athlete didn't ask for.
    const curl: Exercise = { ...pushup, id: 'x-curl', primaryAreas: ['biceps'], variantFamily: 'curl:dumbbells:isolation' };
    const ctx = scoreContext({
      emphasize: [{ group: 'chest' }],
      usedFamilies: new Map([[pushup.variantFamily!, 3]]),
    });
    expect(scoreExercise(pushup, ctx)).toBeGreaterThan(scoreExercise(curl, ctx));
  });
});

describe('swap clamping — local to the replacement, never a rebuild', () => {
  async function planWithSwap(replacementId: string) {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'balanced' } }),
    );
    const target = mainExercises(plan)[0];
    const next = await engine.adjustDuringSession(
      plan,
      { kind: 'swap', exerciseId: target.exerciseId, replacementExerciseId: replacementId },
      { equipment: HOME_GYM, history: [], experience: 'intermediate' },
    );
    return { plan, next, target };
  }

  it('leaves every other exercise byte-for-byte unchanged', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'balanced' } }),
    );
    const target = mainExercises(plan)[0];
    const alternate = EXERCISES.find(
      (e) =>
        e.id !== target.exerciseId &&
        e.movementSlot === EXERCISES.find((c) => c.id === target.exerciseId)?.movementSlot &&
        e.primaryAreas.some((group) => target.primaryAreas.some((area) => area.group === group)) &&
        e.equipment.every((type) => HOME_GYM.items.some((item) => item.type === type)),
    );
    expect(alternate).toBeDefined();

    const next = await engine.adjustDuringSession(
      plan,
      { kind: 'swap', exerciseId: target.exerciseId, replacementExerciseId: alternate!.id },
      { equipment: HOME_GYM, history: [], experience: 'intermediate' },
    );

    const before = mainExercises(plan).filter((e) => e.exerciseId !== target.exerciseId);
    const after = mainExercises(next).filter((e) => e.exerciseId !== alternate!.id);
    expect(after).toEqual(before);
  });

  it('keeps the session within the ceiling after a swap', async () => {
    const { next } = await planWithSwap('pu-db-bench');
    expect(mainSetsFor(next, 'chest')).toBeLessThanOrEqual(CEILING);
  });
});
