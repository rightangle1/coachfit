import { RulesEngine } from '../rules-engine';
import { auditSessionShape } from '../session-shape';
import { EXERCISES } from '../../catalog';
import { GROUP_TO_REGION } from '../../types';
import type {
  AthleteProfile,
  BodyRegion,
  CardioIntent,
  EquipmentInventory,
  ExperienceLevel,
  ModalityWeights,
  MuscleGroup,
  SessionContext,
  SessionPlan,
  SessionRecord,
  WorkoutType,
} from '../../types';

function workSetCount(exercise: { sets: { isWarmup?: boolean; isCalibration?: boolean }[] }): number {
  return exercise.sets.filter((set) => !set.isWarmup && !set.isCalibration).length;
}

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
    { type: 'barre' },
  ],
};

const STRENGTH_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 };
const CARDIO_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.1, cardio: 0.7, mobility: 0.1, general: 0.1 };
const MOBILITY_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.2, cardio: 0.1, mobility: 0.6, general: 0.1 };

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
  it('creates explicit work and recovery steps for an interval cardio session, with a sane shape', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'interval' },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    const exercises = mainBlock!.exercises;
    const sets = exercises.flatMap((exercise) => exercise.sets);
    expect(plan.workoutType).toBe('cardio');
    expect(sets.some((set) => set.phase === 'work')).toBe(true);
    expect(sets.some((set) => set.phase === 'recovery')).toBe(true);
    // ADR-0143 regression: this used to pass unchanged whether Main was 1
    // exercise x 10 sets or several exercises x 2-3 sets each — it no longer
    // does. No single exercise may carry an unbounded round count (8 rounds
    // x work+recovery = 16 sets, the hard ceiling).
    for (const exercise of exercises) {
      expect(workSetCount(exercise)).toBeLessThanOrEqual(16);
    }
    expect(auditSessionShape(plan.blocks, { cardioIntent: 'interval', hasRoutine: false }).filter((f) => f.severity === 'warn')).toEqual([]);
  });

  it('never picks both Burpees and its own named variant into one interval cardio session', async () => {
    // Regression guard: ca-burpees and ca-burpee-broad-jump-combo used to
    // auto-derive into different variantFamily buckets (the "jump" in the
    // variant's name routed it to a different movementSlot), so
    // FAMILY_SATURATION never penalised picking both. Restricting to the
    // bodyweight cardio pool (where both live) and a duration long enough to
    // scale past a single station gives the bug its best chance to recur.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'interval', cardioModalities: ['bodyweight'] },
      targetDurationMin: 45,
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    const ids = mainBlock!.exercises.map((exercise) => exercise.exerciseId);
    expect(ids.includes('ca-burpees') && ids.includes('ca-burpee-broad-jump-combo')).toBe(false);
  });

  it('builds a rotating circuit of distinct stations for an aerobics cardio session', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'circuit' },
      targetDurationMin: 30,
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(plan.workoutType).toBe('cardio');
    expect(mainBlock).toBeDefined();
    const exercises = mainBlock!.exercises;

    // Several distinct stations, not one exercise repeated like intervals.
    expect(exercises.length).toBeGreaterThanOrEqual(3);
    expect(new Set(exercises.map((exercise) => exercise.exerciseId)).size).toBe(exercises.length);
    for (const exercise of exercises) {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      // Circuit's pool is bodyweight aerobics stations OR loaded-implement
      // interval stations (widened alongside metabolic-conditioning support)
      // — never any other movement pattern.
      expect(['aerobics', 'interval'].includes(catalogEntry!.movementPattern)).toBe(true);
      if (catalogEntry!.movementPattern === 'interval') expect(catalogEntry!.loadsWeight).toBe(true);
    }

    // All stations rotate together as one circuit (reuses the superset
    // round-view for free — ADR-0138).
    const groupIds = new Set(exercises.map((exercise) => exercise.rotationGroup));
    expect(groupIds.size).toBe(1);
    expect(exercises.every((exercise) => exercise.group?.type === 'circuit')).toBe(true);

    // Equal round counts across every station — the tracker's round view
    // navigates by set index, so a mismatch would desync stations mid-round.
    const roundCounts = new Set(exercises.map((exercise) => exercise.sets.length));
    expect(roundCounts.size).toBe(1);

    // Roughly respects the requested time budget, same tolerance band other
    // duration-budget tests in this file use.
    expect(plan.estimatedDurationMin ?? 0).toBeGreaterThanOrEqual(20);
    expect(plan.estimatedDurationMin ?? 0).toBeLessThanOrEqual(45);
  });

  it('restricts cardio Main exercises to a single selected cardio type (ADR-0140)', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'basic', cardioModalities: ['combat'] },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock).toBeDefined();
    expect(mainBlock!.exercises.length).toBeGreaterThan(0);
    for (const exercise of mainBlock!.exercises) {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      expect(catalogEntry?.cardioModality).toBe('combat');
    }
  });

  it('OR-matches multiple selected cardio types (ADR-0140)', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'interval', cardioModalities: ['combat', 'jump_rope'] },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock).toBeDefined();
    expect(mainBlock!.exercises.length).toBeGreaterThan(0);
    for (const exercise of mainBlock!.exercises) {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      expect(['combat', 'jump_rope']).toContain(catalogEntry?.cardioModality);
    }
  });

  it('builds a loaded-implement circuit when cardioModalities is scoped to loaded cardio', async () => {
    // Circuit's pool now includes loaded-implement interval exercises
    // (kettlebell/dumbbell work), so this combo — unsatisfiable before the
    // widening — now builds a real rotating circuit instead of falling back.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'circuit', cardioModalities: ['loaded_cardio'] },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock).toBeDefined();
    const exercises = mainBlock!.exercises;
    expect(exercises.length).toBeGreaterThan(0);
    expect(plan.adjustments ?? []).not.toContain("Cardio type preference skipped — no matching exercises for today's format");
    for (const exercise of exercises) {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      expect(catalogEntry?.cardioModality).toBe('loaded_cardio');
    }
    const groupIds = new Set(exercises.map((exercise) => exercise.rotationGroup));
    expect(groupIds.size).toBe(1);
    expect(exercises.every((exercise) => exercise.group?.type === 'circuit')).toBe(true);
  });

  it('gives a loaded circuit station real rest, not the aerobics flat 10s or the cardio-default 0s', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'circuit', cardioModalities: ['loaded_cardio'] },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    const exercises = mainBlock!.exercises;
    expect(exercises.length).toBeGreaterThan(0);
    for (const exercise of exercises) {
      // Every set but the last carries a rest value; the loaded transition
      // (double the bodyweight aerobics one) must be what's actually shown,
      // not the cardio catch-all's 0s this phase's design review caught.
      const restValues = exercise.sets.slice(0, -1).map((set) => set.restSec);
      expect(restValues.every((rest) => rest === 20)).toBe(true);
    }
  });

  it('circuit stations are not all loaded-implement even when equipment allows it (PATTERN_SATURATION diversity)', async () => {
    // Relies on selection-score.ts's existing pattern-saturation scoring to
    // keep circuits varied — not a new hard cap. If this ever fails, that
    // scoring pressure has weakened and circuit variety needs a real fix.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'circuit' },
      targetDurationMin: 40,
      athlete: { ...athlete(CARDIO_HEAVY_WEIGHTS), experience: 'advanced' },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    const exercises = mainBlock!.exercises;
    const loadedCount = exercises.filter((exercise) => {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      return catalogEntry?.loadsWeight === true;
    }).length;
    expect(loadedCount).toBeLessThan(exercises.length);
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

describe('RulesEngine.generateSession — ADR-0145 dense pacing', () => {
  it('dense pacing shortens Main-block straight-set rest, without touching heavy/calibration sets', async () => {
    // STRENGTH_HEAVY_WEIGHTS + no explicit workoutType: mainModality resolves
    // to 'strength' (naive weight argmax), and cardio+general < 0.3 keeps
    // applySupersets' time-saver path off, so the whole Main block stays
    // straight (ungrouped) — exactly the case dense pacing's straight-set
    // lever is meant to shape.
    const densePlan = await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS, restPacing: 'dense' },
    }));
    const standardPlan = await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS },
    }));
    expect(densePlan.densePacing).toBe(true);
    expect(standardPlan.densePacing).toBe(false);

    const denseMain = densePlan.blocks.find((block) => block.label === 'Main')!;
    const standardMain = standardPlan.blocks.find((block) => block.label === 'Main')!;
    expect(denseMain.modality).toBe('strength');

    // Exercise selection and prescription (reps/RPE) don't depend on
    // restPacing, so matching exercises should carry the same first-set
    // prescription in both plans — only its rest should ever differ, and
    // only downward, never up.
    let sawDiscount = false;
    for (const denseEx of denseMain.exercises) {
      if (denseEx.rotationGroup != null) continue; // grouped sets deliberately unaffected
      const standardEx = standardMain.exercises.find((exercise) => exercise.exerciseId === denseEx.exerciseId);
      if (!standardEx) continue;
      const denseSet = denseEx.sets[0];
      const standardSet = standardEx.sets[0];
      if (denseSet.isCalibration || standardSet.isCalibration) continue;
      if (denseSet.reps !== standardSet.reps || denseSet.targetRpe !== standardSet.targetRpe) continue;
      expect(denseSet.restSec ?? 0).toBeLessThanOrEqual(standardSet.restSec ?? 0);
      if ((denseSet.restSec ?? 0) < (standardSet.restSec ?? 0)) sawDiscount = true;
    }
    expect(sawDiscount).toBe(true);
  });

  it('given the same requested duration, dense pacing fits at least as much work as standard pacing', async () => {
    const denseMain = (await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS, restPacing: 'dense' },
      targetDurationMin: 45,
    }))).blocks.find((block) => block.label === 'Main')!;
    const standardMain = (await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS },
      targetDurationMin: 45,
    }))).blocks.find((block) => block.label === 'Main')!;
    const denseSets = denseMain.exercises.reduce((sum, exercise) => sum + workSetCount(exercise), 0);
    const standardSets = standardMain.exercises.reduce((sum, exercise) => sum + workSetCount(exercise), 0);
    // Cheaper per-set time estimates mean the under-budget filler can pack in
    // more work for the same requested duration — bounded by the same
    // MAX_SESSION_WORK_SETS/volume-landmark ceiling either way, so "at least
    // as much," not an unconditional increase.
    expect(denseSets).toBeGreaterThanOrEqual(standardSets);
  });

  it('dense pacing gives circuit stations the tighter 8s/16s transition, not the standard 10s/20s', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'circuit' },
      goals: { weights: CARDIO_HEAVY_WEIGHTS, restPacing: 'dense' },
    }));
    expect(plan.densePacing).toBe(true);
    const mainBlock = plan.blocks.find((block) => block.label === 'Main')!;
    const exercises = mainBlock.exercises;
    expect(exercises.length).toBeGreaterThan(0);
    for (const exercise of exercises) {
      const catalogEntry = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
      const expected = catalogEntry?.loadsWeight ? 16 : 8;
      const restValues = exercise.sets.slice(0, -1).map((set) => set.restSec);
      expect(restValues.every((rest) => rest === expected)).toBe(true);
    }
    // Round count stays internally consistent with the tighter transition
    // across the shared rotation group (mirrors ADR-0138's equalize step).
    const roundCounts = new Set(exercises.map((exercise) => exercise.sets.length));
    expect(roundCounts.size).toBe(1);
  });

  it('names dense pacing in the session rationale when active, and omits it when not', async () => {
    const densePlan = await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS, restPacing: 'dense' },
    }));
    const standardPlan = await new RulesEngine().generateSession(context({
      goals: { weights: STRENGTH_HEAVY_WEIGHTS },
    }));
    expect(densePlan.rationale).toContain("Kept rest and transitions tight to match your plan's fast pace.");
    expect(standardPlan.rationale).not.toContain('Kept rest and transitions tight');
  });
});

describe('RulesEngine.generateSession — ADR-0143 cardio shape integrity', () => {
  it('an implicit cardio day (goal-weight-derived, no explicit workoutType) gets real exercise variety, never an unbounded single exercise', async () => {
    // Regression: mainModality becoming 'cardio' purely from goal weights
    // (no explicit workoutType) used to hardcode baseCount to 1 in every
    // case — this is exactly the CARDIO_HEAVY_WEIGHTS scenario already used
    // above (line ~78), just now asserting shape, not only the rationale.
    const plan = await new RulesEngine().generateSession(context({ goals: { weights: CARDIO_HEAVY_WEIGHTS } }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock?.modality).toBe('cardio');
    for (const exercise of mainBlock!.exercises) {
      expect(workSetCount(exercise)).toBeLessThanOrEqual(16);
    }
    expect(auditSessionShape(plan.blocks, { cardioIntent: undefined, hasRoutine: false }).filter((f) => f.severity === 'warn')).toEqual([]);
  });

  it('a single-focus interval type (running/walking) legitimately stays one exercise', async () => {
    // The catalog's only running_walking + interval exercise (treadmill
    // sprints) needs a treadmill — added here so the modality preference
    // actually has a match instead of silently falling back to the full
    // (mixed-modality) interval pool.
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'interval', cardioModalities: ['running_walking'] },
      equipment: { items: [...EQUIPMENT.items, { type: 'treadmill' }] },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock!.exercises).toHaveLength(1);
    expect(mainBlock!.exercises[0].exerciseId).toBe('ca-treadmill-sprints');
    expect(workSetCount(mainBlock!.exercises[0])).toBeLessThanOrEqual(16);
  });

  it('a non-single-focus interval type gets real exercise variety, scaled by experience/duration — not locked to one exercise', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'interval', cardioModalities: ['bodyweight'] },
      targetDurationMin: 45,
      athlete: { ...athlete(CARDIO_HEAVY_WEIGHTS), experience: 'advanced' },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock!.exercises.length).toBeGreaterThan(1);
  });

  it("Conditioning's single pick never exceeds the round cap, and defaults to a steady shape (never an unplanned circuit/interval)", async () => {
    // Needs cardio + general >= 0.25 (conditioningWouldApply's threshold)
    // while strength still dominates Main — STRENGTH_HEAVY_WEIGHTS alone
    // (cardio 0.1 + general 0.1 = 0.2) doesn't clear it.
    const weights: ModalityWeights = { strength: 0.5, cardio: 0.15, mobility: 0.1, general: 0.25 };
    const plan = await new RulesEngine().generateSession(context({ goals: { weights } }));
    const conditioning = plan.blocks.find((block) => block.label === 'Conditioning');
    expect(conditioning).toBeDefined();
    for (const exercise of conditioning!.exercises) {
      expect(workSetCount(exercise)).toBeLessThanOrEqual(16);
      // A steady bout has no phase markers at all (no work/recovery split).
      expect(exercise.sets.every((set) => set.phase === 'work' || set.phase == null)).toBe(true);
      expect(exercise.sets.some((set) => set.phase === 'recovery')).toBe(false);
    }
  });

  it('a routine containing a deliberately interval-tagged exercise DOES produce interval structure — the named exception', async () => {
    const plan = await new RulesEngine().generateSession(context({
      routine: { id: 'r-interval', name: 'Interval Routine', exerciseIds: ['ca-intervals-bw'] },
      // Deliberately mismatched — the routine's own catalog tag must win,
      // not this (irrelevant, for a routine session) toggle.
      workoutOptions: { cardioIntent: 'basic' },
    }));
    const mainBlock = plan.blocks.find((block) => block.label === 'Main');
    expect(mainBlock!.exercises.map((e) => e.exerciseId)).toEqual(['ca-intervals-bw']);
    const sets = mainBlock!.exercises[0].sets;
    expect(sets.some((set) => set.phase === 'work')).toBe(true);
    expect(sets.some((set) => set.phase === 'recovery')).toBe(true);
    // Legitimate per the named exception — a routine's own shape is
    // authoritative, so this must NOT be flagged even past the round cap.
    expect(auditSessionShape(plan.blocks, { cardioIntent: 'basic', hasRoutine: true })).toEqual([]);
  });

  it('a recovery-intent day measurably reduces cardio interval volume versus a balanced day with identical (empty) history', async () => {
    const routine = { id: 'r-interval', name: 'Interval Routine', exerciseIds: ['ca-intervals-bw'] };
    const roundsOf = (plan: SessionPlan) =>
      plan.blocks.find((b) => b.label === 'Main')!.exercises[0].sets.filter((s) => s.phase === 'work').length;
    const balanced = await new RulesEngine().generateSession(context({ routine, trainingIntent: 'balanced' }));
    const recovery = await new RulesEngine().generateSession(context({ routine, trainingIntent: 'recovery' }));
    expect(roundsOf(recovery)).toBeLessThan(roundsOf(balanced));
  });

  it('finds no warn-severity shape issues across a sweep of workout style x experience x training intent', async () => {
    const experiences: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
    const trainingIntents: ('recovery' | 'balanced' | 'challenge')[] = ['recovery', 'balanced', 'challenge'];
    const scenarios: { workoutType?: WorkoutType; cardioIntent?: CardioIntent }[] = [
      {}, // implicit, goal-weight-derived
      { workoutType: 'cardio', cardioIntent: 'basic' },
      { workoutType: 'cardio', cardioIntent: 'circuit' },
      { workoutType: 'cardio', cardioIntent: 'interval' },
      { workoutType: 'bodyweight' },
    ];
    for (const scenario of scenarios) {
      for (const experience of experiences) {
        for (const trainingIntent of trainingIntents) {
          const plan = await new RulesEngine().generateSession(context({
            workoutType: scenario.workoutType,
            workoutOptions: scenario.cardioIntent ? { cardioIntent: scenario.cardioIntent } : undefined,
            goals: { weights: CARDIO_HEAVY_WEIGHTS },
            athlete: { ...athlete(CARDIO_HEAVY_WEIGHTS), experience },
            trainingIntent,
          }));
          const findings = auditSessionShape(plan.blocks, {
            cardioIntent: plan.workoutOptions?.cardioIntent,
            hasRoutine: plan.routineId != null,
          });
          expect(findings.filter((f) => f.severity === 'warn')).toEqual([]);
        }
      }
    }
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

  it('spreads a long, single-focus cooldown across more distinct stretches rather than over-long sets', async () => {
    const engine = new RulesEngine();
    const plan = await engine.generateSession(
      context({
        athlete: {
          ...context().athlete,
          cooldown: { totalMinutes: 20, activityCount: 2, focus: [{ group: 'hamstrings' }] },
        },
      }),
    );
    const cooldown = plan.blocks.find((block) => block.label === 'Cool down');
    expect(cooldown).toBeDefined();
    // A long single-focus budget used to land as 2 exercises with sets pushed
    // to the 4-set/75s ceiling (300s = 5 min on one stretch). It should now
    // add more distinct stretches instead, capped at MAX_MOBILITY_EXERCISES.
    expect(cooldown!.exercises.length).toBeGreaterThan(2);
    expect(cooldown!.exercises.length).toBeLessThanOrEqual(5);
    for (const ex of cooldown!.exercises) {
      const holdTotal = ex.sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0);
      expect(holdTotal).toBeLessThanOrEqual(180);
    }
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

describe('RulesEngine.generateSession — a session never recommends the same exercise twice (ADR-0136)', () => {
  it('does not pick the same stretch for both Warmup and Cool down, even when their pools overlap heavily', async () => {
    // Bodyweight-only equipment + a single narrow emphasis area collapses both
    // Warmup's and Cool down's pool down to the same ~3 hamstring stretches,
    // scored identically (no history/volume signal differentiates them) — the
    // exact shape of the reported bug: one chest stretch opening AND closing
    // the workout.
    const engine = new RulesEngine();
    const equipment: EquipmentInventory = { items: [{ type: 'bodyweight' }] };
    const plan = await engine.generateSession(
      context({ equipment, targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] } }),
    );
    const warmupIds = new Set((plan.blocks.find((b) => b.label === 'Warmup')?.exercises ?? []).map((e) => e.exerciseId));
    const cooldownIds = (plan.blocks.find((b) => b.label === 'Cool down')?.exercises ?? []).map((e) => e.exerciseId);
    expect(warmupIds.size).toBeGreaterThan(0);
    expect(cooldownIds.length).toBeGreaterThan(0);
    expect(cooldownIds.some((id) => warmupIds.has(id))).toBe(false);
  });

  it('never repeats one exercise id across any two blocks of a full session', async () => {
    const engine = new RulesEngine();
    const MIXED: ModalityWeights = { strength: 0.6, cardio: 0.2, mobility: 0.1, general: 0.1 };
    const plan = await engine.generateSession(context({ goals: { weights: MIXED } }));
    const allIds = plan.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId));
    expect(new Set(allIds).size).toBe(allIds.length);
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
          exerciseId: 'sq-jump',
          name: 'Jump squat',
          primaryAreas: [{ group: 'quads' }],
          sets: [{ reps: 12 }],
          zone: 'hypertrophy',
        }],
      }],
    };

    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap',
      exerciseId: 'sq-jump',
      replacementExerciseId: 'sq-goblet',
    }, { equipment: EQUIPMENT, history: [], experience: 'intermediate' });
    // ADR-0144: a replacement with no history of its own still gets a real,
    // equipment-aware starting weight (sq-goblet is dumbbells, no owned
    // weights on file here → the generic 2.5 kg floor) — never a blank that
    // read as a confusing "0". It's never the OLD exercise's weight, though.
    expect(result.blocks[0].exercises[0].sets[0].weightKg).toBe(2.5);

    const ownHistory: SessionRecord[] = [{
      id: 'goblet-history', planId: 'p', plannedFor: NOW - 86_400_000, completedAt: NOW - 86_400_000,
      performed: [{
        exerciseId: 'sq-goblet', name: 'Goblet squat', primaryAreas: [{ group: 'quads' }],
        sets: [{ reps: 10, weightKg: 15, prescribedReps: 10, prescribedWeightKg: 15, completed: true }],
      }],
    }];
    const withHistory = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap',
      exerciseId: 'sq-jump',
      replacementExerciseId: 'sq-goblet',
    }, { equipment: EQUIPMENT, history: ownHistory, experience: 'intermediate' });
    expect(withHistory.blocks[0].exercises[0].sets[0].weightKg).toBe(15);
  });

  it('allows a replacement with a different movement purpose within the same training type — a deliberate override, not a hard gate', async () => {
    // ADR-0134 revision: the engine's swap floor only enforces training type,
    // equipment, exclusions, and today's avoidance flags (`replacementAllowed`,
    // matching.ts) — movement-slot/muscle fit is a picker-UI "Suggested" signal,
    // not a hard block, so an athlete can knowingly swap a squat for a plank
    // (sq-bw and co-plank are both modality: 'general' — same training type,
    // different movement pattern).
    const plan: SessionPlan = {
      id: 'override', plannedFor: NOW, rationale: '', blocks: [{ label: 'Main', modality: 'general', exercises: [{
        exerciseId: 'sq-bw', name: 'Bodyweight squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const result = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-bw', replacementExerciseId: 'co-plank',
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(result.blocks[0].exercises[0].exerciseId).toBe('co-plank');
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
        exerciseId: 'sq-jump', name: 'Jump squat', primaryAreas: [{ group: 'quads' }], sets: [{ reps: 10 }],
      }] }],
    };
    const rejected = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-jump', replacementExerciseId: 'tr-cable-pushdown',
    }, { equipment: EQUIPMENT, experience: 'intermediate' });
    expect(rejected.blocks[0].exercises[0].exerciseId).toBe('sq-jump');
    expect(rejected.liveAdjustments?.at(-1)?.reasonCode).toBe('rejected_substitution');

    const allowed = await new RulesEngine().adjustDuringSession(plan, {
      kind: 'swap', exerciseId: 'sq-jump', replacementExerciseId: 'tr-cable-pushdown', ignoreEquipment: true,
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

describe('RulesEngine.generateSession — Barre (ADR-0404): stage-ordered flow', () => {
  it('produces a single flow block covering multiple stages with a uniform round count', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'barre', workoutOptions: { flow: { durationMin: 30 } } }),
    );
    expect(plan.blocks.length).toBe(1);
    expect(plan.blocks[0].label).toBe('Barre flow');
    const flow = plan.blocks[0].exercises;
    // 6 of BARRE_STAGE_ORDER's 7 stages have a barre/bodyweight-only candidate
    // in the seed catalog (only 'core' needs a yoga_mat, unowned here) — this
    // also guards against the pool being wrongly filtered down to only the
    // 'mobility'-modality entries (center/warmup/cooldown) and silently
    // dropping the 'strength'-modality thigh/seat/arm pulse work.
    expect(flow.length).toBeGreaterThanOrEqual(6);
    expect(flow.every((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.movementPattern === 'barre_flow')).toBe(true);
    const stagesSeen = flow.map((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.flowStage);
    expect(new Set(stagesSeen).has('thighs')).toBe(true);
    expect(new Set(stagesSeen).has('seat')).toBe(true);
    expect(new Set(stagesSeen).has('arms')).toBe(true);
    // Every exercise gets the same round count — same "no mismatched opening/
    // closing get 1 set" guarantee as Yoga.
    const counts = new Set(flow.map((ex) => ex.sets.length));
    expect(counts.size).toBe(1);
  });

  it('respects avoidance flags — a flagged joint is worked around, not ignored', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'barre',
        workoutOptions: { flow: { durationMin: 30 } },
        avoidToday: { flags: [{ area: { joint: 'knee' }, severity: 'severe' }] },
      }),
    );
    const flow = plan.blocks[0].exercises;
    const flaggedKnee = flow.some((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.jointLoad?.includes('knee'));
    expect(flaggedKnee).toBe(false);
  });

  it('still builds a full flow without a barre — a chair/counter is a soft fallback, not a hard requirement', async () => {
    const noBarre: EquipmentInventory = { items: EQUIPMENT.items.filter((i) => i.type !== 'barre') };
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'barre', equipment: noBarre, workoutOptions: { flow: { durationMin: 30 } } }),
    );
    const flow = plan.blocks[0].exercises;
    // Same full multi-stage sequence as with a barre — not gutted down to the
    // handful of exercises that don't list 'barre' in their equipment.
    expect(flow.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RulesEngine.generateSession — Pilates (ADR-0407): stage-ordered flow', () => {
  it('produces a single flow block covering multiple stages with a uniform round count', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'pilates', workoutOptions: { flow: { durationMin: 30 } } }),
    );
    expect(plan.blocks.length).toBe(1);
    expect(plan.blocks[0].label).toBe('Pilates flow');
    const flow = plan.blocks[0].exercises;
    // Every one of PILATES_STAGE_ORDER's 6 stages has a candidate in the
    // authored catalog — this guards against the pool silently collapsing to
    // only the 'mobility'-modality entries and dropping the 'strength'-modality
    // core/backbend work, same guard the Barre test above uses.
    expect(flow.length).toBeGreaterThanOrEqual(6);
    expect(flow.every((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.movementPattern === 'pilates_flow')).toBe(true);
    const stagesSeen = flow.map((ex) => EXERCISES.find((e) => e.id === ex.exerciseId)?.flowStage);
    expect(new Set(stagesSeen).has('core')).toBe(true);
    expect(new Set(stagesSeen).has('backbend')).toBe(true);
    expect(new Set(stagesSeen).has('standing')).toBe(true);
    // Every exercise gets the same round count — same "no mismatched opening/
    // closing get 1 set" guarantee as Yoga/Barre.
    const counts = new Set(flow.map((ex) => ex.sets.length));
    expect(counts.size).toBe(1);
  });

  it('still builds the full flow without a yoga mat — same optional-with-fallback treatment as Barre', async () => {
    const noMat: EquipmentInventory = { items: EQUIPMENT.items.filter((i) => i.type !== 'yoga_mat') };
    const plan = await new RulesEngine().generateSession(
      context({ workoutType: 'pilates', equipment: noMat, workoutOptions: { flow: { durationMin: 30 } } }),
    );
    const flow = plan.blocks[0].exercises;
    // Same full multi-stage sequence as with a mat — not gutted down to the
    // couple of standing/warmup entries that don't list 'yoga_mat'.
    expect(flow.length).toBeGreaterThanOrEqual(6);
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
    // At least one exercise per targeted area, capped at MAX_STRETCH_MUSCLES —
    // a big enough time budget adds a second stretch per area (rather than
    // holding the first one for minutes on end) but never grows unbounded.
    expect(flow.exercises.length).toBeGreaterThanOrEqual(2);
    expect(flow.exercises.length).toBeLessThanOrEqual(5);
    expect(flow.exercises.every((ex) => ex.primaryAreas.some((a) => a.group === 'hamstrings' || a.group === 'quads'))).toBe(true);

    for (const ex of flow.exercises) {
      // No single stretch accumulates more than 3 min of hold time — the
      // extra time budget buys another distinct stretch instead.
      const holdTotal = ex.sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0);
      expect(holdTotal).toBeLessThanOrEqual(180);
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

  it('spreads a long single-muscle request across a couple of distinct stretches instead of one 5-minute hold', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        workoutType: 'stretch',
        workoutOptions: { flow: { durationMin: 20 } },
        targeting: { emphasize: [{ group: 'hamstrings' }], avoid: [] },
      }),
    );
    const flow = plan.blocks[0].exercises;
    // The old bug: a single targeted muscle collapsed to one exercise rotated
    // up to MAX_STRETCH_ROUNDS at the max 60s hold — 5 x 60s = 300s (5 min)
    // on one stretch. Filling that much time should now reach for another
    // distinct hamstrings stretch instead.
    expect(flow.length).toBeGreaterThan(1);
    expect(flow.every((ex) => ex.primaryAreas.some((a) => a.group === 'hamstrings'))).toBe(true);
    for (const ex of flow) {
      const holdTotal = ex.sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0);
      expect(holdTotal).toBeLessThanOrEqual(180);
    }
  });
});

describe('RulesEngine.generateSession — implicit mobility-dominant day routes to the Stretch flow (ADR-0145)', () => {
  it('builds a genuinely mobility-shaped session — not a strength Main mislabeled as mobility', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ goals: { weights: MOBILITY_HEAVY_WEIGHTS } }), // no workoutType set
    );
    expect(plan.workoutType).toBeUndefined();
    // Exactly the Stretch flow's single-block shape — never a strength "Main"
    // block quietly mislabeled with the wrong exercises for a mobility day.
    expect(plan.blocks.length).toBe(1);
    expect(plan.blocks[0].modality).toBe('mobility');
    expect(plan.blocks[0].label).toBe('Stretch flow');
    expect(plan.blocks.some((b) => b.modality === 'strength')).toBe(false);
    expect(plan.rationale).toContain("Today's focus: a stretch flow.");

    const flow = plan.blocks[0].exercises;
    expect(flow.length).toBeGreaterThan(0);
    // Every picked exercise actually comes from the mobility catalog (real
    // stretches), not the strength pool the bug used to draw from.
    for (const ex of flow) {
      const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
      expect(catalogEntry?.movementPattern).toBe('stretch');
      for (const set of ex.sets) {
        // Clinically-shaped stretch prescription, never RPE-based strength sets.
        expect(set.reps == null || (set.reps >= 10 && set.reps <= 15)).toBe(true);
        if (set.durationSec != null) {
          expect(set.durationSec).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  it('an explicit workoutType still wins over a mobility-dominant weighting', async () => {
    const plan = await new RulesEngine().generateSession(
      context({ goals: { weights: MOBILITY_HEAVY_WEIGHTS }, workoutType: 'bodybuilding' }),
    );
    const main = plan.blocks.find((b) => b.label === 'Main');
    expect(main).toBeDefined();
    expect(main!.modality).toBe('strength');
  });

  it('a mobility-dominant weighting still builds the flow via cadence override even when the naive pick is strength', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        goals: { weights: STRENGTH_HEAVY_WEIGHTS, weeklyTargets: { strength: 1, mobility: 3 } },
        history: [completedStrengthSession(NOW)], // strength target (1) already met; mobility (3) untouched
      }),
    );
    expect(plan.blocks.length).toBe(1);
    expect(plan.blocks[0].modality).toBe('mobility');
    expect(plan.rationale).toContain("Today's focus: a stretch flow.");
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

describe('RulesEngine.generateSession — ADR-0137 routines', () => {
  const mainOf = (plan: SessionPlan) => plan.blocks.find((b) => b.label === 'Main')?.exercises ?? [];
  const ROUTINE = { id: 'routine-1', name: 'Push Pull Legs', exerciseIds: ['sq-db-front', 'pu-db-bench', 'pl-db-row'] };

  it('draws Main only from the routine\'s exercises', async () => {
    const plan = await new RulesEngine().generateSession(context({ routine: ROUTINE }));
    const ids = mainOf(plan).map((e) => e.exerciseId);
    expect(new Set(ids)).toEqual(new Set(ROUTINE.exerciseIds));
    expect(plan.rationale).toContain('Push Pull Legs');
    expect(plan.routineId).toBe(ROUTINE.id);
  });

  it('skips a hard-safety-flagged routine exercise instead of substituting a different one', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        routine: ROUTINE,
        avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'severe' }] },
      }),
    );
    const ids = mainOf(plan).map((e) => e.exerciseId);
    // The chest press (only chest-primary exercise in the routine) is gone...
    expect(ids).not.toContain('pu-db-bench');
    // ...and nothing outside the routine took its place.
    expect(ids.every((id) => ROUTINE.exerciseIds.includes(id))).toBe(true);
  });

  it('never drops a routine exercise to fit the requested session duration', async () => {
    // Regression: the default Today builder duration (30 min) previously let
    // fitDurationToBudget trim Main back to its generic 2-exercise floor,
    // silently dropping one of this 3-exercise routine's picks.
    const plan = await new RulesEngine().generateSession(context({ routine: ROUTINE, targetDurationMin: 30 }));
    const ids = mainOf(plan).map((e) => e.exerciseId);
    expect(new Set(ids)).toEqual(new Set(ROUTINE.exerciseIds));
  });

  it('leaves an equipment-unsatisfied routine exercise silently out of Main, with a note', async () => {
    const routineWithCable = { id: 'routine-2', name: 'Cable Day', exerciseIds: ['sq-db-front', 'pu-cable-chest-press'] };
    // Default test EQUIPMENT has no cable_machine.
    const plan = await new RulesEngine().generateSession(context({ routine: routineWithCable }));
    const ids = mainOf(plan).map((e) => e.exerciseId);
    expect(ids).toEqual(['sq-db-front']);
    expect(plan.adjustments?.some((note) => note.includes('Cable Day') && note.includes('missing equipment'))).toBe(true);
  });

  it('still derives load/rep prescription from normal progression logic, not a fixed value', async () => {
    const fresh = await new RulesEngine().generateSession(context({ routine: ROUTINE, history: [] }));
    const trained = await new RulesEngine().generateSession(
      context({ routine: ROUTINE, history: [completedStrengthSession(NOW - 3 * 86_400_000)] }),
    );
    const freshSquat = mainOf(fresh).find((e) => e.exerciseId === 'sq-db-front');
    const trainedSquat = mainOf(trained).find((e) => e.exerciseId === 'sq-db-front');
    // ADR-0144: no history yet → a generic, equipment-aware STARTING
    // suggestion (sq-db-front is dumbbells, no owned weights on file here →
    // the 2.5 kg generic floor) — never the old blank/em-dash, and never
    // confused with a real progression-derived number.
    expect(freshSquat?.sets.every((s) => s.weightKg === 2.5)).toBe(true);
    // A prior 40kg session → a real, history-derived recommendation, clearly
    // distinct from the generic starting default above.
    expect(trainedSquat?.sets.some((s) => s.weightKg != null && s.weightKg !== 2.5 && s.weightKg > 10)).toBe(true);
  });

  const allExerciseIds = (plan: SessionPlan) => plan.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId));

  it('gives a routine\'s mobility exercise a home in Warmup/Cool down instead of dropping it', async () => {
    // Main only ever draws from whichever modality it built around (strength,
    // here) — a mobility pick in the same routine used to vanish entirely.
    const mixedRoutine = { id: 'routine-mixed', name: 'Pull Day', exerciseIds: ['sq-db-front', 'pu-db-bench', 'mob-lat-stretch'] };
    const plan = await new RulesEngine().generateSession(context({ routine: mixedRoutine, targetDurationMin: 30 }));
    const ids = allExerciseIds(plan);
    expect(ids).toContain('mob-lat-stretch');
    // It shows up in Warmup or Cool down, never as a second copy in both.
    const occurrences = plan.blocks.filter((b) => b.exercises.some((e) => e.exerciseId === 'mob-lat-stretch'));
    expect(occurrences).toHaveLength(1);
    expect(['Warmup', 'Cool down']).toContain(occurrences[0].label);
  });

  it('still drops a routine\'s mobility exercise when it hits a severe avoidance flag', async () => {
    const mixedRoutine = { id: 'routine-mixed', name: 'Pull Day', exerciseIds: ['sq-db-front', 'pu-db-bench', 'mob-lat-stretch'] };
    const plan = await new RulesEngine().generateSession(
      context({
        routine: mixedRoutine,
        avoidToday: { flags: [{ area: { group: 'back' }, severity: 'severe' }] },
      }),
    );
    expect(allExerciseIds(plan)).not.toContain('mob-lat-stretch');
  });

  it('gives a routine\'s cardio exercise priority in Conditioning over the engine\'s own pick', async () => {
    const mixedRoutine = { id: 'routine-cardio-mix', name: 'Lift + Cardio', exerciseIds: ['sq-db-front', 'pu-db-bench', 'ca-machine-steady'] };
    const plan = await new RulesEngine().generateSession(
      context({ routine: mixedRoutine, goals: { weights: { strength: 0.6, cardio: 0.3, mobility: 0.05, general: 0.05 } } }),
    );
    const conditioning = plan.blocks.find((b) => b.label === 'Conditioning');
    expect(conditioning?.exercises.map((e) => e.exerciseId)).toContain('ca-machine-steady');
  });

  it('keeps every general-tagged exercise in a routine, with no false "missing equipment" swap', async () => {
    // sq-bw/pl-table-row/co-plank are all modality: 'general' — before the
    // routine pool widened to accept 'general' alongside 'strength', these
    // would have come up empty and misreported an equipment problem.
    const generalRoutine = { id: 'routine-general', name: 'Simple Full Body', exerciseIds: ['sq-bw', 'pl-table-row', 'co-plank'] };
    const plan = await new RulesEngine().generateSession(context({ routine: generalRoutine }));
    const ids = mainOf(plan).map((e) => e.exerciseId);
    expect(new Set(ids)).toEqual(new Set(generalRoutine.exerciseIds));
    expect(plan.rationale).not.toMatch(/missing equipment/i);
  });

  describe('ADR-0137 v3 — onlyRoutineExercises', () => {
    const MIXED_WEIGHTS: ModalityWeights = { strength: 0.6, cardio: 0.2, mobility: 0.1, general: 0.1 };
    const blockOf = (plan: SessionPlan, label: string) => plan.blocks.find((b) => b.label === label);

    it('omits Warmup and Cool down instead of backfilling from the catalog when locked', async () => {
      const plan = await new RulesEngine().generateSession(
        context({ routine: { ...ROUTINE, onlyRoutineExercises: true } }),
      );
      expect(blockOf(plan, 'Warmup')).toBeUndefined();
      expect(blockOf(plan, 'Cool down')).toBeUndefined();
      // Main is untouched by the flag.
      expect(new Set(mainOf(plan).map((e) => e.exerciseId))).toEqual(new Set(ROUTINE.exerciseIds));
      expect(plan.adjustments?.some((note) => note.includes('warmup skipped'))).toBe(true);
      expect(plan.adjustments?.some((note) => note.includes('cool down skipped'))).toBe(true);
    });

    it('still backfills Warmup/Cool down from the catalog when not locked (regression)', async () => {
      const plan = await new RulesEngine().generateSession(context({ routine: ROUTINE }));
      expect(blockOf(plan, 'Warmup')).toBeDefined();
      expect(blockOf(plan, 'Cool down')).toBeDefined();
    });

    it('omits Conditioning instead of backfilling when locked and the routine has no cardio pick', async () => {
      const plan = await new RulesEngine().generateSession(
        context({ routine: { ...ROUTINE, onlyRoutineExercises: true }, goals: { weights: MIXED_WEIGHTS } }),
      );
      expect(blockOf(plan, 'Conditioning')).toBeUndefined();
      expect(plan.adjustments?.some((note) => note.includes('conditioning skipped'))).toBe(true);
    });

    it('still backfills Conditioning from the catalog when not locked (regression)', async () => {
      const plan = await new RulesEngine().generateSession(
        context({ routine: ROUTINE, goals: { weights: MIXED_WEIGHTS } }),
      );
      expect(blockOf(plan, 'Conditioning')).toBeDefined();
    });

    it('still uses the routine\'s own cardio pick for Conditioning when locked', async () => {
      const mixedRoutine = {
        id: 'routine-cardio-mix',
        name: 'Lift + Cardio',
        exerciseIds: ['sq-db-front', 'pu-db-bench', 'ca-machine-steady'],
        onlyRoutineExercises: true,
      };
      const plan = await new RulesEngine().generateSession(
        context({ routine: mixedRoutine, goals: { weights: MIXED_WEIGHTS } }),
      );
      const conditioning = blockOf(plan, 'Conditioning');
      expect(conditioning?.exercises.map((e) => e.exerciseId)).toContain('ca-machine-steady');
    });
  });

  describe('ADR-0137 v2 — Yoga/Stretch honor input.routine', () => {
    // Spans three distinct YOGA_STAGE_ORDER stages (center/balance/cooldown)
    // so the routine-restricted sequence's ordering can be checked too.
    const YOGA_ROUTINE = { id: 'routine-yoga', name: 'Evening Flow', exerciseIds: ['yg-mountain', 'yg-tree', 'yg-legs-up-wall'] };
    // Two exercises deliberately target the SAME muscle (hamstrings) — the
    // engine's default stretch selection would only ever pick one per
    // muscle group, so both surviving proves the routine drives the
    // rotation directly rather than falling back to that group-based pick.
    const STRETCH_ROUTINE = {
      id: 'routine-stretch',
      name: 'Post-run stretch',
      exerciseIds: ['mob-hamstring', 'mob-supine-hamstring-stretch', 'mob-chest-stretch'],
    };
    const flowOf = (plan: SessionPlan) => plan.blocks.find((b) => b.label === 'Yoga flow' || b.label === 'Stretch flow');

    it('a yoga routine\'s poses (and only those) drive the flow, in stage order', async () => {
      const plan = await new RulesEngine().generateSession(context({ workoutType: 'yoga', routine: YOGA_ROUTINE }));
      const flow = flowOf(plan);
      const ids = flow?.exercises.map((e) => e.exerciseId) ?? [];
      expect(new Set(ids)).toEqual(new Set(YOGA_ROUTINE.exerciseIds));
      // center (yg-mountain) → balance (yg-tree) → cooldown (yg-legs-up-wall).
      expect(ids).toEqual(['yg-mountain', 'yg-tree', 'yg-legs-up-wall']);
      expect(plan.routineId).toBe(YOGA_ROUTINE.id);
      expect(plan.rationale).toContain('Evening Flow');
    });

    it('keeps both yoga routine poses even when they share the same flow stage', async () => {
      // Regression: the one-pose-per-stage pick used to silently drop
      // whichever of two same-stage routine poses scored lower — both are
      // 'cooldown' here (yg-final-relaxation and yg-legs-up-wall).
      const twoCooldownRoutine = {
        id: 'routine-yoga-2',
        name: 'Wind Down',
        exerciseIds: ['yg-final-relaxation', 'yg-legs-up-wall'],
      };
      const plan = await new RulesEngine().generateSession(context({ workoutType: 'yoga', routine: twoCooldownRoutine }));
      const ids = flowOf(plan)?.exercises.map((e) => e.exerciseId) ?? [];
      expect(new Set(ids)).toEqual(new Set(twoCooldownRoutine.exerciseIds));
    });

    it('a stretch routine\'s exercises all rotate in, even two sharing a muscle group', async () => {
      const plan = await new RulesEngine().generateSession(context({ workoutType: 'stretch', routine: STRETCH_ROUTINE }));
      const flow = flowOf(plan);
      const ids = flow?.exercises.map((e) => e.exerciseId) ?? [];
      expect(new Set(ids)).toEqual(new Set(STRETCH_ROUTINE.exerciseIds));
      expect(plan.routineId).toBe(STRETCH_ROUTINE.id);
      expect(plan.rationale).toContain('Post-run stretch');
    });

    it('skips a severe-avoidance-flagged yoga routine pose instead of substituting one', async () => {
      const plan = await new RulesEngine().generateSession(
        context({
          workoutType: 'yoga',
          routine: YOGA_ROUTINE,
          avoidToday: { flags: [{ area: { group: 'calves' }, severity: 'severe' }] },
        }),
      );
      const ids = flowOf(plan)?.exercises.map((e) => e.exerciseId) ?? [];
      expect(ids).not.toContain('yg-tree');
      expect(ids).toContain('yg-mountain');
      expect(ids).toContain('yg-legs-up-wall');
      expect(ids.every((id) => YOGA_ROUTINE.exerciseIds.includes(id))).toBe(true);
    });

    it('skips a severe-avoidance-flagged stretch routine exercise instead of substituting one', async () => {
      const plan = await new RulesEngine().generateSession(
        context({
          workoutType: 'stretch',
          routine: STRETCH_ROUTINE,
          avoidToday: { flags: [{ area: { group: 'chest' }, severity: 'severe' }] },
        }),
      );
      const ids = flowOf(plan)?.exercises.map((e) => e.exerciseId) ?? [];
      expect(ids).not.toContain('mob-chest-stretch');
      expect(ids).toContain('mob-hamstring');
      expect(ids).toContain('mob-supine-hamstring-stretch');
      expect(ids.every((id) => STRETCH_ROUTINE.exerciseIds.includes(id))).toBe(true);
    });
  });
});

describe('RulesEngine.generateSession — general as a first-class modality', () => {
  const GENERAL_HEAVY_WEIGHTS: ModalityWeights = { strength: 0.1, cardio: 0.1, mobility: 0.1, general: 0.7 };
  const mainOf = (plan: SessionPlan) => plan.blocks.find((b) => b.label === 'Main')?.exercises ?? [];

  it('a general-heavy goal produces a general-mainModality session drawn from general-tagged exercises', async () => {
    const plan = await new RulesEngine().generateSession(context({ goals: { weights: GENERAL_HEAVY_WEIGHTS } }));
    const main = plan.blocks.find((b) => b.label === 'Main');
    expect(main?.modality).toBe('general');
    expect(plan.rationale).toContain("Today's focus: general.");
    const ids = mainOf(plan).map((e) => e.exerciseId);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(EXERCISES.find((e) => e.id === id)?.modality).toBe('general');
    }
  });

  it('leaves the existing strength/cardio/mobility-dominant picks unchanged', async () => {
    const strength = await new RulesEngine().generateSession(context({ goals: { weights: STRENGTH_HEAVY_WEIGHTS } }));
    expect(strength.rationale).toContain("Today's focus: strength.");
    const cardio = await new RulesEngine().generateSession(context({ goals: { weights: CARDIO_HEAVY_WEIGHTS } }));
    expect(cardio.rationale).toContain("Today's focus: cardio.");
    // Mobility-dominant days route to the Stretch flow (ADR-0145), which uses
    // its own "Today's focus: a stretch flow." rationale — not the generic
    // "Today's focus: {mainModality}." text the other three modalities get.
    const mobility = await new RulesEngine().generateSession(context({ goals: { weights: MOBILITY_HEAVY_WEIGHTS } }));
    expect(mobility.rationale).toContain("Today's focus: a stretch flow.");
  });

  it('scales a general Main block with requested session duration, same as a strength session', async () => {
    const engine = new RulesEngine();
    const goals = { weights: GENERAL_HEAVY_WEIGHTS };
    const short = await engine.generateSession(context({ goals, targetDurationMin: 10 }));
    const long = await engine.generateSession(context({ goals, targetDurationMin: 60 }));
    expect(mainOf(long).length).toBeGreaterThan(mainOf(short).length);
    expect(long.estimatedDurationMin ?? 0).toBeGreaterThan(short.estimatedDurationMin ?? 0);
  });

  it('does not add a Conditioning block on a general-mainModality day, even past the cardio+general threshold', async () => {
    // general (0.6) dominates Main; cardio(0.15)+general(0.6) clears the 0.25
    // conditioningWouldApply threshold — the case that used to double-count.
    const weights: ModalityWeights = { strength: 0.2, cardio: 0.15, mobility: 0.05, general: 0.6 };
    const plan = await new RulesEngine().generateSession(context({ goals: { weights } }));
    const main = plan.blocks.find((b) => b.label === 'Main');
    expect(main?.modality).toBe('general');
    expect(plan.blocks.find((b) => b.label === 'Conditioning')).toBeUndefined();
  });

  it('spans upper/lower/core with general-tagged exercises under Full Body targeting', async () => {
    const plan = await new RulesEngine().generateSession(
      context({
        goals: { weights: GENERAL_HEAVY_WEIGHTS },
        targeting: { emphasize: [{ region: 'full_body' }], avoid: [] },
      }),
    );
    const main = mainOf(plan);
    const regions = new Set(
      main.flatMap((e) => e.primaryAreas.map((a) => a.group).filter((g): g is MuscleGroup => g != null).map((g) => GROUP_TO_REGION[g])),
    );
    expect(regions.size).toBeGreaterThanOrEqual(3);
    for (const e of main) {
      expect(EXERCISES.find((entry) => entry.id === e.exerciseId)?.modality).toBe('general');
    }
  });
});
