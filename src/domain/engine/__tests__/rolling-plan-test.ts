import { buildRollingPlan, type FixedForecastDay } from '../rolling-plan';
import type { SystemicState } from '../systemic-load';
import { ALL_MUSCLE_GROUPS } from '../../types';
import type { AthleteProfile, EquipmentInventory, Modality, ModalityWeights, MuscleGroup, RollingPlanDay, SessionContext, SessionRecord } from '../../types';

/** Fills every muscle group with a high (fatigued) score, then overrides the
 * given ones — avoids sort ties among the many groups the test doesn't care
 * about, which would otherwise win by array-order stability at 0. */
function fatigueByGroup(overrides: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, number> {
  const base = Object.fromEntries(ALL_MUSCLE_GROUPS.map((group) => [group, 0.8])) as Record<MuscleGroup, number>;
  return { ...base, ...overrides };
}

const NOW = Date.UTC(2026, 6, 22, 18, 0, 0); // a Wednesday — safely mid-week
const DAY_MS = 86_400_000;

const EQUIPMENT: EquipmentInventory = { items: [{ type: 'bodyweight' }, { type: 'dumbbells' }] };
const WEIGHTS: ModalityWeights = { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 };

function athlete(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: 'athlete-1',
    experience: 'intermediate',
    goals: { weights: WEIGHTS, weeklyTargets: { strength: 4 } },
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

function completedSession(completedAt: number, id: string): SessionRecord {
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

describe('buildRollingPlan — cadence distribution', () => {
  it('spreads the weekly target evenly across a 7-day horizon with no history', () => {
    const plan = buildRollingPlan(context(), 7);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    expect(workoutDays).toHaveLength(4);
    expect(plan.days).toHaveLength(7);
    expect(plan.generatedForDay).toBeLessThanOrEqual(NOW);
  });

  it('carries the same cadence across a 14-day horizon (roughly double the count)', () => {
    const plan = buildRollingPlan(context(), 14);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    // 4/week over two weeks; no reflow triggers with empty history.
    expect(workoutDays.length).toBeGreaterThanOrEqual(7);
    expect(workoutDays.length).toBeLessThanOrEqual(9);
  });

  it('never proposes a workout on the same day twice in a row for a light cadence', () => {
    const light = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 2 } } });
    const plan = buildRollingPlan(context({ athlete: light, goals: light.goals }), 7);
    for (let i = 0; i < plan.days.length - 1; i += 1) {
      if (plan.days[i].kind === 'workout') expect(plan.days[i + 1].kind).toBe('rest');
    }
  });

  it('interleaves modalities across the week instead of grouping them (e.g. not 3 strength days in a row)', () => {
    const mixed = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 3, cardio: 2, mobility: 1 } } });
    const plan = buildRollingPlan(context({ athlete: mixed, goals: mixed.goals }), 7);
    const modalities = plan.days.filter((d) => d.kind === 'workout').map((d) => d.modality);
    expect(modalities).toHaveLength(6);
    let longestStreak = 1;
    let streak = 1;
    for (let i = 1; i < modalities.length; i += 1) {
      streak = modalities[i] === modalities[i - 1] ? streak + 1 : 1;
      longestStreak = Math.max(longestStreak, streak);
    }
    expect(longestStreak).toBeLessThanOrEqual(2); // never 3+ of the same modality back to back
  });
});

describe('buildRollingPlan — default weekly frequency by experience x dominant goal (item 3)', () => {
  function freshAthlete(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
    // No weeklyTargets at all — forces the defaultWeeklyFrequencyFor fallback,
    // not the explicit-total path.
    return athlete({ goals: { weights: WEIGHTS }, ...overrides });
  }

  function workoutDayCount(a: AthleteProfile): number {
    const plan = buildRollingPlan(context({ athlete: a, goals: a.goals, history: [] }), 7);
    return plan.days.filter((day) => day.kind === 'workout').length;
  }

  it('beginner, general-dominant weighting defaults to 3/week', () => {
    const a = freshAthlete({ experience: 'beginner', goals: { weights: { strength: 0.2, cardio: 0.2, mobility: 0.2, general: 0.4 } } });
    expect(workoutDayCount(a)).toBe(3);
  });

  it('advanced, strength-dominant weighting defaults to 5/week', () => {
    const a = freshAthlete({ experience: 'advanced', goals: { weights: WEIGHTS } }); // WEIGHTS is strength-heavy
    expect(workoutDayCount(a)).toBe(5);
  });

  it('intermediate, cardio-dominant weighting defaults to 4/week', () => {
    const a = freshAthlete({ experience: 'intermediate', goals: { weights: { strength: 0.1, cardio: 0.7, mobility: 0.1, general: 0.1 } } });
    expect(workoutDayCount(a)).toBe(4);
  });

  it('advanced, general-dominant weighting defaults to 4/week, distinct from strength\'s 5', () => {
    // Confirms dominantModalityOf's argmax genuinely resolves 'general' (not
    // folding it into strength) — advanced is the one tier where the two
    // columns differ (5 vs 4), so this is the tier that actually exercises
    // the fix rather than passing coincidentally either way.
    const a = freshAthlete({ experience: 'advanced', goals: { weights: { strength: 0.1, cardio: 0.1, mobility: 0.1, general: 0.7 } } });
    expect(workoutDayCount(a)).toBe(4);
  });

  it('advanced, tied strength/general weighting resolves the tie to general\'s column (4/week)', () => {
    const a = freshAthlete({ experience: 'advanced', goals: { weights: { strength: 0.35, cardio: 0.1, mobility: 0.2, general: 0.35 } } });
    expect(workoutDayCount(a)).toBe(4);
  });

  it('a nonzero explicit weeklyTargets total still wins outright over the table', () => {
    const a = athlete({ experience: 'beginner', goals: { weights: WEIGHTS, weeklyTargets: { strength: 6 } } });
    expect(workoutDayCount(a)).toBe(6); // beginner's table default would be 3
  });

  it('a nonzero weeklyTotalTarget wins outright over the table, with no weeklyTargets set', () => {
    const a = freshAthlete({ experience: 'beginner', goals: { weights: WEIGHTS, weeklyTotalTarget: 6 } });
    expect(workoutDayCount(a)).toBe(6); // beginner's table default would be 3
  });

  it('weeklyTotalTarget wins over a weeklyTargets sum when both are set', () => {
    const a = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 2 }, weeklyTotalTarget: 5 } });
    expect(workoutDayCount(a)).toBe(5);
  });

  it('a weeklyTotalTarget-only goal apportions modalities proportionally to weights, not evenly', () => {
    const a = freshAthlete({ goals: { weights: WEIGHTS, weeklyTotalTarget: 5 } }); // WEIGHTS: strength 0.7
    const plan = buildRollingPlan(context({ athlete: a, goals: a.goals, history: [] }), 7);
    const modalities = plan.days.filter((d) => d.kind === 'workout').map((d) => d.modality);
    expect(modalities).toHaveLength(5);
    expect(modalities.filter((m) => m === 'strength').length).toBeGreaterThanOrEqual(3);
  });

  it('a zero weeklyTotalTarget falls back to the default-frequency table, same as unset', () => {
    const a = freshAthlete({ experience: 'beginner', goals: { weights: WEIGHTS, weeklyTotalTarget: 0 } });
    expect(workoutDayCount(a)).toBe(3);
  });
});

describe('buildRollingPlan — missed-day reflow', () => {
  it('does not treat a brand-new athlete (no history) as having missed anything', () => {
    const plan = buildRollingPlan(context({ history: [] }), 7);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    expect(workoutDays).toHaveLength(4); // exactly the weekly target, no catch-up inflation
  });

  it('adds catch-up sessions (capped) when the trailing week fell short, instead of dropping them', () => {
    const trailingWeekAgo = NOW - 6 * DAY_MS;
    const withGap = context({
      history: [completedSession(trailingWeekAgo, 'sess-1')], // only 1 of 4 done in the trailing week
    });
    const plan = buildRollingPlan(withGap, 7);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    // expectedSessions(4) + min(2, owed=3) = 6, capped to the 7-day horizon.
    expect(workoutDays).toHaveLength(6);
  });

  it('caps catch-up at +2 even when the entire trailing week was missed', () => {
    const noneDone = context({ history: [completedSession(NOW - 30 * DAY_MS, 'sess-old')] }); // history exists but nothing in trailing week
    const plan = buildRollingPlan(noneDone, 7);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    expect(workoutDays).toHaveLength(6); // 4 + cap(2), never all 7 days
  });
});

describe('buildRollingPlan — priority muscles', () => {
  it('favors muscle groups with lower current fatigue for the earliest workout day', () => {
    const plan = buildRollingPlan(
      context({ fatigue: { byGroup: fatigueByGroup({ chest: 0.9, back: 0.05, quads: 0.1 }), updatedAt: NOW } }),
      7,
    );
    const firstWorkout = plan.days.find((day) => day.kind === 'workout');
    expect(firstWorkout?.priorityMuscles).toContain('back');
    expect(firstWorkout?.priorityMuscles).not.toContain('chest');
  });

  it('lets explicit targeting.emphasize override the fatigue projection on every workout day', () => {
    const plan = buildRollingPlan(
      context({
        fatigue: { byGroup: { chest: 0.05 }, updatedAt: NOW },
        targeting: { emphasize: [{ group: 'chest' }], avoid: [] },
      }),
      7,
    );
    for (const day of plan.days.filter((d) => d.kind === 'workout')) {
      expect(day.priorityMuscles).toEqual(['chest']);
    }
  });

  it('excludes areas the athlete has flagged as a hard "avoid" constraint on every day', () => {
    const withConstraint = athlete({ constraints: [{ area: { group: 'lower_back' }, severity: 'avoid' }] });
    const plan = buildRollingPlan(
      context({
        athlete: withConstraint,
        fatigue: { byGroup: fatigueByGroup({ lower_back: 0.0 }), updatedAt: NOW }, // would otherwise be the freshest group
      }),
      7,
    );
    for (const day of plan.days.filter((d) => d.kind === 'workout')) {
      expect(day.priorityMuscles).not.toContain('lower_back');
    }
  });

  it('rotates focus across consecutive workout days instead of repeating the same pair (cumulative self-fatigue)', () => {
    // No real fatigue signal at all — every group ties at 0. Without treating
    // its own earlier picks as fatigue, the forecast would pick the same
    // top-2 (array-order) muscles for every single workout day.
    const plan = buildRollingPlan(context({ fatigue: { byGroup: {}, updatedAt: NOW } }), 7);
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    expect(workoutDays.length).toBeGreaterThan(1);
    for (let i = 1; i < workoutDays.length; i += 1) {
      const prev = new Set(workoutDays[i - 1].priorityMuscles);
      const current = workoutDays[i].priorityMuscles ?? [];
      // At least one of today's two priority muscles must differ from
      // yesterday's pair — the forecast isn't stuck repeating itself.
      expect(current.some((group) => !prev.has(group))).toBe(true);
    }
  });

  it('only applies today\'s avoidToday flags to the first day, not later forecasted days', () => {
    const plan = buildRollingPlan(
      context({
        fatigue: { byGroup: fatigueByGroup({ hamstrings: 0.0 }), updatedAt: NOW }, // freshest group throughout
        avoidToday: { flags: [{ area: { group: 'hamstrings' }, severity: 'mild' }] },
      }),
      7,
    );
    const workoutDays = plan.days.filter((day) => day.kind === 'workout');
    expect(workoutDays[0]?.priorityMuscles).not.toContain('hamstrings');
    const later = workoutDays.slice(1).find((day) => day.priorityMuscles?.includes('hamstrings'));
    expect(later).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ADR-0142: the weekly engine — goal adherence, cardio format variety,
// multi-week stability, and routine (fixed-day) awareness.
// ---------------------------------------------------------------------------

/** Mirrors rolling-plan.ts's own internal `localDay` — not exported, so
 * tests that need to address a specific forecast date replicate it exactly. */
function localDayOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

describe('buildRollingPlan — ADR-0142 goal adherence over a longer horizon', () => {
  it('a 28-day forecast\'s modality distribution matches explicit weekly targets, not just the ratio of a single week', () => {
    const mixed = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 3, cardio: 2, mobility: 1 } } });
    const plan = buildRollingPlan(context({ athlete: mixed, goals: mixed.goals }), 28);
    const workoutDays = plan.days.filter((d) => d.kind === 'workout');
    const counts: Record<Modality, number> = { strength: 0, cardio: 0, mobility: 0, general: 0 };
    for (const day of workoutDays) if (day.modality) counts[day.modality] += 1;
    // 4 weeks x {3,2,1} = {12,8,4} — the real assertion is the RATIO, not an
    // exact count (rounding/interleaving can shift it by a session or two).
    expect(counts.strength).toBeGreaterThan(counts.cardio);
    expect(counts.cardio).toBeGreaterThan(counts.mobility);
    expect(counts.strength).toBeGreaterThanOrEqual(9);
    expect(counts.cardio).toBeGreaterThanOrEqual(6);
    expect(counts.mobility).toBeGreaterThanOrEqual(2);
  });

  it('a weight-only goal (no explicit weeklyTargets) is proportional to the weights, not an equal split across every non-zero modality', () => {
    // Regression: modalitySchedule's weight-only fallback used to be a flat
    // round-robin over every modality with nonzero weight — a 60%-cardio
    // goal got the same session COUNT as a 10%-weighted one, just ordered
    // first. This pins the fix: the distribution now actually tracks weight.
    const cardioLed = athlete({ goals: { weights: { strength: 0.15, cardio: 0.6, mobility: 0.15, general: 0.1 } } });
    const plan = buildRollingPlan(context({ athlete: cardioLed, goals: cardioLed.goals }), 28);
    const workoutDays = plan.days.filter((d) => d.kind === 'workout');
    const counts: Record<Modality, number> = { strength: 0, cardio: 0, mobility: 0, general: 0 };
    for (const day of workoutDays) if (day.modality) counts[day.modality] += 1;
    expect(counts.cardio / workoutDays.length).toBeGreaterThan(0.45);
    expect(counts.cardio).toBeGreaterThan(counts.strength);
    expect(counts.cardio).toBeGreaterThan(counts.mobility);
  });
});

describe('buildRollingPlan — ADR-0143 cardio format variety', () => {
  it('varies cardio format across the week and never repeats interval on consecutive cardio days', () => {
    const cardioHeavy = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { cardio: 5, strength: 2 } } });
    const plan = buildRollingPlan(context({ athlete: cardioHeavy, goals: cardioHeavy.goals }), 28);
    const cardioIntents = plan.days
      .filter((d) => d.kind === 'workout' && d.modality === 'cardio')
      .map((d) => d.cardioIntent);
    expect(cardioIntents.length).toBeGreaterThan(3);
    expect(new Set(cardioIntents).size).toBeGreaterThan(1);
    for (let i = 1; i < cardioIntents.length; i += 1) {
      if (cardioIntents[i - 1] === 'interval') expect(cardioIntents[i]).not.toBe('interval');
    }
  });

  it('a non-cardio modality never carries a cardioIntent', () => {
    const plan = buildRollingPlan(context(), 14); // WEIGHTS is strength-heavy
    for (const day of plan.days.filter((d) => d.kind === 'workout' && d.modality !== 'cardio')) {
      expect(day.cardioIntent).toBeUndefined();
    }
  });
});

describe('buildRollingPlan — preference-aware cardio format (Phase 1)', () => {
  const cardioOnlySchedule = { weights: WEIGHTS, weeklyTargets: { cardio: 6 } };

  it('with no preferredCardioIntent, behaves byte-identically to the unset-preference rotation', () => {
    const noPref = athlete({ goals: cardioOnlySchedule });
    const withPref = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: undefined });
    const planA = buildRollingPlan(context({ athlete: noPref, goals: noPref.goals }), 14);
    const planB = buildRollingPlan(context({ athlete: withPref, goals: withPref.goals }), 14);
    expect(planA).toEqual(planB);
  });

  it("leans 'interval' roughly every other cardio day and still never stacks two interval days", () => {
    const leaning = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: 'interval' });
    const plan = buildRollingPlan(context({ athlete: leaning, goals: leaning.goals }), 14);
    const cardioIntents = plan.days
      .filter((d) => d.kind === 'workout' && d.modality === 'cardio')
      .map((d) => d.cardioIntent);
    expect(cardioIntents.length).toBeGreaterThan(3);
    expect(cardioIntents.filter((v) => v === 'interval').length).toBeGreaterThan(cardioIntents.length / 3);
    for (let i = 1; i < cardioIntents.length; i += 1) {
      if (cardioIntents[i - 1] === 'interval') expect(cardioIntents[i]).not.toBe('interval');
    }
  });

  it("leans 'basic' and never proposes interval at all", () => {
    const leaning = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: 'basic' });
    const plan = buildRollingPlan(context({ athlete: leaning, goals: leaning.goals }), 14);
    const cardioIntents = plan.days
      .filter((d) => d.kind === 'workout' && d.modality === 'cardio')
      .map((d) => d.cardioIntent);
    expect(cardioIntents.length).toBeGreaterThan(3);
    expect(cardioIntents).not.toContain('interval');
    expect(cardioIntents.filter((v) => v === 'basic').length).toBeGreaterThan(cardioIntents.length / 3);
  });

  it("leans 'circuit' and never proposes basic at all", () => {
    const leaning = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: 'circuit' });
    const plan = buildRollingPlan(context({ athlete: leaning, goals: leaning.goals }), 14);
    const cardioIntents = plan.days
      .filter((d) => d.kind === 'workout' && d.modality === 'cardio')
      .map((d) => d.cardioIntent);
    expect(cardioIntents.length).toBeGreaterThan(3);
    expect(cardioIntents).not.toContain('basic');
    expect(cardioIntents.filter((v) => v === 'circuit').length).toBeGreaterThan(cardioIntents.length / 3);
  });

  it('an interval-preferring athlete gets more interval days than a no-preference athlete over the same window', () => {
    const noPref = athlete({ goals: cardioOnlySchedule });
    const leaning = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: 'interval' });
    const planA = buildRollingPlan(context({ athlete: noPref, goals: noPref.goals }), 28);
    const planB = buildRollingPlan(context({ athlete: leaning, goals: leaning.goals }), 28);
    const countInterval = (p: typeof planA) =>
      p.days.filter((d) => d.kind === 'workout' && d.modality === 'cardio' && d.cardioIntent === 'interval').length;
    expect(countInterval(planB)).toBeGreaterThan(countInterval(planA));
  });

  it('documented edge case: a preference re-proposes itself immediately after a fixed cardio day resets the rotation, unlike the no-preference case which always restarts from basic', () => {
    const leaning = athlete({ goals: cardioOnlySchedule, preferredCardioIntent: 'interval' });
    const fixedDate = localDayOf(NOW);
    const fixedDays: FixedForecastDay[] = [{ date: fixedDate, modality: 'cardio' }];
    const plan = buildRollingPlan(context({ athlete: leaning, goals: leaning.goals }), 7, fixedDays);
    const fixedIndex = plan.days.findIndex((d) => d.date === fixedDate);
    const nextCardioDay = plan.days.slice(fixedIndex + 1).find((d) => d.kind === 'workout' && d.modality === 'cardio');
    // Accepted, documented behavior change (see cardioIntentFor's doc comment)
    // — not a bug: the no-preference case (tested above, ADR-0142) always
    // restarts from 'basic' here instead.
    expect(nextCardioDay?.cardioIntent).toBe('interval');
  });
});

describe('buildRollingPlan — multi-week stability', () => {
  it('an 8-week (56-day) forecast does not degenerate — modality distribution and priority rotation stay sane throughout', () => {
    const mixed = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 3, cardio: 2, mobility: 1 } } });
    const plan = buildRollingPlan(context({ athlete: mixed, goals: mixed.goals }), 56);
    expect(plan.days).toHaveLength(56);
    const workoutDays = plan.days.filter((d) => d.kind === 'workout');
    // 8 weeks x 6/week, minus rounding slack.
    expect(workoutDays.length).toBeGreaterThanOrEqual(40);
    expect(workoutDays.length).toBeLessThanOrEqual(48);
    for (let i = 1; i < workoutDays.length; i += 1) {
      const prev = new Set(workoutDays[i - 1].priorityMuscles);
      const current = workoutDays[i].priorityMuscles ?? [];
      expect(current.some((group) => !prev.has(group))).toBe(true);
    }
  });
});

describe('buildRollingPlan — ADR-0142 fixed forecast days (routine awareness)', () => {
  it('a fixed day is not overwritten by the algorithmic schedule', () => {
    const fixedDate = localDayOf(NOW + 2 * DAY_MS);
    const fixedDays: FixedForecastDay[] = [{ date: fixedDate, modality: 'mobility' }];
    const plan = buildRollingPlan(context(), 7, fixedDays);
    const day = plan.days.find((d) => d.date === fixedDate);
    expect(day).toMatchObject({ kind: 'workout', modality: 'mobility' });
  });

  it('a fixed day still projects its fatigue contribution forward to later days\' priority-muscle picks', () => {
    const fixedDate = localDayOf(NOW);
    const fixedDays: FixedForecastDay[] = [{ date: fixedDate, modality: 'strength', priorityMuscles: ['chest'] }];
    // Two OTHER groups start just as fresh as chest, so training chest (and
    // only chest) on the fixed day has to be what pushes it out of the top 2
    // — not just a wide pre-existing gap decaying without ever crossing.
    const plan = buildRollingPlan(
      context({ fatigue: { byGroup: fatigueByGroup({ chest: 0.05, back: 0.05, hamstrings: 0.05 }), updatedAt: NOW } }),
      7,
      fixedDays,
    );
    const nextWorkout = plan.days.slice(1).find((d) => d.kind === 'workout');
    // Without the fixed day's fatigue impulse, chest (tied freshest) would
    // still be in the top 2; the impulse must be what knocks it out.
    expect(nextWorkout?.priorityMuscles).not.toContain('chest');
  });

  it('does not spend an algorithmic slot on a fixed date — a routine covering the whole weekly target adds no extra algorithmic days', () => {
    const light = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { strength: 2 } } });
    const fixedDays: FixedForecastDay[] = [
      { date: localDayOf(NOW), modality: 'strength' },
      { date: localDayOf(NOW + 3 * DAY_MS), modality: 'strength' },
    ];
    const plan = buildRollingPlan(context({ athlete: light, goals: light.goals }), 7, fixedDays);
    const workoutDays = plan.days.filter((d) => d.kind === 'workout');
    // Target is 2/week; both are already fixed, so the algorithm should add
    // ~0 more — not 2 fixed + 2 more algorithmic = 4.
    expect(workoutDays.length).toBeLessThanOrEqual(3);
  });

  it('resets the cardio-format rotation after a fixed cardio day (its real format is unknown), restarting the next algorithmic cardio day from basic', () => {
    const cardioOnly = athlete({ goals: { weights: WEIGHTS, weeklyTargets: { cardio: 6 } } });
    const fixedDate = localDayOf(NOW);
    const fixedDays: FixedForecastDay[] = [{ date: fixedDate, modality: 'cardio' }];
    const plan = buildRollingPlan(context({ athlete: cardioOnly, goals: cardioOnly.goals }), 7, fixedDays);
    const fixedIndex = plan.days.findIndex((d) => d.date === fixedDate);
    const nextCardioDay = plan.days.slice(fixedIndex + 1).find((d) => d.kind === 'workout' && d.modality === 'cardio');
    expect(nextCardioDay?.cardioIntent).toBe('basic');
  });

  it('a fixed day outside the horizon is simply ignored', () => {
    const fixedDays: FixedForecastDay[] = [{ date: localDayOf(NOW + 30 * DAY_MS), modality: 'mobility' }];
    const plan = buildRollingPlan(context(), 7, fixedDays);
    expect(plan.days.every((d) => d.modality !== 'mobility' || d.kind !== 'workout')).toBe(true);
  });

  it('omitting fixedDays is byte-identical to the pre-ADR-0142 signature', () => {
    const withDefault = buildRollingPlan(context(), 7);
    const explicitEmpty = buildRollingPlan(context(), 7, []);
    expect(withDefault).toEqual(explicitEmpty);
  });
});

function systemicFixture(overrides: Partial<SystemicState> = {}): SystemicState {
  return {
    consecutiveTrainingDays: 0,
    risingLoadWeeks: 0,
    recentRoughDays: 0,
    recentOverreachedSessions: 0,
    deloadRecommended: false,
    volumeFactor: 1,
    ...overrides,
  };
}

describe('buildRollingPlan — systemic deload surfacing (item 2, ADR-0142 v3)', () => {
  it('omitting the 4th param leaves deloadRecommended false and deloadNote unset (reversibility)', () => {
    const plan = buildRollingPlan(context(), 7);
    expect(plan.deloadRecommended).toBe(false);
    expect(plan.deloadNote).toBeUndefined();
  });

  it('surfaces a passed-in SystemicState verbatim', () => {
    const systemic = systemicFixture({ deloadRecommended: true, note: 'your training load has climbed 3 weeks running' });
    const plan = buildRollingPlan(context(), 7, undefined, systemic);
    expect(plan.deloadRecommended).toBe(true);
    expect(plan.deloadNote).toBe('your training load has climbed 3 weeks running');
  });

  it('a false/no-note SystemicState leaves deloadNote unset, not an empty string', () => {
    const plan = buildRollingPlan(context(), 7, undefined, systemicFixture());
    expect(plan.deloadRecommended).toBe(false);
    expect(plan.deloadNote).toBeUndefined();
  });

  it('deloadRecommended/deloadNote are a snapshot, identical across a 7-day and a 28-day horizon for the same input — never a forward projection', () => {
    const systemic = systemicFixture({ deloadRecommended: true, note: 'easing off' });
    const weekPlan = buildRollingPlan(context(), 7, undefined, systemic);
    const monthPlan = buildRollingPlan(context(), 28, undefined, systemic);
    expect(weekPlan.deloadRecommended).toBe(monthPlan.deloadRecommended);
    expect(weekPlan.deloadNote).toBe(monthPlan.deloadNote);
  });
});

function workoutModalityCounts(plan: { days: RollingPlanDay[] }): Partial<Record<Modality, number>> {
  const out: Partial<Record<Modality, number>> = {};
  for (const day of plan.days) {
    if (day.kind !== 'workout' || !day.modality) continue;
    out[day.modality] = (out[day.modality] ?? 0) + 1;
  }
  return out;
}

describe('buildRollingPlan — goal-weighted missed-day catch-up bias (item 5, ADR-0142 v4)', () => {
  it('omitting recentModalityCounts is byte-identical to the pre-item-5 signature', () => {
    const withDefault = buildRollingPlan(context(), 7);
    const explicitUndefined = buildRollingPlan(context(), 7, undefined, undefined, undefined);
    expect(explicitUndefined).toEqual(withDefault);
  });

  it('owed === 0 means no bias is applied, regardless of weights or apparent deficits', () => {
    // 4 sessions in the trailing week exactly meets the default athlete's
    // weeklyTargets total of 4 -> owed = min(2, max(0, 4-4)) = 0.
    const fullyDone = context({
      history: Array.from({ length: 4 }, (_, i) => completedSession(NOW - (i + 1) * DAY_MS, `sess-${i}`)),
    });
    const baseline = buildRollingPlan(fullyDone, 7);
    // Passed as if strength were entirely missed — would matter a great deal
    // if owed were nonzero, but owed=0 must short-circuit before any of it is read.
    const biased = buildRollingPlan(fullyDone, 7, undefined, undefined, { strength: 0, cardio: 0 });
    expect(biased).toEqual(baseline);
  });

  it('a single deficited modality pulls the owed catch-up slots toward it, biasing the week\'s composition away from the un-biased baseline', () => {
    // horizonDays=5 deliberately chosen so algorithmicSessions == horizonDays
    // (every day a workout day) in BOTH the baseline and biased runs, which
    // makes the day-placement schedule consumed in full either way — the
    // resulting per-modality totals are then a straightforward function of
    // the (fully-consumed) input multiset, not sensitive to interleave-order
    // internals. Hand-verified: baseline={strength:3,cardio:2}, biased={strength:2,cardio:3}.
    const a = athlete({ experience: 'advanced', goals: { weights: { strength: 0.6, cardio: 0.4, mobility: 0, general: 0 } } });
    const ctx = context({
      athlete: a,
      goals: a.goals,
      history: [
        completedSession(NOW - 1 * DAY_MS, 's1'),
        completedSession(NOW - 2 * DAY_MS, 's2'),
        completedSession(NOW - 3 * DAY_MS, 's3'),
      ], // 3 done this cycle -> owed = min(2, max(0, 5-3)) = 2
    });
    const baseline = buildRollingPlan(ctx, 5);
    // All 3 done sessions were strength; cardio (the athlete's real, if
    // smaller, goal) was entirely skipped -> cardio is the sole deficited modality.
    const biased = buildRollingPlan(ctx, 5, undefined, undefined, { strength: 3, cardio: 0 });

    expect(workoutModalityCounts(baseline)).toEqual({ strength: 3, cardio: 2 });
    expect(workoutModalityCounts(biased)).toEqual({ strength: 2, cardio: 3 });
  });

  it('a modality\'s bias is capped at its own deficit — a low/zero-weight modality with a real deficit still gets a catch-up slot instead of being starved by a high-weight modality\'s dominance', () => {
    // weeklyTargets (not weight-only) drives the expected schedule here
    // specifically so cardio can carry a real deficit despite weight: 0 —
    // under plain weight-proportional allocation cardio would get exactly
    // zero of the owed slots; deficit-capping is what gives it one anyway.
    // horizonDays=5 again keeps algorithmicSessions == horizonDays, so the
    // schedule is fully consumed and the total is unambiguous.
    // Hand-verified: strength's naive weighted share of the 2 owed slots
    // would be floor(1.0 * 2) = 2, but its real deficit is only 1 — capped
    // to 1, and the freed slot goes to cardio (deficit 1, weight 0) instead.
    const a = athlete({ goals: { weights: { strength: 1, cardio: 0, mobility: 0, general: 0 }, weeklyTargets: { strength: 4, cardio: 1 } } });
    const ctx = context({
      athlete: a,
      goals: a.goals,
      history: [
        completedSession(NOW - 1 * DAY_MS, 's1'),
        completedSession(NOW - 2 * DAY_MS, 's2'),
        completedSession(NOW - 3 * DAY_MS, 's3'),
      ], // 3 done this cycle -> owed = min(2, max(0, 5-3)) = 2
    });
    const biased = buildRollingPlan(ctx, 5, undefined, undefined, { strength: 3, cardio: 0 });
    const counts = workoutModalityCounts(biased);
    expect(counts.cardio).toBe(1); // got a slot despite zero weight
    expect(counts.strength).toBe(4); // capped — not inflated to 5 by weight dominance
  });
});
