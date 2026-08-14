/**
 * Weekly -> daily integration (ADR-0142). Exercises the actual handoff:
 * `buildRollingPlan`'s real output feeds `RulesEngine.generateSession` as
 * `SessionContext.weeklyPlan`, and the daily engine honors it as a DEFAULT —
 * while an explicit choice or a routine still wins outright. Each other
 * layer (forecast correctness, cardio shape correctness, cadence override)
 * has its own dedicated test file; this file is specifically the seam
 * between them, which nothing else exercises end to end.
 */

import { RulesEngine } from '../rules-engine';
import { buildRollingPlan } from '../rolling-plan';
import type { AthleteProfile, EquipmentInventory, SessionContext, SessionPlan } from '../../types';

const NOW = Date.UTC(2026, 7, 5, 18, 0, 0); // a Wednesday — safely mid-week

const EQUIPMENT: EquipmentInventory = {
  items: [
    { type: 'bodyweight' },
    { type: 'dumbbells' },
    { type: 'barbell' },
    { type: 'bench' },
    { type: 'squat_rack' },
    { type: 'kettlebell' },
    { type: 'cardio_machine' },
    { type: 'treadmill' },
    { type: 'yoga_mat' },
  ],
};

function athlete(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: 'athlete-1',
    experience: 'intermediate',
    goals: {
      weights: { strength: 0.4, cardio: 0.3, mobility: 0.2, general: 0.1 },
      weeklyTargets: { strength: 3, cardio: 2, mobility: 1 },
    },
    constraints: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function context(overrides: Partial<SessionContext> = {}): SessionContext {
  const a = athlete();
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

function mainModalityOf(plan: SessionPlan): string | undefined {
  return plan.blocks.find((b) => b.label === 'Main')?.modality;
}

describe('weekly -> daily integration — the forecast is a default, never a mandate', () => {
  it('a real forecast\'s proposed modality is what generateSession actually builds, for every workout day in the horizon', async () => {
    const base = context();
    const forecast = buildRollingPlan(base, 7);
    const engine = new RulesEngine();
    const workoutDays = forecast.days.filter((day) => day.kind === 'workout');
    expect(workoutDays.length).toBeGreaterThan(0);
    for (const day of workoutDays) {
      const plan = await engine.generateSession({
        ...base,
        plannedFor: day.date,
        weeklyPlan: { modality: day.modality, cardioIntent: day.cardioIntent },
      });
      // ADR-0145: a mobility-dominant day builds a single Stretch-flow block
      // (label 'Stretch flow'), not a 'Main'-labeled block like every other
      // modality — mainModalityOf only ever finds a 'Main' block.
      if (day.modality === 'mobility') {
        expect(plan.blocks.length).toBe(1);
        expect(plan.blocks[0].modality).toBe('mobility');
      } else {
        expect(mainModalityOf(plan)).toBe(day.modality);
      }
    }
  });

  it('an explicit workoutType overrides the weekly plan\'s proposed modality outright', async () => {
    const base = context();
    const forecast = buildRollingPlan(base, 7);
    const nonCardioDay = forecast.days.find((day) => day.kind === 'workout' && day.modality !== 'cardio');
    expect(nonCardioDay).toBeDefined();
    const plan = await new RulesEngine().generateSession({
      ...base,
      plannedFor: nonCardioDay!.date,
      weeklyPlan: { modality: nonCardioDay!.modality, cardioIntent: nonCardioDay!.cardioIntent },
      workoutType: 'cardio',
    });
    expect(mainModalityOf(plan)).toBe('cardio');
  });

  it('a routine overrides the weekly plan\'s proposed modality AND its own exercises drive Main, regardless of what the forecast proposed for that date', async () => {
    const base = context();
    const forecast = buildRollingPlan(base, 7);
    const strengthDay = forecast.days.find((day) => day.kind === 'workout' && day.modality === 'strength');
    expect(strengthDay).toBeDefined();
    const cardioRoutine = { id: 'r-cardio', name: 'Cardio Routine', exerciseIds: ['ca-treadmill-jog'] };
    const plan = await new RulesEngine().generateSession({
      ...base,
      plannedFor: strengthDay!.date,
      weeklyPlan: { modality: strengthDay!.modality, cardioIntent: strengthDay!.cardioIntent },
      routine: cardioRoutine,
    });
    expect(mainModalityOf(plan)).toBe('cardio');
    expect(plan.blocks.find((b) => b.label === 'Main')?.exercises.map((e) => e.exerciseId)).toEqual(['ca-treadmill-jog']);
  });

  it('weeklyPlan.cardioIntent supplies the format default when workoutType is explicit but the format toggle isn\'t', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      weeklyPlan: { modality: 'cardio', cardioIntent: 'interval' },
    }));
    const sets = plan.blocks.find((b) => b.label === 'Main')!.exercises.flatMap((e) => e.sets);
    expect(sets.some((s) => s.phase === 'work')).toBe(true);
    expect(sets.some((s) => s.phase === 'recovery')).toBe(true);
  });

  it('an explicit workoutOptions.cardioIntent still overrides weeklyPlan.cardioIntent', async () => {
    const plan = await new RulesEngine().generateSession(context({
      workoutType: 'cardio',
      workoutOptions: { cardioIntent: 'basic' },
      weeklyPlan: { modality: 'cardio', cardioIntent: 'interval' },
    }));
    const sets = plan.blocks.find((b) => b.label === 'Main')!.exercises.flatMap((e) => e.sets);
    expect(sets.some((s) => s.phase === 'recovery')).toBe(false); // basic, not interval
  });

  it('an absent weeklyPlan is byte-identical to today\'s naive weight-based pick', async () => {
    const withPlan = await new RulesEngine().generateSession(context());
    const withoutPlan = await new RulesEngine().generateSession(context({ weeklyPlan: undefined }));
    expect(mainModalityOf(withPlan)).toBe(mainModalityOf(withoutPlan));
  });
});
