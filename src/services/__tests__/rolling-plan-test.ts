import { needsRollingPlanRefresh, resolveFixedForecastDays, refreshRollingPlan } from '../rolling-plan';
import { isoWeekStart } from '@/domain/metrics';
import type { AthleteProfile, EquipmentInventory, ModalityWeights, ReadinessInput, Routine, RollingPlan, SessionContext, SessionRecord } from '@/domain/types';

// refreshRollingPlan persists via getAthleteProfile/saveAthleteProfile and
// logs via logDecision — both go through the persistence port. An in-memory
// stub mirrors the pattern already used in services/__tests__/athlete-test.ts.
jest.mock('@/data/persistence', () => {
  let athleteRow: { id: string; profileJson: string; createdAt: number; updatedAt: number } | undefined;
  const decisionRows: unknown[] = [];
  return {
    getAthlete: () => athleteRow,
    saveAthlete: (row: { profileJson: string }) => {
      athleteRow = { id: 'me', profileJson: row.profileJson, createdAt: 1, updatedAt: 1 };
    },
    insertDecision: (row: unknown) => { decisionRows.push(row); },
    listDecisions: () => decisionRows,
    countDecisions: () => decisionRows.length,
  };
});

const DAY_MS = 86_400_000;
// Local (not UTC) noon — matches the localDay() convention `needsRollingPlanRefresh`
// uses internally, which calls `setHours(12, ...)` in the local timezone.
const GENERATED_FOR_DAY = new Date(2026, 6, 22, 12, 0, 0).getTime();
const NEXT_DAY = GENERATED_FOR_DAY + DAY_MS;

function plan(overrides: Partial<RollingPlan> = {}): RollingPlan {
  return {
    id: 'rolling-1',
    generatedAt: GENERATED_FOR_DAY,
    generatedForDay: GENERATED_FOR_DAY,
    horizonDays: 7,
    days: [
      { date: GENERATED_FOR_DAY, kind: 'workout', modality: 'strength' },
      { date: NEXT_DAY, kind: 'workout', modality: 'strength' },
    ],
    rationale: 'test',
    deloadRecommended: false,
    ...overrides,
  };
}

function completed(at: number): SessionRecord {
  return { id: 's', planId: 'p', plannedFor: at, completedAt: at, performed: [] };
}

describe('needsRollingPlanRefresh', () => {
  it('is true when there is no plan yet', () => {
    expect(needsRollingPlanRefresh({ rollingPlan: undefined, scheduledWorkouts: [] }, [], GENERATED_FOR_DAY)).toBe(true);
  });

  it('is false the same day, with no new completions and no missed day', () => {
    expect(
      needsRollingPlanRefresh({ rollingPlan: plan(), scheduledWorkouts: [] }, [], GENERATED_FOR_DAY + 60_000),
    ).toBe(false);
  });

  it('is true once a session completes after the plan was generated (trigger 1: after a workout)', () => {
    const history = [completed(GENERATED_FOR_DAY + 3600_000)];
    expect(
      needsRollingPlanRefresh({ rollingPlan: plan(), scheduledWorkouts: [] }, history, GENERATED_FOR_DAY + 7200_000),
    ).toBe(true);
  });

  it('is true on a new day when a forecasted workout day was neither completed nor scheduled (trigger 2: missed day)', () => {
    expect(
      needsRollingPlanRefresh({ rollingPlan: plan(), scheduledWorkouts: [] }, [], NEXT_DAY + DAY_MS),
    ).toBe(true);
  });

  it('is false on a new day when the forecasted workout day was already completed before the plan was generated', () => {
    // Completed slightly before generatedAt so it doesn't also trip trigger 1
    // (a *new* completion since generation) — this isolates trigger 2 alone.
    const history = [completed(GENERATED_FOR_DAY - 1_000)];
    expect(
      needsRollingPlanRefresh({ rollingPlan: plan(), scheduledWorkouts: [] }, history, GENERATED_FOR_DAY + DAY_MS + 60_000),
    ).toBe(false);
  });

  it('is false on a new day when the forecasted workout day was manually scheduled instead', () => {
    expect(
      needsRollingPlanRefresh(
        { rollingPlan: plan(), scheduledWorkouts: [{ plannedFor: GENERATED_FOR_DAY }] },
        [],
        GENERATED_FOR_DAY + DAY_MS + 60_000,
      ),
    ).toBe(false);
  });
});

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'Test Routine',
    exerciseIds: ['sq-db-front'],
    createdAt: GENERATED_FOR_DAY,
    updatedAt: GENERATED_FOR_DAY,
    ...overrides,
  };
}

function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

describe('resolveFixedForecastDays — item 4: second-week (14-day horizon) resolution', () => {
  it('resolves a recurring routine correctly on second-week offsets, not just within the first 7 days', () => {
    const secondWeekOffset = 10;
    const otherOffset = 13;
    const secondWeekDate = GENERATED_FOR_DAY + secondWeekOffset * DAY_MS;
    const otherDate = GENERATED_FOR_DAY + otherOffset * DAY_MS;
    const secondWeekWeekday = new Date(secondWeekDate).getDay();
    const otherWeekday = new Date(otherDate).getDay();
    // Guard the premise: these two offsets must land on different weekdays,
    // or the assertions below wouldn't actually isolate second-week resolution.
    expect(secondWeekWeekday).not.toBe(otherWeekday);

    const r = routine({ recurrenceDaysOfWeek: [secondWeekWeekday] });
    const fixed = resolveFixedForecastDays(GENERATED_FOR_DAY, 14, [r], []);

    expect(fixed.some((day) => day.date === localDay(secondWeekDate))).toBe(true);
    expect(fixed.some((day) => day.date === localDay(otherDate))).toBe(false);
  });

  it('resolves an explicit ScheduledWorkout tied to a routine on a second-week date too', () => {
    const offset = 11;
    const date = GENERATED_FOR_DAY + offset * DAY_MS;
    const r = routine({ id: 'r2' }); // no recurrenceDaysOfWeek — only the explicit scheduling should fix this date
    const fixed = resolveFixedForecastDays(GENERATED_FOR_DAY, 14, [r], [{ plannedFor: date, routineId: 'r2' }]);

    expect(fixed.some((day) => day.date === localDay(date) && day.modality === 'strength')).toBe(true);
  });
});

const WEEK_MS = 7 * DAY_MS;
// A fixed mid-week point within each week, matching systemic-load-test.ts's
// own fixture convention, so the weekly-load buckets used below land cleanly.
const MID = 2 * DAY_MS + 12 * 3_600_000;
const THIS_WEEK = isoWeekStart(GENERATED_FOR_DAY);
const EQUIPMENT: EquipmentInventory = { items: [{ type: 'bodyweight' }] };
const WEIGHTS: ModalityWeights = { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 };

function session(at: number, opts: { minutes?: number; readiness?: ReadinessInput; id?: string; exerciseId?: string } = {}): SessionRecord {
  const { minutes = 45, readiness, id, exerciseId = 'bench' } = opts;
  return {
    id: id ?? `s-${at}`,
    planId: 'p',
    plannedFor: at,
    completedAt: at,
    startedAt: at - minutes * 60_000,
    readiness,
    performed: [
      { exerciseId, name: 'Exercise', primaryAreas: [{ group: 'chest' }], sets: [{ reps: 10, weightKg: 60, rpe: 7, completed: true }] },
    ],
    debrief: { overallRpe: 7 },
  };
}

function athleteProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: 'me',
    experience: 'intermediate',
    goals: { weights: WEIGHTS, weeklyTargets: { strength: 4 } },
    constraints: [],
    createdAt: GENERATED_FOR_DAY,
    updatedAt: GENERATED_FOR_DAY,
    ...overrides,
  };
}

function sessionContext(history: SessionRecord[]): SessionContext {
  const a = athleteProfile();
  return {
    athlete: a,
    equipment: EQUIPMENT,
    history,
    fatigue: { byGroup: {}, updatedAt: GENERATED_FOR_DAY },
    readiness: {},
    goals: a.goals,
    targeting: { emphasize: [], avoid: [] },
    avoidToday: { flags: [] },
    plannedFor: GENERATED_FOR_DAY,
  };
}

describe('refreshRollingPlan — item 2: systemic deload surfacing end to end', () => {
  it('surfaces deloadRecommended when history shows a genuine rising-load + rough-checkin pattern', () => {
    const rough: ReadinessInput = { energy: 2, sleepQuality: 2, soreness: 4 };
    const history: SessionRecord[] = [
      session(THIS_WEEK - 4 * WEEK_MS + MID, { minutes: 30, id: 'w4' }),
      session(THIS_WEEK - 3 * WEEK_MS + MID, { minutes: 45, id: 'w3' }),
      session(THIS_WEEK - 2 * WEEK_MS + MID, { minutes: 60, id: 'w2' }),
      session(THIS_WEEK - 1 * WEEK_MS + MID, { minutes: 90, id: 'w1' }),
      session(GENERATED_FOR_DAY - DAY_MS, { readiness: rough, id: 'r1' }),
      session(GENERATED_FOR_DAY - 2 * DAY_MS, { readiness: rough, id: 'r2' }),
      session(GENERATED_FOR_DAY - 3 * DAY_MS, { readiness: rough, id: 'r3' }),
    ];
    const result = refreshRollingPlan(sessionContext(history));
    expect(result.deloadRecommended).toBe(true);
    expect(result.deloadNote).toMatch(/climbed \d+ weeks running/);
  });

  it('does not flag deload for an ordinary, unremarkable training history', () => {
    const history: SessionRecord[] = [session(GENERATED_FOR_DAY - DAY_MS), session(GENERATED_FOR_DAY - 3 * DAY_MS)];
    const result = refreshRollingPlan(sessionContext(history));
    expect(result.deloadRecommended).toBe(false);
    expect(result.deloadNote).toBeUndefined();
  });
});

function cardioWorkoutDayCount(plan: RollingPlan): number {
  return plan.days.filter((day) => day.kind === 'workout' && day.modality === 'cardio').length;
}

describe('refreshRollingPlan — item 5: goal-weighted catch-up bias, end to end', () => {
  it('classifies real history by catalog modality and biases the forecast toward whichever modality was actually skipped', () => {
    const mixedGoals = athleteProfile({ goals: { weights: { strength: 0.5, cardio: 0.5, mobility: 0, general: 0 }, weeklyTargets: { strength: 2, cardio: 2 } } });
    // Same total session count in both histories (so `owed` matches) — only
    // WHICH modality was actually trained differs.
    const strengthOnly: SessionRecord[] = [
      session(GENERATED_FOR_DAY - 1 * DAY_MS, { exerciseId: 'sq-db-front', id: 'a1' }),
      session(GENERATED_FOR_DAY - 2 * DAY_MS, { exerciseId: 'sq-db-front', id: 'a2' }),
    ];
    const cardioOnly: SessionRecord[] = [
      session(GENERATED_FOR_DAY - 1 * DAY_MS, { exerciseId: 'ca-machine-steady', id: 'b1' }),
      session(GENERATED_FOR_DAY - 2 * DAY_MS, { exerciseId: 'ca-machine-steady', id: 'b2' }),
    ];
    const planAfterStrengthOnly = refreshRollingPlan({ ...sessionContext(strengthOnly), athlete: mixedGoals, goals: mixedGoals.goals });
    const planAfterCardioOnly = refreshRollingPlan({ ...sessionContext(cardioOnly), athlete: mixedGoals, goals: mixedGoals.goals });
    // Cardio was skipped in the first scenario (should get a real catch-up
    // bias) and already covered in the second (shouldn't) — the forecast's
    // cardio-day count should reflect that real, classified difference.
    expect(cardioWorkoutDayCount(planAfterStrengthOnly)).toBeGreaterThan(cardioWorkoutDayCount(planAfterCardioOnly));
  });
});
