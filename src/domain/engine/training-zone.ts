/**
 * Training zones (ADR-0128). Pure, deterministic, offline.
 *
 * The engine could not prescribe strength work. The reachable rep space was
 * {5-9, 8-12, 11-15}, driven by session length and workout style — no input
 * combination produced 3-6 reps, so `isHeavySet`'s 165s rest tier was dead code
 * and a strength-focused athlete got hypertrophy programming. Worse, rep range
 * tracked *duration*: asking for a longer session made the work lighter and
 * higher-rep, which is exactly backwards.
 *
 * The fix is deliberately NOT another session-level style. `Modality.strength`
 * cannot carry the distinction — its goal card reads "Build strength & muscle",
 * both at once — so the information simply isn't in the goal taxonomy. Instead
 * each exercise is assigned a zone based on when its muscle group last saw
 * strength work and last saw endurance work. A trainer developing a muscle does
 * exactly this: press heavy today, chase reps on the accessory, rotate over
 * weeks. One session can hold both.
 *
 * Cadence is derived, never a constant. "Every 14 days" would be wrong for both
 * a 6x/week advanced lifter and a once-a-week intermediate, so the primary unit
 * is EXPOSURES — how many times you have trained that muscle since it was last
 * tested. That tracks adaptation directly and makes training frequency fall out
 * for free, rather than needing a term of its own.
 */

import type {
  Exercise,
  ExperienceLevel,
  ModalityWeights,
  MuscleGroup,
  PerformedSet,
  ResistanceFocus,
  SessionRecord,
  TrainingZone,
  WorkoutType,
} from '../types';
import type { RepRange } from './progression';
import { groupsFor } from './fatigue';
import { mechanicOf } from './mechanic';

/** Rep band and working effort per zone. Rest tiers need no change: `timing.ts`
 * already keys off reps and RPE, so 4-6 reps earns HEAVY_COMPOUND for free, and
 * `supersets.ts` already leaves sets of <=6 reps straight. */
export const ZONE_SPEC: Record<TrainingZone, { range: RepRange; targetRpe: number }> = {
  strength: { range: { min: 4, max: 6 }, targetRpe: 8 },
  hypertrophy: { range: { min: 8, max: 12 }, targetRpe: 7 },
  endurance: { range: { min: 15, max: 20 }, targetRpe: 7 },
  power: { range: { min: 3, max: 5 }, targetRpe: 6 },
};

/** Regular working sets follow the declared physiological outcome. */
export function workingZoneFor(focus: ResistanceFocus | undefined): TrainingZone {
  switch (focus) {
    case 'max_strength': return 'strength';
    case 'muscular_endurance': return 'endurance';
    case 'power': return 'power';
    case 'hypertrophy': return 'hypertrophy';
    case 'general':
    default: return 'hypertrophy';
  }
}

/** Hypertrophy is the steady anchor; only these two are ever *tested*. */
export const TESTABLE_ZONES = ['strength', 'endurance'] as const;
export type TestableZone = (typeof TESTABLE_ZONES)[number];

/** Below this a session has room for ~2 exercises; a ramp plus AMRAP would gut it. */
export const ZONE_TEST_MIN_SESSION_MIN = 30;
/** At or above this, a session is long enough to carry both kinds of test. */
export const ZONE_BOTH_TESTS_MIN_SESSION_MIN = 50;

interface BaseCadence {
  strength: number;
  endurance: number;
  minDays: number;
  maxDays: number;
}

/**
 * Base exposure counts by experience.
 *
 * Beginners never test: an RPE-9 AMRAP is a poor trade against still-forming
 * technique, and they don't need it — double progression already moves their
 * loads. Advanced athletes test *less* often, not more: their e1RM moves slowly
 * and a genuine max costs more to recover from, so frequent testing is mostly
 * fatigue with little information in return.
 */
const BASE_CADENCE: Partial<Record<ExperienceLevel, BaseCadence>> = {
  intermediate: { strength: 6, endurance: 8, minDays: 10, maxDays: 28 },
  advanced: { strength: 8, endurance: 10, minDays: 12, maxDays: 35 },
};

/** Styles where an all-out strength attempt makes no sense. */
const NO_STRENGTH_TEST_STYLES = new Set<WorkoutType>(['cardio', 'stretch', 'yoga', 'barre', 'pilates']);

/**
 * Style bias on the exposure counts (`<1` = test sooner). Bodyweight leans away
 * from strength testing because loading heavily enough for a true 4-6 rep max is
 * often simply not possible without external weight.
 */
/** How hard goals may push the cadence either way. */
const MAX_GOAL_LEAN = 0.3;
const GOAL_LEAN_SCALE = 2;

export interface ZoneCadence {
  exposures: Record<TestableZone, number>;
  minDays: number;
  maxDays: number;
  /** How many tests this session may carry at all (0, 1, or 2). */
  maxTests: number;
  /** False for styles where an all-out strength attempt makes no sense. */
  allowsStrengthTest: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Which way the athlete's goals lean, -MAX..+MAX (positive = toward strength).
 *
 * Compares `strength` against `cardio` specifically, treating `general` and
 * `mobility` as neutral. Comparing the top goal against *all* the others
 * dilutes the signal into nothing — a single dominant goal only reaches ~0.38
 * of a normalized four-way split, leaving a difference of about -0.03 that
 * would move the cadence not at all. The pairwise comparison is what makes the
 * signal usable.
 */
export function goalLean(weights: ModalityWeights): number {
  const total = weights.strength + weights.cardio + weights.mobility + weights.general;
  if (total <= 0) return 0;
  const strength = weights.strength / total;
  const cardio = weights.cardio / total;
  return clamp((strength - cardio) * GOAL_LEAN_SCALE, -MAX_GOAL_LEAN, MAX_GOAL_LEAN);
}

/**
 * Today's testing schedule, or undefined when this athlete/session shouldn't
 * test at all. Goals and style shift *how often* each zone comes around, even
 * though neither dictates any individual exercise's reps any more.
 */
export function zoneCadenceFor(input: {
  experience: ExperienceLevel;
  targetDurationMin?: number;
  weights: ModalityWeights;
  workoutType?: WorkoutType;
  testingEnabled?: boolean;
}): ZoneCadence | undefined {
  if (input.testingEnabled === false) return undefined;
  const base = BASE_CADENCE[input.experience];
  if (!base) return undefined; // beginners never test

  // An unset duration means the athlete didn't pick one; treat it as a normal
  // session rather than blocking testing outright.
  const minutes = input.targetDurationMin ?? ZONE_TEST_MIN_SESSION_MIN;
  if (minutes < ZONE_TEST_MIN_SESSION_MIN) return undefined;

  const lean = goalLean(input.weights);
  const exposuresFor = (zone: TestableZone): number => {
    const goalBias = zone === 'strength' ? 1 - lean : 1 + lean;
    return Math.max(2, Math.round(base[zone] * goalBias));
  };

  return {
    exposures: { strength: exposuresFor('strength'), endurance: exposuresFor('endurance') },
    minDays: base.minDays,
    maxDays: base.maxDays,
    maxTests: minutes >= ZONE_BOTH_TESTS_MIN_SESSION_MIN ? 2 : 1,
    allowsStrengthTest: !(input.workoutType && NO_STRENGTH_TEST_STYLES.has(input.workoutType)),
  };
}

/**
 * Which zone a logged set belongs to. Prefers the zone recorded at prescription
 * time; records predating ADR-0128 are classified by rep count instead, so an
 * existing history still contributes a sensible schedule rather than reading as
 * "never tested anything".
 */
export function zoneOfSet(set: PerformedSet): TrainingZone | undefined {
  if (set.prescribedZone) return set.prescribedZone;
  const reps = set.prescribedReps ?? set.reps;
  if (reps == null) return undefined;
  if (reps <= ZONE_SPEC.strength.range.max) return 'strength';
  if (reps >= ZONE_SPEC.endurance.range.min) return 'endurance';
  return 'hypertrophy';
}

export interface ZoneHistoryEntry {
  /** Sessions in which this group was trained since it last saw the zone. */
  exposuresSince: number;
  /** Days since the group last saw the zone; undefined = never. */
  daysSince?: number;
}

const DAY_MS = 86_400_000;

/**
 * Per-muscle-group exposure and recency, per testable zone.
 *
 * The clock runs on the GROUP, not the exercise. Selection deliberately rotates
 * exercises (ADR-0126), which pushes any single lift weeks into the past — a
 * strictly per-exercise clock would therefore leave every lift permanently
 * "overdue" and cluster tests onto whichever one happened to resurface. The
 * specific lift is chosen later, as a tiebreak among the group's candidates.
 */
export function zoneHistoryByGroup(
  history: SessionRecord[],
  now: number,
): Map<MuscleGroup, Record<TestableZone, ZoneHistoryEntry>> {
  const out = new Map<MuscleGroup, Record<TestableZone, ZoneHistoryEntry>>();
  const entryFor = (group: MuscleGroup) => {
    let entry = out.get(group);
    if (!entry) {
      entry = { strength: { exposuresSince: 0 }, endurance: { exposuresSince: 0 } };
      out.set(group, entry);
    }
    return entry;
  };

  // Newest first, so the first time we meet a zone for a group IS its last
  // occurrence — everything counted before then is an exposure since.
  const ordered = history
    .filter((r) => r.completedAt != null && r.completedAt <= now)
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number));

  for (const record of ordered) {
    const when = record.completedAt as number;
    // A group can appear in several exercises in one session; it is still one
    // exposure, and one chance to have met each zone.
    const groupsTrained = new Set<MuscleGroup>();
    const groupZones = new Map<MuscleGroup, Set<TrainingZone>>();

    for (const performed of record.performed) {
      const completed = performed.sets.filter((s) => s.completed && !s.skipped);
      if (!completed.length) continue;
      const { primary } = groupsFor(performed);
      for (const group of primary) {
        groupsTrained.add(group);
        const zones = groupZones.get(group) ?? new Set<TrainingZone>();
        for (const set of completed) {
          const zone = zoneOfSet(set);
          if (zone) zones.add(zone);
        }
        groupZones.set(group, zones);
      }
    }

    for (const group of groupsTrained) {
      const entry = entryFor(group);
      const zones = groupZones.get(group);
      for (const zone of TESTABLE_ZONES) {
        if (entry[zone].daysSince != null) continue; // already found its last occurrence
        if (zones?.has(zone)) {
          entry[zone] = { ...entry[zone], daysSince: (now - when) / DAY_MS };
        } else {
          entry[zone].exposuresSince += 1;
        }
      }
    }
  }

  return out;
}

/**
 * Is this group due for a test of this zone?
 *
 * Exposures are the primary signal; `maxDays` is the ceiling that stops a
 * once-a-week trainee waiting two months to accumulate them, and `minDays` is
 * the floor that stops a high-frequency trainee being tested every few days once
 * exposures pile up. A group that has *never* seen the zone is due immediately —
 * subject to the same floor, which a fresh athlete trivially satisfies.
 */
export function isZoneDue(entry: ZoneHistoryEntry | undefined, zone: TestableZone, cadence: ZoneCadence): boolean {
  if (!entry) return true;
  const { daysSince, exposuresSince } = entry;
  if (daysSince == null) return true;
  if (daysSince < cadence.minDays) return false;
  return exposuresSince >= cadence.exposures[zone] || daysSince >= cadence.maxDays;
}

// ---------------------------------------------------------------------------
// Zone assignment for one session
// ---------------------------------------------------------------------------

export interface ZoneAssignment {
  zone: TrainingZone;
  /** This exercise carries an all-out AMRAP set — the athlete should push. */
  isTest: boolean;
  /**
   * Shifted because an earlier exercise in THIS session already tested the same
   * muscle group. The caller applies its usual de-load on top.
   */
  cascaded: boolean;
}

export interface ZonePlanInput {
  /** The Main block's exercises, in the order they'll be performed. */
  chosen: Exercise[];
  history: SessionRecord[];
  now: number;
  cadence: ZoneCadence | undefined;
  /** Exercise ids with a real load baseline — you cannot test an untested lift. */
  withProgressionBasis: Set<string>;
  /** Readiness / avoidance gate, shared with the max-day rules. */
  testingAllowed: boolean;
  /** Where exercises sit when nothing special is due. */
  baselineZone?: TrainingZone;
  /**
   * Lifts the athlete has explicitly scheduled for testing
   * (`AthleteProfile.maxDay`). They win the tiebreak among otherwise-eligible
   * candidates, so an explicit preference still decides *which* lift is tested
   * without being able to bypass the readiness gate or the session budget.
   */
  preferredTestExerciseIds?: ReadonlySet<string>;
}

/** Enough to win a tiebreak, not enough to outrank a genuinely overdue group. */
const PREFERRED_TEST_BONUS = 0.5;

/** How overdue a group is, as a multiple of its cadence. Higher wins. */
function overdueRatio(entry: ZoneHistoryEntry | undefined, zone: TestableZone, cadence: ZoneCadence): number {
  if (!entry || entry.daysSince == null) return Infinity; // never tested
  return Math.max(
    entry.exposuresSince / cadence.exposures[zone],
    entry.daysSince / cadence.maxDays,
  );
}

/**
 * Decide which zone each Main-block exercise is trained in today, and which (if
 * any) carries an all-out test.
 *
 * At most one strength test and one endurance test, never both on the same
 * muscle group, and never more than the session length allows. Everything else
 * sits at the baseline zone — most training is, and should be, unremarkable.
 */
export function zonePlanFor(input: ZonePlanInput): Map<string, ZoneAssignment> {
  const baseline = input.baselineZone ?? 'hypertrophy';
  const plan = new Map<string, ZoneAssignment>();
  for (const exercise of input.chosen) {
    plan.set(exercise.id, { zone: baseline, isTest: false, cascaded: false });
  }

  const { cadence } = input;
  if (!cadence || !input.testingAllowed || cadence.maxTests <= 0) return plan;

  const byGroup = zoneHistoryByGroup(input.history, input.now);
  const testedGroups = new Set<MuscleGroup>();
  const testedExercises = new Set<string>();
  let testsPlaced = 0;

  // Strength first: it's the higher-stakes ask, so it gets first claim on both
  // the session's test budget and the athlete's freshness.
  for (const zone of TESTABLE_ZONES) {
    if (testsPlaced >= cadence.maxTests) break;
    if (zone === 'strength' && !cadence.allowsStrengthTest) continue;

    let best: { exercise: Exercise; group: MuscleGroup; ratio: number } | undefined;

    for (const exercise of input.chosen) {
      if (testedExercises.has(exercise.id)) continue;
      // Rep zones don't describe timed work — a carry or a plank progresses by
      // duration, and "as many reps as you can" is meaningless for it. Testing
      // max hold time is a different feature, not this one.
      if (exercise.progression === 'time' || exercise.progression === 'hold') continue;
      // A test needs a known working load to ramp up from.
      if (!input.withProgressionBasis.has(exercise.id)) continue;
      // A max attempt belongs on a compound; endurance work is happy anywhere.
      if (zone === 'strength' && mechanicOf(exercise) !== 'compound') continue;

      for (const group of exercise.primaryAreas) {
        if (testedGroups.has(group)) continue;
        const entry = byGroup.get(group)?.[zone];
        if (!isZoneDue(entry, zone, cadence)) continue;
        const preferred = input.preferredTestExerciseIds?.has(exercise.id) ?? false;
        const ratio = overdueRatio(entry, zone, cadence) + (preferred ? PREFERRED_TEST_BONUS : 0);
        if (!best || ratio > best.ratio) best = { exercise, group, ratio };
      }
    }

    if (!best) continue;
    plan.set(best.exercise.id, { zone, isTest: true, cascaded: false });
    testedExercises.add(best.exercise.id);
    for (const group of best.exercise.primaryAreas) testedGroups.add(group);
    testsPlaced += 1;
  }

  if (!testedExercises.size) return plan;

  // Within-session cascade. Fatigue is derived from history, before the session
  // starts, so the engine has never accounted for damage it is about to inflict
  // in this very workout. Anything else hitting a just-tested group moves to
  // lighter, higher-rep work and is flagged for the caller's de-load.
  for (const exercise of input.chosen) {
    if (testedExercises.has(exercise.id)) continue;
    if (!exercise.primaryAreas.some((group) => testedGroups.has(group))) continue;
    plan.set(exercise.id, { zone: 'endurance', isTest: false, cascaded: true });
  }

  return plan;
}
