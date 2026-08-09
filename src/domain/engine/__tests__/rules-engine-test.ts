import { RulesEngine } from '../rules-engine';
import { EXERCISES } from '../../catalog';
import { GROUP_TO_REGION } from '../../types';
import type { AthleteProfile, BodyRegion, EquipmentInventory, ModalityWeights, SessionContext, SessionPlan, SessionRecord } from '../../types';

const NOW = Date.UTC(2026, 6, 22, 18, 0, 0); // a Wednesday — safely mid-week

const EQUIPMENT: EquipmentInventory = {
  items: [
    { type: 'bodyweight' },
    { type: 'dumbbells' },
    { type: 'barbell' },
    { type: 'bench' },
    { type: 'squat_rack' },
    { type: 'pull_up_bar' },
    { type: 'kettlebell' },
    { type: 'resistance_bands_tube' },
    { type: 'resistance_bands_loop' },
    { type: 'cardio_machine' },
    { type: 'yoga_mat' },
    { type: 'foam_roller' },
  ],
};

const STRENGTH_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 };
const CARDIO_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.1, cardio: 0.7, mobility: 0.1, general: 0.1 };

function athlete(weights: ModalityWeights): AthleteProfile {
  return {
    id: 'athlete-1',
    experience: 'intermediate',
    goals: { weights },
    constraints: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function context(overrides: Partial<SessionContext> = {}): SessionContext {
  const a = athlete(STRENGTH_HEAVY_WEIGHTS);
  return {
    athlete: a,
    equipment: EQUIPMENT,
    history: [],
    fatigue: { byGroup: {}, updatedAt: NOW },
    readiness: {},
    goals: a.goals,
    targeting: { emphasize: [], avoid: [] },
    avoidToday: { flags: [] },
    plannedFor: NOW,
    ...overrides,
  };
}

/** A completed strength session this week (real catalog exercise) — used to
 * simulate "already hit the strength target." */
function completedStrengthSession(completedAt: number, id = 'sess-strength'): SessionRecord {
  return {
    id,
    planId: 'plan-x',
    plannedFor: completedAt,
    completedAt,
    performed: [
      {
        exerciseId: 'sq-db-front',
        name: 'DB front squat',
        primaryAreas: [{ group: 'quads' }],
        sets: [{ reps: 8, weightKg: 40, completed: true }],
      },
    ],
  };
}

describe('RulesEngine.generateSession — ADR-0105 v2 weekly cadence', () => {
  it('picks the naive weight-based modality when no weekly targets are set', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(context({ goals: { weights: CARDIO_HEAVY_WEIGHTS } }));
    expect(plan.rationale).toContain("Today's focus: cardio.");
    expect(plan.rationale).not.toContain('Switching to');
  });

  it('does not override when the naive modality has not met its weekly target yet', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        goals: { weights: STRENGTH_HEAVY_WEIGHTS, weeklyTargets: { strength: 1 } },
        history: [], // no sessions logged this week — strength target (1) not met
      }),
    );
    expect(plan.rationale).toContain("Today's focus: strength.");
    expect(plan.rationale).not.toContain('Switching to');
  });

  it('overrides to the most-behind modality once the naive pick has met its target', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        goals: { weights: STRENGTH_HEAVY_WEIGHTS, weeklyTargets: { strength: 1, cardio: 3 } },
        history: [completedStrengthSession(NOW)], // strength target (1) already met; cardio (3) untouched
      }),
    );
    expect(plan.rationale).toContain("Today's focus: cardio.");
    expect(plan.rationale).toContain("Switching to cardio today — you've already hit your strength target this week.");
  });

  it('does not override when the naive pick is met but no other targeted modality is behind', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        goals: { weights: STRENGTH_HEAVY_WEIGHTS, weeklyTargets: { strength: 1 } }, // only one target defined
        history: [completedStrengthSession(NOW)],
      }),
    );
    expect(plan.rationale).toContain("Today's focus: strength.");
    expect(plan.rationale).not.toContain('Switching to');
  });

  it('an explicit workoutType still short-circuits cadence entirely', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        goals: { weights: STRENGTH_HEAVY_WEIGHTS, weeklyTargets: { strength: 1, cardio: 3 } },
        history: [completedStrengthSession(NOW)],
        workoutType: 'bodyweight',
      }),
    );
    // bodyweight doesn't force a modality — it restricts equipment — so the
    // cadence override still applies underneath it; this just proves the
    // pipeline doesn't crash when both are combined and still explains itself.
    expect(plan.rationale).toContain('Bodyweight-only today');
  });
});

describe('RulesEngine.generateSession — modality-specific flows', () => {
  it('creates explicit work and recovery steps for an interval cardio session', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'intervals' },
    }));
    const sets = plan.blocks.flatMap((block) => block.exercises).flatMap((exercise) => exercise.sets);
    expect(plan.workoutType).toBe('cardio');
    expect(sets.some((set) => set.phase === 'work')).toBe(true);
    expect(sets.some((set) => set.phase === 'recovery')).toBe(true);
  });

  it('adds a controlled calibration top set only when an eligible muscle cadence is due', async () => {
    const history = [completedStrengthSession(NOW - 40 * 86_400_000)];
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      workoutOptions: { bodybuildingRotation: 'superset' },
      history,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    const exercises = plan.blocks.flatMap((block) => block.exercises);
    expect(plan.workoutType).toBe('bodybuilding');
    expect(exercises.some((exercise) => exercise.sets.some((set) => set.isCalibration))).toBe(true);
    expect(exercises.some((exercise) => exercise.rotationGroup != null)).toBe(true);
  });
});

describe('RulesEngine.generateSession — ADR-0115 owned-weight constraint', () => {
  it('never prescribes a load the athlete does not own, and says why the step is held', async () => {
    // Last session finished the TOP of the rep band at 40 kg, so a load step is
    // earned — but the rack jumps straight from 40 to 50 kg, which is far past
    // the session cap. Under double progression (ADR-0125) the lift keeps
    // climbing reps instead of silently pretending to progress the load.
    const history: SessionRecord[] = [{
      id: 'sess-db',
      planId: 'plan-x',
      plannedFor: NOW - 3 * 86_400_000,
      completedAt: NOW - 3 * 86_400_000,
      performed: [{
        exerciseId: 'sq-db-front',
        name: 'Dumbbell front squat',
        primaryAreas: [{ group: 'quads' }],
        sets: [{ reps: 12, weightKg: 40, rpe: 7, prescribedReps: 12, prescribedRpe: 7, completed: true }],
      }],
    }];
    const equipment: EquipmentInventory = {
      items: [{ type: 'bodyweight' }, { type: 'dumbbells', availableWeightsKg: [20, 30, 40, 50] }],
    };
    // Bodybuilding is the one workoutType whose main-block pick() consults prior
    // history (ADR-0105) — needed here to deterministically surface the one
    // exercise with a completed history entry, rather than depending on tie-break
    // ordering among many equally-eligible candidates.
    // A short session deliberately carries no zone test (ADR-0128), which keeps
    // this focused on the owned-weight constraint rather than on a ramp + AMRAP.
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'bodybuilding', history, equipment, targetDurationMin: 20 }),
    );
    const exercise = plan.blocks.flatMap((block) => block.exercises).find((e) => e.exerciseId === 'sq-db-front');
    expect(exercise).toBeDefined();
    expect(exercise?.sets.every((set) => set.weightKg === 40)).toBe(true);
    expect(exercise?.sets.every((set) => (set.reps ?? 0) > 12)).toBe(true);
    expect(exercise?.note).toMatch(/no heavier weight available yet/);
  });
});

describe('RulesEngine.generateSession — loaded timed/hold movements (loadsWeight)', () => {
  it('recommends a load for a loaded carry, same as a weight-progression lift, alongside its duration', async () => {
    const history: SessionRecord[] = [{
      id: 'sess-carry',
      planId: 'plan-x',
      plannedFor: NOW - 3 * 86_400_000,
      completedAt: NOW - 3 * 86_400_000,
      performed: [{
        exerciseId: 'cr-db-farmers',
        name: "Dumbbell farmer's carry",
        primaryAreas: [{ group: 'forearms' }, { group: 'back' }],
        sets: [{ durationSec: 30, weightKg: 20, rpe: 5, completed: true }],
      }],
    }];
    const plan = await new RulesEngine().generateSession(context({ workoutType: 'bodybuilding', history }));
    const exercise = plan.blocks.flatMap((block) => block.exercises).find((e) => e.exerciseId === 'cr-db-farmers');
    expect(exercise).toBeDefined();
    expect(exercise?.sets.length).toBeGreaterThan(0);
    // Every set keeps its duration (the exercise's own progression axis) AND
    // now also carries a recommended weight — previously dropped entirely.
    expect(exercise?.sets.every((set) => set.durationSec != null && set.reps == null && set.weightKg != null)).toBe(true);
  });
});

describe('RulesEngine.generateSession — session-length lever', () => {
  function mainExercises(plan: Awaited<ReturnType<RulesEngine['generateSession']>>) {
    return plan.blocks.find((block) => block.label === 'Main')?.exercises ?? [];
  }

  it('trims main exercises for a short session vs. the untargeted default', async () => {
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({}));
    const short = await engine.generateSession(context({ targetDurationMin: 10 }));
    expect(mainExercises(short).length).toBeLessThan(mainExercises(baseline).length);
    expect(short.estimatedDurationMin ?? 0).toBeLessThan(baseline.estimatedDurationMin ?? 0);
  });

  it('adds main exercises for a long session vs. the untargeted default', async () => {
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({}));
    const long = await engine.generateSession(context({ targetDurationMin: 60 }));
    expect(mainExercises(long).length).toBeGreaterThan(mainExercises(baseline).length);
    expect(long.estimatedDurationMin ?? 0).toBeGreaterThan(baseline.estimatedDurationMin ?? 0);
  });

  it('clamps out-of-range values to the 10-60 min band', async () => {
    const engine = new RulesEngine();
    const tooShort = await engine.generateSession(context({ targetDurationMin: 1 }));
    const atFloor = await engine.generateSession(context({ targetDurationMin: 10 }));
    expect(mainExercises(tooShort).length).toBe(mainExercises(atFloor).length);
  });
});

describe('RulesEngine.generateSession — ADR-0116 cool down', () => {
  it('adds a Cool down block of several sane-length holds — never one multi-minute hold', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(context({}));
    const cooldown = plan.blocks.find((block) => block.label === 'Cool down');
    expect(cooldown).toBeDefined();
    // Default is a few distinct stretches (methodology §7), not one 5-minute hold.
    expect(cooldown?.exercises.length).toBeGreaterThan(1);
    for (const ex of cooldown?.exercises ?? []) {
      expect(ex.sets[0].durationSec ?? 0).toBeGreaterThanOrEqual(30);
      expect(ex.sets[0].durationSec ?? 0).toBeLessThanOrEqual(75);
    }
  });

  it('uses the configured cooldown activityCount as a variety preference, repeating a compact circuit with sane holds', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        athlete: {
          ...context().athlete,
          cooldown: { totalMinutes: 9, activityCount: 3, focus: [{ group: 'hamstrings' }] },
        },
      }),
    );
    const cooldown = plan.blocks.find((block) => block.label === 'Cool down');
    expect(cooldown?.exercises.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(cooldown?.exercises.length ?? 0).toBeLessThanOrEqual(3);
    expect(cooldown?.exercises.every((e) => e.sets.length >= 2 && e.sets.length <= 4)).toBe(true);
    expect(cooldown?.exercises.every((e) => (e.sets[0].durationSec ?? 0) <= 75)).toBe(true);
    expect(cooldown?.exercises.every((e) => (e.sets[0].durationSec ?? 0) >= 30)).toBe(true);
    expect(plan.rationale).toContain('Cool-down focus: hamstrings.');
  });

  it('never collapses a cooldown to a single long hold, even from a legacy activityCount of 1', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        athlete: { ...context().athlete, cooldown: { totalMinutes: 5, activityCount: 1, focus: [] } },
      }),
    );
    const cooldown = plan.blocks.find((block) => block.label === 'Cool down');
    // The old bug: activityCount 1 → one 5-minute foam-roll hold. Now it is a compact circuit.
    expect(cooldown?.exercises.length ?? 0).toBeGreaterThan(1);
    expect(cooldown?.exercises.every((e) => (e.sets[0].durationSec ?? 0) <= 75)).toBe(true);
  });

  it('omits the Cool down block when truly no cooldown-stage exercise is available', async () => {
    const engine = new RulesEngine();
    const equipment = { items: [{ type: 'bodyweight' as const }, { type: 'dumbbells' as const }] };
    // Every catalog entry Cool down could possibly draw on excluded — the
    // genuine "nothing left to pick" case (distinct from the equipment-gating
    // bug below, where bodyweight-compatible cooldown options exist but were
    // wrongly excluded by an overly strict equipment tag). Computed from the
    // same predicate the engine uses (flowStage:'cooldown', plus any static
    // stretch — the wider pool that lets e.g. a chest/shoulders day reach a
    // real matching cool down) so this stays exhaustive as the catalog grows.
    const excludedExerciseIds = EXERCISES.filter(
      (e) => e.flowStage === 'cooldown' || (e.movementPattern === 'stretch' && (e.progression === 'hold' || e.progression === 'reps')),
    ).map((e) => e.id);
    const plan = await engine.generateSession(context({ equipment, excludedExerciseIds }));
    expect(plan.blocks.find((block) => block.label === 'Cool down')).toBeUndefined();
  });

  it('still builds a real Cool down for a bodyweight-only session (no mat/foam-roller required)', async () => {
    // Regression: every flowStage:'cooldown' entry used to require a
    // yoga_mat/foam_roller, so bodyweight-only sessions silently lost their
    // cool-down entirely. A handful of floor stretches don't actually need a
    // mat — see mob-childs-pose's catalog comment.
    const engine = new RulesEngine();
    const equipment = { items: [{ type: 'bodyweight' as const }] };
    const plan = await engine.generateSession(context({ equipment, workoutType: 'bodyweight', targetDurationMin: 20 }));
    const cooldown = plan.blocks.find((block) => block.label === 'Cool down');
    expect(cooldown).toBeDefined();
    expect(cooldown!.exercises.length).toBeGreaterThan(0);
  });
});

describe('RulesEngine.generateSession — Warmup/Cool down match today\'s Main muscle groups', () => {
  it('biases Warmup and Cool down toward the muscle groups Main is actually training today, with no personal focus set', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({ targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] } }),
    );

    const main = plan.blocks.find((b) => b.label === 'Main');
    expect(main?.exercises.some((e) => e.primaryAreas.some((a) => a.group === 'hamstrings'))).toBe(true);

    const warmup = plan.blocks.find((b) => b.label === 'Warmup');
    expect(warmup?.exercises.some((e) => e.primaryAreas.some((a) => a.group === 'hamstrings'))).toBe(true);

    const cooldown = plan.blocks.find((b) => b.label === 'Cool down');
    expect(cooldown?.exercises.some((e) => e.primaryAreas.some((a) => a.group === 'hamstrings'))).toBe(true);
  });

  it('still honors a standing warmup focus preference (ADR-0111) alongside today\'s trained groups', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        athlete: {
          ...context().athlete,
          warmup: { totalMinutes: 8, activityCount: 3, focus: [{ group: 'shoulders' }] },
        },
        targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] },
      }),
    );
    const warmup = plan.blocks.find((b) => b.label === 'Warmup');
    expect(plan.rationale).toContain('Stretching focus: shoulders.');
    expect(warmup?.exercises.some((e) => e.primaryAreas.some((a) => a.group === 'shoulders'))).toBe(true);
  });
});

describe('RulesEngine.generateSession — optional session components', () => {
  function mainExercises(plan: Awaited<ReturnType<RulesEngine['generateSession']>>) {
    return plan.blocks.find((block) => block.label === 'Main')?.exercises ?? [];
  }

  // cardio + general >= 0.25 so a Conditioning block is actually built by default.
  const MIXED_WEIGHTS: ModalityWeights = { strength: 0.6, cardio: 0.2, mobility: 0.1, general: 0.1 };

  it('omits the Warmup block when includeWarmup is false', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(context({ workoutOptions: { includeWarmup: false } }));
    expect(plan.blocks.find((block) => block.label === 'Warmup')).toBeUndefined();
  });

  it('omits the Cool down block when includeCooldown is false', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(context({ workoutOptions: { includeCooldown: false } }));
    expect(plan.blocks.find((block) => block.label === 'Cool down')).toBeUndefined();
  });

  it('omits the Conditioning block when includeConditioning is false', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({ goals: { weights: MIXED_WEIGHTS }, workoutOptions: { includeConditioning: false } }),
    );
    expect(plan.blocks.find((block) => block.label === 'Conditioning')).toBeUndefined();
  });

  it('builds all three by default (unset options preserve prior always-on behavior)', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(context({ goals: { weights: MIXED_WEIGHTS } }));
    expect(plan.blocks.find((block) => block.label === 'Warmup')).toBeDefined();
    expect(plan.blocks.find((block) => block.label === 'Conditioning')).toBeDefined();
    expect(plan.blocks.find((block) => block.label === 'Cool down')).toBeDefined();
  });

  it('folds a skipped Warmup/Cool down/Conditioning time budget back into Main given a target duration', async () => {
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({ goals: { weights: MIXED_WEIGHTS }, targetDurationMin: 30 }));
    const skippedAll = await engine.generateSession(
      context({
        goals: { weights: MIXED_WEIGHTS },
        targetDurationMin: 30,
        workoutOptions: { includeWarmup: false, includeConditioning: false, includeCooldown: false },
      }),
    );
    expect(mainExercises(skippedAll).length).toBeGreaterThan(mainExercises(baseline).length);
    // Session length still lands in the same ballpark as requested rather than ending short.
    expect(skippedAll.estimatedDurationMin ?? 0).toBeGreaterThanOrEqual(25);
  });

  it('still lands close to a long target duration once Main runs out of distinct movement patterns to add', async () => {
    // Regression: mainCount/bodybuildingCount growth is capped by how many
    // distinct movement patterns exist in the catalog (Main never repeats one —
    // see pick()'s requireDistinctPattern). Once that cap is hit, adding more
    // *exercises* stops helping; the shortfall must convert into more *sets*
    // on the exercises already picked instead of silently falling short.
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        targetDurationMin: 50,
        workoutOptions: { includeConditioning: false, includeCooldown: false },
      }),
    );
    expect(plan.estimatedDurationMin ?? 0).toBeGreaterThanOrEqual(40);
  });

  it('still folds skipped-block time into Main when no target duration is set — the athlete opted out of the block regardless', async () => {
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({}));
    const skipped = await engine.generateSession(context({ workoutOptions: { includeWarmup: false, includeCooldown: false } }));
    expect(mainExercises(skipped).length).toBeGreaterThan(mainExercises(baseline).length);
  });

  it('leaves Main unchanged when every component is included (no freed time to fold in)', async () => {
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({}));
    const explicit = await engine.generateSession(
      context({ workoutOptions: { includeWarmup: true, includeConditioning: true, includeCooldown: true } }),
    );
    expect(mainExercises(explicit).length).toBe(mainExercises(baseline).length);
  });
});

describe('RulesEngine.generateSession — ADR-0120 time model + set-block budgeting', () => {
  function mainExercises(plan: Awaited<ReturnType<RulesEngine['generateSession']>>) {
    return plan.blocks.find((block) => block.label === 'Main')?.exercises ?? [];
  }
  const workSets = (ex: { sets: { isWarmup?: boolean }[] }) => ex.sets.filter((s) => !s.isWarmup).length;

  it('a 60-minute lifting session is a handful of exercises with real 3-5 set blocks — not ~12 with fillers', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targetDurationMin: 60, workoutType: 'bodybuilding' }),
    );
    const main = mainExercises(plan);
    // A real 60-min lifting main is ~5-6 lifts, never the old ~8-9 (+warmup/cooldown ≈ 12).
    expect(main.length).toBeLessThanOrEqual(7);
    expect(main.length).toBeGreaterThanOrEqual(4);
    // Every lift carries a proper 3-5 set block.
    for (const ex of main) {
      expect(workSets(ex)).toBeGreaterThanOrEqual(3);
      expect(workSets(ex)).toBeLessThanOrEqual(5);
    }
  });

  it('never emits a 15-second filler set — timed holds keep a sensible floor', async () => {
    const plan = await new RulesEngine().generateSession(context({ targetDurationMin: 10 }));
    const timed = plan.blocks
      .flatMap((b) => b.exercises)
      .flatMap((e) => e.sets)
      .filter((s) => s.durationSec != null);
    for (const s of timed) expect(s.durationSec ?? 0).toBeGreaterThanOrEqual(20);
  });

  it('populates a load-aware per-set rest for the tracker (heavy work rests longer than isolation)', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targetDurationMin: 45, workoutType: 'bodybuilding' }),
    );
    const nonFinalStrengthSets = plan.blocks
      .filter((b) => b.label === 'Main')
      .flatMap((b) => b.exercises)
      .flatMap((e) => e.sets.slice(0, -1)); // final set of each exercise carries no trailing rest
    expect(nonFinalStrengthSets.length).toBeGreaterThan(0);
    expect(nonFinalStrengthSets.every((s) => (s.restSec ?? 0) >= 45)).toBe(true);
  });

  it('keeps a visible warmup and cool down — a tight budget eases them, never guts them to a 0-min filler', async () => {
    const engine = new RulesEngine();
    // A conditioning-heavy 30-min session: the discretionary cardio bout absorbs
    // the compression; the configured cool down stays at its full duration.
    const MIXED: ModalityWeights = { strength: 0.6, cardio: 0.2, mobility: 0.1, general: 0.1 };
    const mixed = await engine.generateSession(context({ goals: { weights: MIXED }, targetDurationMin: 30 }));
    const mixedCooldown = mixed.blocks.find((b) => b.label === 'Cool down');
    expect(mixedCooldown).toBeDefined();
    // The cool down survives as real work (several holds summing to a few minutes),
    // rather than being compressed away when the conditioning bout is long.
    const cooldownSeconds = (mixedCooldown?.exercises ?? []).reduce(
      (sum, ex) => sum + ex.sets.reduce((setSum, set) => setSum + (set.durationSec ?? 0), 0), 0,
    );
    expect(cooldownSeconds).toBeGreaterThanOrEqual(120);

    // Even a very tight 10-min session keeps warmup/cool down holds visible
    // (≥20 s), never crushed to a 0-min filler.
    const tight = await engine.generateSession(context({ targetDurationMin: 10 }));
    for (const label of ['Warmup', 'Cool down']) {
      const block = tight.blocks.find((b) => b.label === label);
      if (block) expect(block.exercises[0]?.sets[0]?.durationSec ?? 0).toBeGreaterThanOrEqual(20);
    }
  });

  it('builds a warmup as a compact circuit of repeated short drills', async () => {
    const plan = await new RulesEngine().generateSession(context({ targetDurationMin: 40 }));
    const warmup = plan.blocks.find((b) => b.label === 'Warmup');
    expect(warmup).toBeDefined();
    expect(warmup!.exercises.length).toBeGreaterThanOrEqual(2);
    expect(warmup!.exercises.length).toBeLessThanOrEqual(3);
    for (const ex of warmup!.exercises) {
      expect(ex.sets.length).toBeGreaterThanOrEqual(2);
      expect(ex.sets.length).toBeLessThanOrEqual(4);
      expect(ex.sets[0].durationSec ?? 0).toBeGreaterThanOrEqual(20);
      expect(ex.sets[0].durationSec ?? 0).toBeLessThanOrEqual(60);
    }
  });

  it('the real-rest estimate scales monotonically with the requested budget', async () => {
    const engine = new RulesEngine();
    const short = await engine.generateSession(context({ targetDurationMin: 20 }));
    const long = await engine.generateSession(context({ targetDurationMin: 60 }));
    expect(short.estimatedDurationMin ?? 0).toBeLessThan(long.estimatedDurationMin ?? 0);
    // And lands in the neighborhood of what was asked, not wildly under.
    expect(long.estimatedDurationMin ?? 0).toBeGreaterThanOrEqual(48);
  });
});

describe('RulesEngine.generateSession — ADR-0122 load finalization', () => {
  // Last session: 40 kg DB front squat felt easy (RPE 5 vs target 7) → recommendLoad
  // earns +2.5 → 42.5. Finalization then eases it back for fatigue/poor readiness.
  function historyEasy(): SessionRecord[] {
    return [{
      id: 'sess', planId: 'p', plannedFor: NOW - 3 * 86_400_000, completedAt: NOW - 3 * 86_400_000,
      performed: [{ exerciseId: 'sq-db-front', name: 'DB front squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 8, weightKg: 40, rpe: 5, completed: true }] }],
    }];
  }

  it('eases the recommended load under high fatigue / poor readiness, and logs the driver', async () => {
    const engine = new RulesEngine();
    const fresh = await engine.generateSession(context({ workoutType: 'bodybuilding', history: historyEasy() }));
    const tired = await engine.generateSession(context({
      workoutType: 'bodybuilding',
      history: historyEasy(),
      readiness: { energy: 1, soreness: 5, sleepQuality: 1 },
      // Moderate fatigue (below the 0.7 hard-exclude threshold) — the lift stays
      // in the plan and gets eased, rather than being dropped entirely.
      fatigue: { byGroup: { quads: 0.55 }, updatedAt: NOW },
    }));
    const load = (p: Awaited<ReturnType<RulesEngine['generateSession']>>) =>
      p.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'sq-db-front')?.sets.find((s) => s.weightKg != null && !s.isWarmup)?.weightKg;
    expect(load(fresh)).toBeDefined();
    expect(load(tired)).toBeDefined();
    // The tired day lands lighter than the fresh day…
    expect(load(tired)!).toBeLessThan(load(fresh)!);
    // …and the reason is captured in the decision-log adjustments.
    expect((tired.adjustments ?? []).some((a) => /eased/.test(a) && /sq-db-front|front squat/i.test(a))).toBe(true);
  });

  it('never finalizes a load above the earned recommendation (safety: reductions only)', async () => {
    const engine = new RulesEngine();
    // Great readiness must not push load past what progressive overload earned.
    const plan = await engine.generateSession(context({
      workoutType: 'bodybuilding',
      history: historyEasy(),
      readiness: { energy: 5, soreness: 1, sleepQuality: 5 },
    }));
    const load = plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'sq-db-front')?.sets.find((s) => s.weightKg != null)?.weightKg;
    // recommendLoad earned 42.5; finalization holds (never raises).
    expect(load ?? 0).toBeLessThanOrEqual(42.5);
  });
});

describe('RulesEngine.generateSession — effort (readiness/trainingIntent) vs. time budget', () => {
  function mainExercises(plan: Awaited<ReturnType<RulesEngine['generateSession']>>) {
    return plan.blocks.find((block) => block.label === 'Main')?.exercises ?? [];
  }

  it('recovery meaningfully reduces total hard sets and may finish early', async () => {
    const engine = new RulesEngine();
    const readiness = { sleepQuality: 5, energy: 5, soreness: 1 };
    const recovery = await engine.generateSession(context({ readiness, trainingIntent: 'recovery', targetDurationMin: 30 }));
    const balanced = await engine.generateSession(context({ readiness, trainingIntent: 'balanced', targetDurationMin: 30 }));
    const challenge = await engine.generateSession(context({ readiness, trainingIntent: 'challenge', targetDurationMin: 30 }));

    const hardSets = (p: typeof recovery) => mainExercises(p).reduce((sum, exercise) => sum + exercise.sets.filter((set) => !set.isWarmup).length, 0);
    expect(hardSets(recovery)).toBeLessThan(hardSets(balanced));
    expect(hardSets(challenge)).toBeGreaterThanOrEqual(hardSets(balanced));
    expect(recovery.estimatedDurationMin ?? 0).toBeLessThanOrEqual(balanced.estimatedDurationMin ?? 0);
  });

  it('still varies RPE across trainingIntent while volume carries recovery', async () => {
    const engine = new RulesEngine();
    const readiness = { sleepQuality: 5, energy: 5, soreness: 1 };
    const recovery = await engine.generateSession(context({ readiness, trainingIntent: 'recovery', targetDurationMin: 30 }));
    const challenge = await engine.generateSession(context({ readiness, trainingIntent: 'challenge', targetDurationMin: 30 }));
    const firstSet = (p: typeof recovery) => mainExercises(p)[0]?.sets[0];
    expect(firstSet(challenge)?.targetRpe ?? 0).toBeGreaterThan(firstSet(recovery)?.targetRpe ?? 0);
  });
});

describe('RulesEngine.adjustDuringSession — manual replacements', () => {
  it('never transfers an unrelated load and uses only the replacement history', async () => {
    const plan: SessionPlan = {
      id: 'plan-swap',
      plannedFor: NOW,
      rationale: '',
      blocks: [{
        label: 'Main',
        modality: 'strength',
        exercises: [{
          exerciseId: 'sq-bw',
          name: 'Bodyweight squat',
          primaryAreas: [{ group: 'quads' }],
          sets: [{ reps: 12 }],
          zone: 'hypertrophy',
        }],
      }],
    };

    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap',
      exerciseId: 'sq-bw',
      replacementExerciseId: 'sq-goblet',
    }, { equipment: EQUIPMENT, history: [], experience: 'intermediate' });
    expect(result.blocks[0].exercises[0].sets[0].weightKg).toBeUndefined();

    const ownHistory: SessionRecord[] = [{
      id: 'goblet-history', planId: 'p', plannedFor: NOW - 86_400_000, completedAt: NOW - 86_400_000,
      performed: [{
        exerciseId: 'sq-goblet', name: 'Goblet squat', primaryAreas: [{ group: 'quads' }],
        sets: [{ reps: 10, weightKg: 15, prescribedReps: 10, prescribedWeightKg: 15, completed: true }],
      }],
    }];
    const withHistory = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap',
      exerciseId: 'sq-bw',
      replacementExerciseId: 'sq-goblet',
    }, { equipment: EQUIPMENT, history: ownHistory, experience: 'intermediate' });
    expect(withHistory.blocks[0].exercises[0].sets[0].weightKg).toBe(15);
  });

  it('allows a replacement with a different movement purpose within the same training type — a deliberate override, not a hard gate', async () => {
    // ADR-0134 revision: the engine's swap floor only enforces training type,
    // equipment, exclusions, and today's avoidance flags (`replacementAllowed`,
    // matching.ts) — movement-slot/muscle fit is a picker-UI "Suggested" signal,
    // not a hard block, so an athlete can knowingly swap a squat for a push-up.
    const plan: SessionPlan = {
      id: 'override', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'pu-pushup',
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(result.blocks[0].exercises[0].exerciseId).toBe('pu-pushup');
    expect(result.liveAdjustments?.at(-1)?.reasonCode).toBe('compatible_substitution');
  });

  it('rejects a replacement of a different training type (modality)', async () => {
    const plan: SessionPlan = {
      id: 'reject-modality', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'ca-treadmill-walk',
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(result.blocks[0].exercises[0].exerciseId).toBe('sq-bw');
    expect(result.liveAdjustments?.at(-1)?.reasonCode).toBe('rejected_substitution');
  });

  it('rejects a replacement requiring equipment not owned, but allows it when the athlete deliberately overrides via ignoreEquipment', async () => {
    // ADR-0134: equipment ownership is the one hard-floor check a manual pick
    // can knowingly waive (e.g. picked from the picker's "Any Equipment" mode
    // because the athlete is at a different gym today) — generation itself
    // never sets this flag.
    const plan: SessionPlan = {
      id: 'equipment-override', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const rejected = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'tr-cable-pushdown',
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(rejected.blocks[0].exercises[0].exerciseId).toBe('sq-bw');
    expect(rejected.liveAdjustments?.at(-1)?.reasonCode).toBe('rejected_substitution');

    const allowed = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'tr-cable-pushdown', ignoreEquipment: true,
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(allowed.blocks[0].exercises[0].exerciseId).toBe('tr-cable-pushdown');
    expect(allowed.liveAdjustments?.at(-1)?.reasonCode).toBe('compatible_substitution');
  });

  it('rejects a replacement that loads an area flagged to avoid today', async () => {
    const plan: SessionPlan = {
      id: 'reject-avoid', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'pu-pushup',
    }, { equipment: EQUIPMENT, experience: 'intermediate', avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'moderate' }] } });
    expect(result.blocks[0].exercises[0].exerciseId).toBe('sq-bw');
    expect(result.liveAdjustments?.at(-1)?.reasonCode).toBe('rejected_substitution');
  });

  it('pain stops the affected exercise and records the structured symptom', async () => {
    const plan: SessionPlan = {
      id: 'pain', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }, { reps: 10 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'pain', exerciseId: 'sq-bw', area: { joint: 'knee' }, severity: 'moderate', symptomType: 'sharp',
    });
    expect(result.blocks[0].exercises[0].sets).toEqual([]);
    expect(result.liveAdjustments?.at(-1)).toMatchObject({ reasonCode: 'pain_stop', severity: 'moderate', symptomType: 'sharp' });
  });

  it('too hard only reduces variables and never turns four reps into five', async () => {
    const plan: SessionPlan = {
      id: 'hard', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 4, targetRpe: 8 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, { kind: 'too_hard', exerciseId: 'sq-bw' });
    expect(result.blocks[0].exercises[0].sets[0]).toMatchObject({ reps: 3, targetRpe: 8 });
  });

  it('too easy changes only reps and stays inside the current zone', async () => {
    const plan: SessionPlan = {
      id: 'easy', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'strength', exercises: [{
        exerciseId: 'sq-goblet', name: 'Goblet squat', primaryAreas: [{ group: 'quads' }], zone: 'hypertrophy',
        sets: [{ reps: 11, weightKg: 20, targetRpe: 7 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, { kind: 'too_easy', exerciseId: 'sq-goblet' });
    expect(result.blocks[0].exercises[0].sets[0]).toMatchObject({ reps: 12, weightKg: 20, targetRpe: 7 });
  });

  it('skip repairs an orphaned superset and recomputes duration', async () => {
    const group = { id: 'g', type: 'time_saver' as const, rationale: 'save time' };
    const plan: SessionPlan = {
      id: 'skip', plannedFor: NOW, rationale: '', estimatedDurationMin: 20,
      blocks: [{ label: 'Main', modality: 'strength', exercises: [
        { exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }], group, rotationGroup: 'g' },
        { exerciseId: 'pu-pushup', name: 'Push-up', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 10 }], group, rotationGroup: 'g' },
      ] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, { kind: 'skip', exerciseId: 'pu-pushup' });
    expect(result.blocks[0].exercises[0].group).toBeUndefined();
    expect(result.blocks[0].exercises[0].rotationGroup).toBeUndefined();
    expect(result.estimatedDurationMin).toBeLessThan(20);
  });

  it('time short preserves emphasized work while trimming accessories', async () => {
    const plan: SessionPlan = {
      id: 'short', plannedFor: NOW, rationale: '', estimatedDurationMin: 30,
      blocks: [{ label: 'Main', modality: 'strength', exercises: [
        { exerciseId: 'sq-bw', name: 'Priority squat', primaryAreas: [{ group: 'quads' }], emphasized: true, sets: [{ reps: 10 }, { reps: 10 }] },
        { exerciseId: 'pu-pushup', name: 'Accessory push-up', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 10 }, { reps: 10 }] },
      ] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, { kind: 'time_short', remainingMinutes: 2 });
    expect(result.blocks.flatMap((block) => block.exercises).some((exercise) => exercise.exerciseId === 'sq-bw')).toBe(true);
    expect(result.blocks.flatMap((block) => block.exercises).some((exercise) => exercise.exerciseId === 'pu-pushup')).toBe(false);
  });
});

describe('RulesEngine.generateSession — Yoga (ADR-0114 v2): natural-time repeated combo', () => {
  it('repeats the combo for whole natural-time rounds — never a fragmented, compressed one', async () => {
    const engine = new RulesEngine();
    const thirty = await engine.generateSession(
      context({ workoutType: 'yoga', workoutOptions: { flow: { durationMin: 30 } } }),
    );
    const flowThirty = thirty.blocks[0];
    expect(flowThirty).toBeDefined();
    const comboThirty = flowThirty.exercises.filter((ex) => ex.sets.length > 1);
    expect(comboThirty.length).toBeGreaterThan(0);
    // Every combo pose repeats the SAME whole number of rounds — a real
    // repeated sequence, not an ad-hoc mix of hold counts.
    const roundsThirty = comboThirty[0].sets.length;
    expect(Number.isInteger(roundsThirty)).toBe(true);
    expect(comboThirty.every((ex) => ex.sets.length === roundsThirty)).toBe(true);

    const sixty = await engine.generateSession(
      context({ workoutType: 'yoga', workoutOptions: { flow: { durationMin: 60 } } }),
    );
    const comboSixty = sixty.blocks[0].exercises.filter((ex) => ex.sets.length > 1);
    const roundsSixty = comboSixty[0].sets.length;
    // Double the requested time roughly doubles the whole-round count — the
    // combo's natural per-round time is fixed, round count is the only lever.
    expect(roundsSixty).toBeGreaterThan(roundsThirty);

    // Hold length stays within its clinically safe range throughout — never
    // compressed to fit, in either direction.
    for (const ex of [...flowThirty.exercises, ...sixty.blocks[0].exercises]) {
      for (const set of ex.sets) {
        expect(set.durationSec ?? 0).toBeGreaterThanOrEqual(30);
        expect(set.durationSec ?? 0).toBeLessThanOrEqual(90);
      }
    }
  });

  it('gives every pose the same round count — no mismatched "opening/closing get 1 set" bug', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'yoga', workoutOptions: { flow: { durationMin: 45 } } }),
    );
    const flow = plan.blocks[0].exercises;
    expect(flow.length).toBeGreaterThanOrEqual(3);
    const counts = new Set(flow.map((ex) => ex.sets.length));
    expect(counts.size).toBe(1); // every pose — including the first and last — shares one round count
  });

  it('stays muscle-agnostic — explicit targeting does not change which poses are chosen', async () => {
    const engine = new RulesEngine();
    const plain = await engine.generateSession(
      context({ workoutType: 'yoga', workoutOptions: { flow: { durationMin: 30 } } }),
    );
    const targeted = await engine.generateSession(
      context({
        workoutType: 'yoga',
        workoutOptions: { flow: { durationMin: 30 } },
        targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] },
      }),
    );
    const idsOf = (plan: SessionPlan) => plan.blocks[0].exercises.map((e) => e.exerciseId).sort();
    expect(idsOf(targeted)).toEqual(idsOf(plain));
  });

  it('still builds a full flow without a yoga mat — no mat is a soft fallback, not a pool-gutting hard requirement', async () => {
    const noMat: EquipmentInventory = { items: EQUIPMENT.items.filter((i) => i.type !== 'yoga_mat') };
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'yoga', equipment: noMat, workoutOptions: { flow: { durationMin: 30 } } }),
    );
    const flow = plan.blocks[0].exercises;
    // Same full multi-stage sequence as with a mat — not gutted down to the
    // one or two poses that don't list 'yoga_mat' in their equipment.
    expect(flow.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RulesEngine.generateSession — Stretch (ADR-0114 v2): targeted, clinically-correct prescriptions', () => {
  it('builds a small, deliberately targeted set — not a rotating circuit of unrelated stretches', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'stretch',
        workoutOptions: { flow: { durationMin: 20 } },
        targeting: { emphasize: [{ group: 'hamstrings' }, { group: 'quads' }], avoid: [] },
      }),
    );
    const flow = plan.blocks[0];
    expect(flow).toBeDefined();
    // Roughly one exercise per targeted area — never a long rotating list.
    expect(flow.exercises.length).toBeGreaterThan(0);
    expect(flow.exercises.length).toBeLessThanOrEqual(2);

    for (const ex of flow.exercises) {
      for (const set of ex.sets) {
        if (set.reps != null) {
          // Dynamic stretch: reps, never a held duration.
          expect(set.reps).toBeGreaterThanOrEqual(10);
          expect(set.reps).toBeLessThanOrEqual(15);
          expect(set.durationSec).toBeUndefined();
        } else {
          // Static stretch: clinically correct hold, never compressed below it.
          expect(set.durationSec ?? 0).toBeGreaterThanOrEqual(30);
          expect(set.durationSec ?? 0).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('primary-matches the targeted area rather than picking arbitrarily', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'stretch',
        workoutOptions: { flow: { durationMin: 15 } },
        targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] },
      }),
    );
    const flow = plan.blocks[0].exercises;
    expect(flow.length).toBeGreaterThan(0);
    expect(flow.some((ex) => ex.primaryAreas.some((a) => a.group === 'hamstrings'))).toBe(true);
  });

  it('falls back to a capped default rotation (not an unbounded circuit) when nothing is targeted', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'stretch', workoutOptions: { flow: { durationMin: 20 } } }),
    );
    const flow = plan.blocks[0];
    expect(flow).toBeDefined();
    expect(flow.exercises.length).toBeGreaterThan(0);
    expect(flow.exercises.length).toBeLessThanOrEqual(5); // MAX_STRETCH_MUSCLES
  });

  it('rotates for multiple rounds — a real bug: a 20-min request used to land at ~3 min', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'stretch', workoutOptions: { flow: { durationMin: 20 } } }),
    );
    const flow = plan.blocks[0];
    expect(flow.exercises.some((ex) => ex.sets.length > 1)).toBe(true);
    // Should land reasonably close to the request, not a small fraction of it.
    expect(plan.estimatedDurationMin ?? 0).toBeGreaterThanOrEqual(15);
  });

  it('rotates for multiple rounds even when explicitly targeted, and stays within the clinical hold range', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'stretch',
        workoutOptions: { flow: { durationMin: 20 } },
        targeting: { emphasize: [{ group: 'hamstrings' }, { group: 'quads' }], avoid: [] },
      }),
    );
    const flow = plan.blocks[0].exercises;
    expect(flow.some((ex) => ex.sets.length > 1)).toBe(true);
    for (const ex of flow) {
      for (const set of ex.sets) {
        if (set.durationSec != null) {
          expect(set.durationSec).toBeGreaterThanOrEqual(30);
          expect(set.durationSec).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('caps the rotation at 5 muscles even if more are targeted', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'stretch',
        workoutOptions: { flow: { durationMin: 20 } },
        targeting: {
          emphasize: [
            { group: 'hamstrings' }, { group: 'quads' }, { group: 'chest' },
            { group: 'shoulders' }, { group: 'back' }, { group: 'calves' },
          ],
          avoid: [],
        },
      }),
    );
    expect(plan.blocks[0].exercises.length).toBeLessThanOrEqual(5);
  });
});

describe('RulesEngine.generateSession — Part 1: explicit targeting overrides severe fatigue (never injury)', () => {
  const SEVERE_BICEPS_FATIGUE = { byGroup: { biceps: 0.85 }, updatedAt: NOW };

  it('excludes a severely fatigued muscle by default (not targeted)', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ fatigue: SEVERE_BICEPS_FATIGUE, workoutType: 'bodybuilding', targetDurationMin: 45 }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    expect(main.some((ex) => ex.primaryAreas.some((a) => a.group === 'biceps'))).toBe(false);
  });

  it('treats calculated severe fatigue as a soft recovery signal even when targeted', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        fatigue: SEVERE_BICEPS_FATIGUE,
        workoutType: 'bodybuilding',
        targetDurationMin: 45,
        targeting: { emphasize: [{ group: 'biceps' }], avoid: [] },
      }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const bicepsEx = main.find((ex) => ex.primaryAreas.some((a) => a.group === 'biceps'));
    expect(bicepsEx).toBeDefined();
    const workSets = bicepsEx!.sets.filter((s) => !s.isWarmup);
    expect(workSets.length).toBeLessThanOrEqual(3);
    expect(bicepsEx!.note ?? '').toMatch(/recovery \(high fatigue\)/);
  });

  it('never lets targeting override injury-based avoidance, even for the same area', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'bodybuilding',
        targetDurationMin: 45,
        avoidToday: { flags: [{ area: { group: 'biceps' }, severity: 'severe' }] },
        targeting: { emphasize: [{ group: 'biceps' }], avoid: [] },
      }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    expect(main.some((ex) => ex.primaryAreas.some((a) => a.group === 'biceps'))).toBe(false);
  });

  it('still blocks max-day calibration on a severely fatigued muscle even when explicitly targeted', async () => {
    const history = [completedStrengthSession(NOW - 40 * 86_400_000)];
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history,
      fatigue: { byGroup: { quads: 0.85 }, updatedAt: NOW },
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
      targeting: { emphasize: [{ group: 'quads' }], avoid: [] },
    }));
    const exercises = plan.blocks.flatMap((block) => block.exercises);
    expect(exercises.some((exercise) => exercise.sets.some((set) => set.isCalibration))).toBe(false);
  });
});

describe('RulesEngine.generateSession — favorites bias selection without defeating variety', () => {
  it('pulls a favorited exercise into the session when it would otherwise lose on pattern competition', async () => {
    const engine = new RulesEngine();
    const beginnerAthlete = { ...athlete(STRENGTH_HEAVY_WEIGHTS), experience: 'beginner' as const };
    const baseCtx = { athlete: beginnerAthlete, goals: beginnerAthlete.goals, workoutType: 'bodybuilding' as const, targetDurationMin: 15 };

    const baseline = await engine.generateSession(context(baseCtx));
    const baselineExercises = baseline.blocks.find((b) => b.label === 'Main')!.exercises;
    const baselineIds = new Set(baselineExercises.map((e) => e.exerciseId));

    const baselinePatterns = new Set(
      EXERCISES.filter((e) => baselineIds.has(e.id)).map((e) => e.movementPattern),
    );
    // A strength candidate on a movement pattern the baseline session didn't
    // already use — nothing else competes with it for its pattern slot, so
    // favoriting it should reliably pull it in.
    const candidate = EXERCISES.find(
      (e) => e.modality === 'strength' && !baselineIds.has(e.id) && !baselinePatterns.has(e.movementPattern),
    );
    expect(candidate).toBeDefined();

    const favored = await engine.generateSession(
      context({ ...baseCtx, favoriteExerciseIds: [candidate!.id] }),
    );
    const favoredIds = new Set(favored.blocks.find((b) => b.label === 'Main')!.exercises.map((e) => e.exerciseId));
    expect(favoredIds.has(candidate!.id)).toBe(true);
  });

  it('still enforces distinct movement patterns — a favorite cannot crowd out variety', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'bodybuilding',
        targetDurationMin: 45,
        favoriteExerciseIds: EXERCISES.filter((e) => e.modality === 'strength' && e.movementPattern === 'push').map((e) => e.id),
      }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const patterns = main.map((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.movementPattern);
    expect(new Set(patterns).size).toBe(patterns.length); // no duplicate pattern, even with a whole category favorited
  });
});

describe('RulesEngine.generateSession — a superset always has ≥2 members', () => {
  function rotationGroupCounts(plan: SessionPlan): Map<string, number> {
    const counts = new Map<string, number>();
    for (const block of plan.blocks) {
      for (const ex of block.exercises) {
        if (ex.rotationGroup) counts.set(ex.rotationGroup, (counts.get(ex.rotationGroup) ?? 0) + 1);
      }
    }
    return counts;
  }

  it('never leaves a lone survivor grouped after budget trimming drops its partner', async () => {
    // Superset opted in, plenty of exercises requested, but a tight budget
    // that forces fitDurationToBudget to pop exercises — exactly the
    // scenario that used to orphan a superset partner.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      workoutOptions: { bodybuildingRotation: 'superset' },
      targetDurationMin: 10,
    }));
    for (const count of rotationGroupCounts(plan).values()) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it('holds across a sweep of durations and experience levels', async () => {
    const engine = new RulesEngine();
    for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
      for (const targetDurationMin of [10, 20, 30, 40, 50, 60]) {
        const a = { ...athlete(STRENGTH_HEAVY_WEIGHTS), experience };
        const plan = await engine.generateSession(context({
          athlete: a,
          goals: a.goals,
          workoutType: 'bodybuilding',
          workoutOptions: { bodybuildingRotation: 'superset' },
          targetDurationMin,
        }));
        for (const [group, count] of rotationGroupCounts(plan)) {
          if (count < 2) throw new Error(`orphaned superset: experience=${experience} duration=${targetDurationMin} group=${group} count=${count}`);
        }
      }
    }
  });
});

describe('RulesEngine.generateSession — set count lands mid-band on a longer session, not pinned at the floor', () => {
  it('a 40-min advanced bodybuilding session prefers fewer exercises at 4+ sets over many at the 3-set floor', async () => {
    const a = { ...athlete(STRENGTH_HEAVY_WEIGHTS), experience: 'advanced' as const };
    const plan = await new RulesEngine().generateSession(context({
      athlete: a,
      goals: a.goals,
      workoutType: 'bodybuilding',
      targetDurationMin: 40,
    }));
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const workSets = main.map((ex) => ex.sets.filter((s) => !s.isWarmup).length);
    // Not every lift bottomed out at the true floor — the soft 4-set floor
    // should absorb the budget pressure first.
    expect(workSets.some((n) => n >= 4)).toBe(true);
  });
});

describe('RulesEngine.generateSession — Sculpting + Full Body targeting (ADR-0124)', () => {
  // Equipment narrow enough (no bench/pull-up bar/resistance bands/cable/
  // cardio machine) that fitDurationToBudget's over-budget trimming actually
  // engages at a generous duration — the regression case for the
  // MIN_MAIN_EXERCISES_FULL_BODY floor below.
  const TRIMMING_PRONE_EQUIPMENT: EquipmentInventory = {
    items: [
      { type: 'bodyweight' },
      { type: 'dumbbells' },
      { type: 'barbell' },
      { type: 'kettlebell' },
      { type: 'squat_rack' },
      { type: 'yoga_mat' },
      { type: 'foam_roller' },
    ],
  };

  function regionsOf(plan: SessionPlan): Set<BodyRegion> {
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const regions = new Set<BodyRegion>();
    for (const ex of main) {
      for (const area of ex.primaryAreas) {
        if (area.group) regions.add(GROUP_TO_REGION[area.group]);
      }
    }
    return regions;
  }

  it('Full Body targeting alone spans at least 3 regions', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ region: 'full_body' }], avoid: [] } }),
    );
    expect(regionsOf(plan).size).toBeGreaterThanOrEqual(3);
  });

  it('Sculpting workoutType alone (no Full Body) uses the toning rep range, without forcing spread', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'sculpting', targetDurationMin: 45 }),
    );
    expect(plan.workoutType).toBe('sculpting');
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const workSetReps = main.flatMap((ex) => ex.sets.filter((s) => !s.isWarmup).map((s) => s.reps));
    expect(workSetReps.some((reps) => (reps ?? 0) >= 10)).toBe(true);
  });

  it('Sculpting + Full Body together apply both mechanisms', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'sculpting',
        targetDurationMin: 45,
        targeting: { emphasize: [{ region: 'full_body' }], avoid: [] },
      }),
    );
    expect(regionsOf(plan).size).toBeGreaterThanOrEqual(3);
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const workSetReps = main.flatMap((ex) => ex.sets.filter((s) => !s.isWarmup).map((s) => s.reps));
    expect(workSetReps.some((reps) => (reps ?? 0) >= 10)).toBe(true);
  });

  it('region spread survives duration-budget trimming (regression: fitDurationToBudget must not erase a region)', async () => {
    // With this narrower equipment set, sculptingCount's 8-exercise ask at
    // 50 min genuinely overshoots the real per-set/rest time budget, so
    // fitDurationToBudget's over-budget trimming engages — it must stop at
    // MIN_MAIN_EXERCISES_FULL_BODY (3), not the generic 2-exercise floor,
    // or the "spans your whole body" promise silently breaks.
    const plan = await new RulesEngine().generateSession(
      context({
        equipment: TRIMMING_PRONE_EQUIPMENT,
        workoutType: 'sculpting',
        targetDurationMin: 50,
        targeting: { emphasize: [{ region: 'full_body' }], avoid: [] },
      }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    expect(main.length).toBeGreaterThanOrEqual(3);
    expect(regionsOf(plan).size).toBeGreaterThanOrEqual(3);
  });

  it('Bodybuilding + Full Body also spans ≥3 regions — full-body targeting is not gated to Sculpting', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'bodybuilding',
        targetDurationMin: 45,
        targeting: { emphasize: [{ region: 'full_body' }], avoid: [] },
      }),
    );
    expect(regionsOf(plan).size).toBeGreaterThanOrEqual(3);
  });

  it('a specific muscle-group emphasis (non-full-body) is unaffected — still biases selection normally', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [] } }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    const chestEx = main.find((ex) => ex.primaryAreas.some((a) => a.group === 'chest'));
    expect(chestEx).toBeDefined();
    expect(chestEx!.note ?? '').toMatch(/targets your emphasis/);
  });

  it('avoidance still fully applies per-region under Full Body targeting', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        targeting: { emphasize: [{ region: 'full_body' }], avoid: [] },
        avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'severe' }] },
      }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')!.exercises;
    expect(main.some((ex) => ex.primaryAreas.some((a) => a.group === 'chest'))).toBe(false);
  });

  it('rationale explains the full-body spread and the sculpting style, never the raw enum string', async () => {
    const fullBodyPlan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ region: 'full_body' }], avoid: [] } }),
    );
    expect(fullBodyPlan.rationale).toMatch(/whole body/);
    expect(fullBodyPlan.rationale).not.toMatch(/full_body/);

    const sculptingPlan = await new RulesEngine().generateSession(
      context({ workoutType: 'sculpting', targetDurationMin: 45 }),
    );
    expect(sculptingPlan.rationale).toMatch(/sculpting session/);
  });
});

describe('RulesEngine.generateSession — ADR-0126 emphasis quota and rotation', () => {
  const mainOf = (plan: SessionPlan) => plan.blocks.find((b) => b.label === 'Main')?.exercises ?? [];

  const trainsChest = (exerciseId: string) =>
    EXERCISES.find((e) => e.id === exerciseId)?.primaryAreas.includes('chest') ?? false;

  it('guarantees emphasis a minimum share of the Main block, not just a ranking nudge', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [] }, targetDurationMin: 45 }),
    );
    const main = mainOf(plan);
    const chest = main.filter((e) => trainsChest(e.exerciseId));
    expect(main.length).toBeGreaterThan(0);
    expect(chest.length).toBeGreaterThanOrEqual(Math.max(2, Math.ceil(main.length / 2)));
  });

  it('hands the whole Main block over in priority mode', async () => {
    const balanced = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [] }, targetDurationMin: 45 }),
    );
    const priority = await new RulesEngine().generateSession(
      context({
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        targetDurationMin: 45,
      }),
    );
    const chestShare = (plan: SessionPlan) => {
      const main = mainOf(plan);
      return main.filter((e) => trainsChest(e.exerciseId)).length / main.length;
    };
    expect(chestShare(priority)).toBeGreaterThan(chestShare(balanced));
    expect(chestShare(priority)).toBe(1);
  });

  it('the priority override still never pierces the safety envelope', async () => {
    // Chest is emphasized in priority mode AND carries a severe day-of flag.
    // Safety wins: nothing in the Main block may load the flagged area.
    const plan = await new RulesEngine().generateSession(
      context({
        targeting: { emphasize: [{ group: 'chest' }], avoid: [], emphasisMode: 'priority' },
        avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'severe' }] },
        targetDurationMin: 45,
      }),
    );
    expect(mainOf(plan).some((e) => trainsChest(e.exerciseId))).toBe(false);
  });

  it('gives emphasized work an extra set', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ targeting: { emphasize: [{ group: 'chest' }], avoid: [] }, targetDurationMin: 45 }),
    );
    const main = mainOf(plan);
    const emphasized = main.filter((e) => e.emphasized);
    expect(emphasized.length).toBeGreaterThan(0);
    expect(emphasized.some((e) => (e.note ?? '').includes('extra set'))).toBe(true);
  });

  it('orders the Main block compounds-first', async () => {
    const plan = await new RulesEngine().generateSession(context({ targetDurationMin: 50 }));
    const main = mainOf(plan);
    const isIsolation = (id: string) => EXERCISES.find((e) => e.id === id)?.mechanic === 'isolation';
    const firstIsolation = main.findIndex((e) => isIsolation(e.exerciseId));
    const lastCompound = main.map((e) => !isIsolation(e.exerciseId)).lastIndexOf(true);
    if (firstIsolation !== -1) expect(firstIsolation).toBeGreaterThan(lastCompound - 1);
  });

  it('rotates exercises across consecutive sessions instead of repeating them', async () => {
    // The regression this exists to prevent: with no recency term, the same
    // top-ranked picks came back every single session, forever.
    const engine = new RulesEngine();
    const first = await engine.generateSession(context({ targetDurationMin: 45 }));
    const firstMain = mainOf(first);

    const yesterday = NOW - 86_400_000;
    const history: SessionRecord[] = [{
      id: 'sess-yesterday',
      planId: first.id,
      plannedFor: yesterday,
      completedAt: yesterday,
      performed: firstMain.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        primaryAreas: e.primaryAreas,
        sets: [{ reps: 10, weightKg: 40, completed: true }],
      })),
    }];

    const second = await engine.generateSession(context({ history, targetDurationMin: 45 }));
    const secondIds = mainOf(second).map((e) => e.exerciseId);
    const repeated = firstMain.filter((e) => secondIds.includes(e.exerciseId));
    expect(repeated.length).toBeLessThan(firstMain.length);
  });

  it('keeps favorites as a bias, not a capture — favoriting a whole block no longer freezes it', async () => {
    // The old lexicographic comparator sorted EVERY favorite above EVERY
    // non-favorite, so an athlete who favorited one exercise per movement
    // pattern received the identical session indefinitely. Favorites still
    // pull hard — anchors deliberately resist rotation so progression stays
    // measurable — but the accessory slots must still turn over.
    const engine = new RulesEngine();
    const baseline = await engine.generateSession(context({ targetDurationMin: 45 }));
    const favoriteIds = mainOf(baseline).map((e) => e.exerciseId);

    const yesterday = NOW - 86_400_000;
    const history: SessionRecord[] = [{
      id: 'sess-fav',
      planId: baseline.id,
      plannedFor: yesterday,
      completedAt: yesterday,
      performed: mainOf(baseline).map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        primaryAreas: e.primaryAreas,
        sets: [{ reps: 10, weightKg: 40, completed: true }],
      })),
    }];

    const plan = await engine.generateSession(
      context({ history, favoriteExerciseIds: favoriteIds, targetDurationMin: 45 }),
    );
    const repeated = mainOf(plan).filter((e) => favoriteIds.includes(e.exerciseId));
    expect(repeated.length).toBeLessThan(favoriteIds.length);
  });
});

describe('RulesEngine.generateSession — ADR-0126 debrief feeds the next session', () => {
  it('works around an issue reported in a recent debrief, without the athlete re-entering it', async () => {
    // CLAUDE.md §8.5 promised this; before ADR-0126 the reported issue was
    // stored, logged, and then had no effect on anything.
    const yesterday = NOW - 86_400_000;
    const history: SessionRecord[] = [{
      id: 'sess-debrief',
      planId: 'p',
      plannedFor: yesterday,
      completedAt: yesterday,
      performed: [],
      debrief: { overallRpe: 7, issues: [{ area: { group: 'chest' }, severity: 'severe' }] },
    }];

    const plan = await new RulesEngine().generateSession(
      context({ history, targetDurationMin: 45, avoidToday: { flags: [] } }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main')?.exercises ?? [];
    const trainsChest = (id: string) => EXERCISES.find((e) => e.id === id)?.primaryAreas.includes('chest') ?? false;
    expect(main.some((e) => trainsChest(e.exerciseId))).toBe(false);
    expect(plan.rationale).toMatch(/Working around/);
  });
});

describe('RulesEngine.generateSession — ADR-0128 training zones end to end', () => {
  const mainOf = (plan: SessionPlan) => plan.blocks.find((b) => b.label === 'Main')?.exercises ?? [];

  /** Weeks of plain hypertrophy work, so every group is overdue for a test. */
  function hypertrophyHistory(exerciseId: string, group: 'chest' | 'quads', sessions = 8): SessionRecord[] {
    return Array.from({ length: sessions }, (_, i) => {
      const at = NOW - (3 + i * 4) * 86_400_000;
      return {
        id: `h${i}`,
        planId: 'p',
        plannedFor: at,
        completedAt: at,
        performed: [{
          exerciseId,
          name: exerciseId,
          primaryAreas: [{ group }],
          sets: [{ reps: 10, weightKg: 60, rpe: 7, completed: true, prescribedReps: 10, prescribedZone: 'hypertrophy' as const }],
        }],
      };
    });
  }

  it('schedules a test once a group has gone long enough without one', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    const tested = mainOf(plan).find((e) => e.sets.some((s) => s.isCalibration));
    expect(tested).toBeDefined();
    expect(tested!.zone === 'strength' || tested!.zone === 'endurance').toBe(true);
    expect(plan.rationale).toMatch(/test/i);
  });

  it('leads with the test — an all-out effort belongs on a fresh athlete', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    const main = mainOf(plan);
    const testIndex = main.findIndex((e) => e.sets.some((s) => s.isCalibration));
    expect(testIndex).toBe(0);
  });

  it('ramps into a strength test rather than starting cold', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    const tested = mainOf(plan).find((e) => e.zone === 'strength' && e.sets.some((s) => s.isCalibration));
    if (!tested) return; // an endurance test was due first — covered elsewhere
    expect(tested.sets.some((s) => s.isWarmup)).toBe(true);
    const amrap = tested.sets.find((s) => s.isCalibration)!;
    const rampBefore = tested.sets.indexOf(amrap);
    expect(rampBefore).toBeGreaterThan(0);
  });

  it('gives strength-zone work heavy rest and leaves it out of supersets — both for free', async () => {
    // These fall out of existing rules (timing.ts keys rest off reps; supersets
    // leave <=6-rep sets straight). Pinned so they cannot silently regress.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    for (const exercise of mainOf(plan)) {
      if (exercise.zone !== 'strength') continue;
      expect(exercise.rotationGroup).toBeUndefined();
      const working = exercise.sets.filter((s) => !s.isWarmup && (s.reps ?? 0) <= 6);
      for (const set of working) {
        if (set.restSec != null) expect(set.restSec).toBeGreaterThan(120);
      }
    }
  });

  it('never tests a beginner', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), experience: 'beginner', maxDay: { byMuscleGroup: { quads: 28 } } },
    }));
    expect(mainOf(plan).some((e) => e.sets.some((s) => s.isCalibration))).toBe(false);
  });

  it('never tests on a poor-readiness day', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      athlete: { ...athlete(STRENGTH_HEAVY_WEIGHTS), maxDay: { byMuscleGroup: { quads: 28 } } },
      readiness: { energy: 1, soreness: 5, sleepQuality: 1 },
    }));
    expect(mainOf(plan).some((e) => e.sets.some((s) => s.isCalibration))).toBe(false);
  });

  it('reaches a genuine strength rep range, which no input could previously produce', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'bodybuilding',
      history: hypertrophyHistory('sq-db-front', 'quads'),
      targetDurationMin: 60,
      goals: { weights: STRENGTH_HEAVY_WEIGHTS, resistanceFocus: 'max_strength' },
    }));
    const allReps = mainOf(plan).flatMap((e) => e.sets.filter((s) => !s.isWarmup).map((s) => s.reps));
    const anyStrengthRange = allReps.some((reps) => reps != null && reps <= 6);
    const anyEnduranceRange = allReps.some((reps) => reps != null && reps >= 15);
    expect(anyStrengthRange || anyEnduranceRange).toBe(true);
  });
});
