/**
 * Progressive overload + HARD safety caps (ADR-0103 v2). Pure, deterministic.
 *
 * Load only rises when earned (last set felt easy) and never by more than the
 * cap. These caps are enforced as clamps in code — they are not suggestions and
 * nothing (including a future advisor) may exceed them.
 */

import type { Exercise, PerformedSet, SessionRecord, TrainingZone, WeightUnit } from '../types';
import { type WeeklyLoadPoint, epley1RM, isoWeekStart } from '../metrics';
import { implementFor } from './mechanic';

export const SAFETY = {
  /** Absolute ceiling on any session-to-session load increase. */
  MAX_SESSION_LOAD_INCREASE_PCT: 0.1,
  /**
   * Absolute ceiling on a lift's week-over-week load increase (CLAUDE.md §6).
   * The session cap alone does not deliver this: a lift trained three times in
   * one week can compound +10% three times to roughly +33%, which is exactly
   * the runaway the methodology says to prevent.
   */
  MAX_WEEKLY_LOAD_INCREASE_PCT: 0.15,
  /** Default load step for metric athletes. Imperial athletes use 5 lb. */
  DEFAULT_STEP_KG: 2.5,
  DEFAULT_STEP_LB: 5,
  /** Deload magnitude when the last attempt ground out. */
  DELOAD_PCT: 0.1,
} as const;

/**
 * Double progression (ADR-0125). Reps climb inside a range at a fixed load;
 * only once the top of the range is earned does the load step up and the reps
 * reset to the bottom. This is how a trainer actually progresses a lift, and it
 * repairs three things the load-only model got wrong:
 *
 *  - Light lifts could never progress at all. The +10% session cap gives a 10 kg
 *    dumbbell 1 kg of headroom, the smallest real step is 2.5 kg, and
 *    `snapToSensibleWeight` floors back to 10 kg — so every lift under 25 kg
 *    held its load forever. Reps now carry the progression until a step is
 *    genuinely earned.
 *  - Progression stalled silently without RPE. The tracker pre-fills each set's
 *    RPE with the target, so an athlete who taps through logs `rpe === targetRpe`
 *    — precisely the value that means "hold." Completed-vs-prescribed reps is an
 *    RPE-free signal that always works.
 *  - Bodyweight and timed work never progressed. They have no load axis, so a
 *    load-only model had nothing to move; reps/holds are their progression.
 */
export const PROGRESSION = {
  /** Reps added when the prescribed work was completed at target effort. */
  REP_STEP: 1,
  /** Reps added when it was also clearly easy (RPE at/below target − 1). */
  REP_STEP_EASY: 2,
  /** Reps removed when the last attempt ground out. */
  REP_BACKOFF: 2,
  /** Unloaded work has no load axis, so reps/holds climb past the range — but not forever. */
  MAX_UNLOADED_REPS: 30,
  /**
   * How far a loaded lift may climb above its band when the athlete simply owns
   * nothing heavier. Adding reps is the only progression left to them, but it
   * has to stay bounded: this doubles as the tolerance for detecting a genuine
   * rep-band change, so an equipment-capped climb is never mistaken for the
   * athlete switching training style (which would re-reconcile the load).
   */
  EQUIPMENT_CAPPED_REP_HEADROOM: 4,
  /** What an all-out test set is prescribed at, when the record doesn't say. */
  TEST_RPE: 9,
  /** Roughly how much of a load one RPE point is worth. */
  LOAD_PCT_PER_RPE: 0.025,
  /** Ceiling on the test→working discount, so it can never invert. */
  MAX_TEST_BUFFER_RPE: 4,
  HOLD_STEP_SEC: 5,
  HOLD_STEP_EASY_SEC: 10,
  MAX_HOLD_SEC: 120,
} as const;

/** The rep band a lift lives in; load steps only once `max` is earned. */
export interface RepRange {
  min: number;
  max: number;
}

/** Today's full prescription for one exercise — load *and* the work asked of it. */
export interface ExercisePrescription {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  note?: string;
}

export interface PrescriptionOptions {
  unit?: WeightUnit;
  /**
   * The zone this exercise is being prescribed in today (ADR-0128). When both
   * this and the recorded zone are present, a band change is detected EXACTLY
   * rather than inferred from rep drift — a hypertrophy -> endurance move
   * (12 -> 15 reps) sits inside the equipment-capped tolerance and the
   * heuristic would miss it, leaving the load unreconciled.
   */
  zone?: TrainingZone;
  /** Discrete owned weights (ADR-0115); the prescription stays coherent with them. */
  available?: number[];
  /** Enables the week-over-week load ceiling (CLAUDE.md §6). */
  now?: number;
}

export interface LoadRec {
  weightKg?: number;
  note?: string;
}

interface TopSet {
  weightKg: number;
  rpe?: number;
  reps?: number;
  isCalibration?: boolean;
  /** The normal working load in the same session before the higher top set. */
  priorWorkingWeightKg?: number;
}

function roundToHalfKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/**
 * Constrain a recommended weight to what the athlete actually owns (ADR-0115),
 * e.g. dumbbells/kettlebells/bands in fixed increments — never a barbell's
 * freely-combinable plates. Snaps *down* to the nearest owned weight so a
 * recommendation already at a hard safety cap can never round up past it; only
 * falls back to the smallest owned weight when every owned weight exceeds the
 * target (e.g. the athlete's rack no longer has anything light enough).
 * `available` undefined/empty means unconstrained — returns `kg` unchanged.
 */
export function snapToAvailableWeight(kg: number, available?: number[]): number {
  const valid = available?.filter((w) => Number.isFinite(w) && w > 0);
  if (!valid?.length) return kg;
  const atOrBelow = valid.filter((w) => w <= kg);
  if (atOrBelow.length) return Math.max(...atOrBelow);
  return Math.min(...valid);
}

const KG_PER_LB = 0.45359237;

/**
 * Standard Olympic barbell, empty: 45 lb ≈ 20.41 kg (ADR-0144). A barbell
 * exercise's `weightKg` is the TOTAL on the bar (bar + plates) and must never
 * be prescribed below this — "0 added weight" means the bar, not nothing.
 * Unrelated to timing.ts's `transitionSecondsFor()`'s literal `45` (a
 * 45-SECOND rack-setup time budget) — same number, disjoint meaning; noted at
 * both sites so nobody conflates them. Barbell deliberately stays outside
 * `WeightedEquipmentType` (ADR-0115: plates combine freely, so this is a
 * continuous floor, not a discrete owned-weight snap list).
 */
export const BARBELL_BAR_WEIGHT_KG = 45 * KG_PER_LB; // ≈ 20.41 kg

/** The floor a barbell exercise's weight may never go below; undefined for
 * every other implement (nothing to floor generically — see
 * `startingWeightKgFor` for the dumbbell/kettlebell/band starting-weight
 * rule, which is a different concern from this hard floor). Exported so
 * callers that snap a weight AFTER this module returns it (e.g.
 * `finalizeLoad`'s post-hoc readiness/fatigue reduction in rules-engine.ts)
 * can apply the same floor to their own final `snapToSensibleWeight` call. */
export function barbellFloorKg(ex: Exercise): number | undefined {
  return implementFor(ex) === 'barbell' ? BARBELL_BAR_WEIGHT_KG : undefined;
}

/** The smallest realistic load increment for `unit` — 2.5 kg metric, 5 lb
 * imperial (converted to kg for storage). Exported so `startingWeightKgFor`
 * (ADR-0144) can reuse it as the generic starting-weight floor rather than
 * hand-rolling a second "smallest sensible weight" number. */
export function defaultIncrementKg(unit: WeightUnit): number {
  return unit === 'lb' ? SAFETY.DEFAULT_STEP_LB * KG_PER_LB : SAFETY.DEFAULT_STEP_KG;
}

export function formatSuggestedWeight(kg: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${Math.round(kg / KG_PER_LB)} lb`;
  return `${Math.round(kg * 10) / 10} kg`;
}

/**
 * The default gym increment is 2.5 kg for metric athletes and 5 lb for
 * imperial athletes. A structured owned-weight list remains the explicit
 * exception and is always respected exactly. We round down so an
 * automatic recommendation never exceeds the load safety cap. If a legacy
 * logged load is lighter than one default increment, retain it rather than
 * emitting the nonsensical recommendation of 0 kg.
 *
 * `floorKg` (ADR-0144) is an implement-specific hard minimum — e.g. a
 * barbell's empty-bar weight — applied AFTER snapping, so it can raise (but
 * never lower) the result. Omitted for every non-barbell call site.
 */
export function snapToSensibleWeight(
  kg: number,
  unit: WeightUnit = 'kg',
  available?: number[],
  floorKg?: number,
): number {
  if (!Number.isFinite(kg) || kg <= 0) return kg;
  let snapped: number;
  if (available?.some((weight) => Number.isFinite(weight) && weight > 0)) {
    snapped = snapToAvailableWeight(kg, available);
  } else {
    const incrementKg = defaultIncrementKg(unit);
    const rounded = Math.floor((kg + 1e-9) / incrementKg) * incrementKg;
    snapped = rounded > 0 ? Math.round(rounded * 1_000_000) / 1_000_000 : kg;
  }
  return floorKg != null ? Math.max(snapped, floorKg) : snapped;
}

/**
 * A sensible, conservative STARTING weight for a fresh weight-progression
 * exercise with no history yet (ADR-0144) — never a progression
 * recommendation. `recommendLoad`/`recommendPrescription`'s "no history →
 * undefined, the athlete logs it" contract (ADR-0103) is unchanged; this is a
 * separate, explicit, opt-in fallback each caller invokes when those return
 * nothing, so a fresh exercise shows a real number instead of a blank/dash
 * that reads as "0".
 *
 * Barbell floors at the bar. Dumbbell/kettlebell/band prefer the lightest
 * weight the athlete actually owns when their inventory specifies one — real
 * 2-3 lb dumbbells are honored, never overridden upward by a generic floor —
 * otherwise the generic smallest-increment floor. Bodyweight-implement
 * exercises return undefined: there is no sensible weight to suggest for
 * something that isn't loaded by default.
 */
export function startingWeightKgFor(
  exercise: Exercise,
  available?: number[],
  unit: WeightUnit = 'kg',
): number | undefined {
  if (exercise.progression !== 'weight' && !exercise.loadsWeight) return undefined;
  const implement = implementFor(exercise);
  if (implement === 'barbell') return BARBELL_BAR_WEIGHT_KG;
  if (implement === 'bodyweight') return undefined;
  const owned = available?.filter((weight) => Number.isFinite(weight) && weight > 0);
  if (owned?.length) return Math.min(...owned);
  return defaultIncrementKg(unit);
}

/**
 * ADR-0103 v2: a multi-session stall — the realized weekly volume-load for
 * this exercise hasn't grown across the last two week-over-week transitions.
 * Needs at least 3 weekly points to observe two transitions; fewer than that
 * is insufficient evidence, not a stall. Exported so the Progress screen's
 * "Progressive overload" card can show the exact same signal that drives the
 * deload here, instead of a cosmetically-similar reimplementation.
 */
export function isVolumeStalling(points: WeeklyLoadPoint[]): boolean {
  if (points.length < 3) return false;
  const [a, b, c] = points.slice(-3);
  return b.volumeLoad - a.volumeLoad <= 0 && c.volumeLoad - b.volumeLoad <= 0;
}

/** Most recent completed heaviest set of an exercise across history. */
function lastTopSet(exerciseId: string, history: SessionRecord[]): TopSet | undefined {
  const sorted = history.slice().sort((a, b) => b.plannedFor - a.plannedFor);
  for (const rec of sorted) {
    const ex = rec.performed.find((p) => p.exerciseId === exerciseId);
    if (!ex) continue;
    // A zero load is an empty tracker field, not useful progressive-overload
    // evidence for a weight exercise. Ignoring it prevents a stray 0 from
    // becoming the base for future prescriptions.
    const completed = ex.sets.filter((s) => s.completed && s.weightKg != null && s.weightKg > 0);
    if (!completed.length) continue;
    const top = completed.reduce((best, s) =>
      (s.weightKg ?? 0) > (best.weightKg ?? 0) ? s : best,
    );
    const priorWorkingWeightKg = completed
      .filter((set) => !set.isCalibration)
      .reduce((best, set) => Math.max(best, set.weightKg ?? 0), 0) || undefined;
    return {
      weightKg: top.weightKg as number,
      rpe: top.rpe,
      reps: top.reps,
      isCalibration: top.isCalibration,
      priorWorkingWeightKg,
    };
  }
  return undefined;
}

/**
 * Recommend today's working load for a weight-progression exercise, or a
 * loaded timed/hold movement (`loadsWeight`, e.g. a farmer's carry) — both
 * read the same logged `weightKg` history and follow the same caps.
 * Returns undefined when there's no basis yet (no history) — the user logs it.
 */
export function recommendLoad(
  ex: Exercise,
  history: SessionRecord[],
  targetRpe: number,
  unit: WeightUnit = 'kg',
): LoadRec | undefined {
  if (ex.progression !== 'weight' && !ex.loadsWeight) return undefined;

  const last = lastTopSet(ex.id, history);
  if (!last) return undefined;

  const floorKg = barbellFloorKg(ex);
  const lastW = last.weightKg;
  const lastRpe = last.rpe;
  const capBase = last.priorWorkingWeightKg ?? lastW;
  const cap = roundToHalfKg(capBase * (1 + SAFETY.MAX_SESSION_LOAD_INCREASE_PCT));

  // A max-day AMRAP is a calibration, not an invitation to jump straight to its
  // top-set load. Convert its estimated rep max to a conservative 10-rep
  // working estimate, then apply the same hard 10% session-to-session cap as
  // every other progression decision.
  if (last.isCalibration && last.reps != null && last.reps > 0 && (lastRpe ?? 9) <= 9) {
    const estimatedOneRepMax = lastW * (1 + last.reps / 30);
    const estimatedWorkingWeight = estimatedOneRepMax / (1 + 10 / 30);
    const target = snapToSensibleWeight(Math.min(estimatedWorkingWeight, cap), unit, undefined, floorKg);
    return {
      weightKg: target,
      note: `calibrated from ${last.reps} clean reps — next working load capped at ${formatSuggestedWeight(target, unit)}`,
    };
  }

  let target = lastW;
  let note: string;

  if (lastRpe != null && lastRpe <= targetRpe - 1) {
    target = snapToSensibleWeight(Math.min(lastW + defaultIncrementKg(unit), cap), unit, undefined, floorKg);
    const increase = target - lastW;
    note = increase > 0
      ? `+${formatSuggestedWeight(increase, unit)} from last — felt easy at RPE ${lastRpe}`
      : `holding ${formatSuggestedWeight(target, unit)} — the next ${unit === 'lb' ? SAFETY.DEFAULT_STEP_LB : SAFETY.DEFAULT_STEP_KG} ${unit} step is above the safety cap`;
  } else if (lastRpe != null && lastRpe >= targetRpe + 2) {
    target = snapToSensibleWeight(lastW * (1 - SAFETY.DELOAD_PCT), unit, undefined, floorKg);
    note = `deloaded ${Math.round(SAFETY.DELOAD_PCT * 100)}% — RPE ${lastRpe} last time`;
  } else {
    target = lastW;
    note = `holding ${formatSuggestedWeight(lastW, unit)}${lastRpe != null ? ` (RPE ${lastRpe} last time)` : ''}`;
  }

  return { weightKg: target, note };
}

// ---------------------------------------------------------------------------
// Double progression (ADR-0125)
// ---------------------------------------------------------------------------

interface LastPerformance {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  rpe?: number;
  prescribedReps?: number;
  prescribedRpe?: number;
  prescribedDurationSec?: number;
  prescribedZone?: TrainingZone;
  /** This was an all-out test set, not a working set (ADR-0128). */
  isCalibration?: boolean;
  /** The normal working load in that same session, below the test set. */
  priorWorkingWeightKg?: number;
  prescribedSetCount: number;
  completedSetCount: number;
  skippedSetCount: number;
  prescribedWork: number;
  performedWork: number;
  workCompletionRatio: number;
  /** Reps redistributed across the number of working sets originally planned. */
  equivalentRepsPerPlannedSet?: number;
  lowerLoad: boolean;
  qualityBlocked: boolean;
}

function summarizeCalibration(set: PerformedSet, priorWorkingWeightKg?: number): LastPerformance {
  return {
    weightKg: set.weightKg,
    reps: set.reps,
    durationSec: set.durationSec,
    rpe: set.rpe,
    prescribedReps: set.prescribedReps,
    prescribedRpe: set.prescribedRpe,
    prescribedDurationSec: set.prescribedDurationSec,
    prescribedZone: set.prescribedZone,
    isCalibration: set.isCalibration,
    priorWorkingWeightKg,
    prescribedSetCount: 1,
    completedSetCount: 1,
    skippedSetCount: 0,
    prescribedWork: (set.prescribedWeightKg ?? set.weightKg ?? 1) * (set.prescribedReps ?? set.reps ?? set.prescribedDurationSec ?? set.durationSec ?? 0),
    performedWork: (set.weightKg ?? 1) * (set.reps ?? set.durationSec ?? 0),
    workCompletionRatio: 1,
    equivalentRepsPerPlannedSet: set.reps,
    lowerLoad: false,
    qualityBlocked: set.quality === 'pain' || set.quality === 'form_breakdown',
  };
}

/** Public aggregate used by progression tests and explainability tooling. */
export interface ExerciseSessionWork {
  prescribedSetCount: number;
  completedSetCount: number;
  skippedSetCount: number;
  totalPerformedReps: number;
  totalPerformedDurationSec: number;
  prescribedWork: number;
  performedWork: number;
  workCompletionRatio: number;
  equivalentRepsPerPlannedSet?: number;
  heaviestCleanWorkingLoadKg?: number;
  lowerLoad: boolean;
  qualityBlocked: boolean;
}

/** Aggregate productive work for one exercise-session; warmups/tests do not count. */
export function aggregateExerciseSessionWork(
  sets: PerformedSet[],
  loaded: boolean,
): ExerciseSessionWork | undefined {
  const working = sets.filter((set) => !set.isWarmup && !set.isCalibration);
  if (!working.length) return undefined;
  const completed = working.filter((set) => set.completed && !set.skipped);
  if (!completed.length) return undefined;

  const prescribedSetCount = working.length;
  const prescribedWeight = working
    .map((set) => set.prescribedWeightKg)
    .find((weight): weight is number => weight != null && weight > 0);
  const fallbackWorkingWeight = completed
    .map((set) => set.weightKg)
    .find((weight): weight is number => weight != null && weight > 0);
  const referenceWeight = prescribedWeight ?? fallbackWorkingWeight;
  const prescribedWork = working.reduce((total, set) => {
    const quantity = set.prescribedReps ?? set.prescribedDurationSec ?? set.reps ?? set.durationSec ?? 0;
    const weight = loaded ? (set.prescribedWeightKg ?? referenceWeight ?? 0) : 1;
    return total + weight * quantity;
  }, 0);
  const performedWork = completed.reduce((total, set) => {
    const quantity = set.reps ?? set.durationSec ?? 0;
    const weight = loaded ? (set.weightKg ?? 0) : 1;
    return total + weight * quantity;
  }, 0);
  const totalPerformedReps = completed.reduce((total, set) => total + (set.reps ?? 0), 0);
  const totalPerformedDurationSec = completed.reduce((total, set) => total + (set.durationSec ?? 0), 0);
  const comparableRepWork = completed.reduce((total, set) => {
    if (set.reps == null) return total;
    if (!loaded) return total + set.reps;
    if (!referenceWeight || !set.weightKg) return total;
    return total + set.reps * (set.weightKg / referenceWeight);
  }, 0);
  const actualWeightedReps = completed.reduce(
    (total, set) => total + (set.reps != null && set.weightKg != null ? set.reps : 0),
    0,
  );
  const lowerLoad = loaded && prescribedWeight != null && actualWeightedReps > 0 &&
    completed.some((set) => set.weightKg != null && set.weightKg < prescribedWeight - 1e-9);
  const cleanLoads = completed
    .filter((set) => set.quality !== 'pain' && set.quality !== 'form_breakdown')
    .map((set) => set.weightKg ?? 0);

  return {
    prescribedSetCount,
    completedSetCount: completed.length,
    skippedSetCount: working.filter((set) => set.skipped).length,
    totalPerformedReps,
    totalPerformedDurationSec,
    prescribedWork,
    performedWork,
    workCompletionRatio: prescribedWork > 0 ? performedWork / prescribedWork : 0,
    equivalentRepsPerPlannedSet:
      comparableRepWork > 0 ? comparableRepWork / prescribedSetCount : undefined,
    heaviestCleanWorkingLoadKg: cleanLoads.length ? Math.max(...cleanLoads) : undefined,
    lowerLoad,
    qualityBlocked: completed.some((set) => set.quality === 'pain' || set.quality === 'form_breakdown'),
  };
}

/**
 * The most recent session's aggregate working-set performance. Calibration
 * sets remain a separate measurement path; warmups never earn progression.
 */
function lastPerformance(
  exerciseId: string,
  history: SessionRecord[],
  loaded: boolean,
): LastPerformance | undefined {
  const sorted = history.slice().sort((a, b) => b.plannedFor - a.plannedFor);
  for (const rec of sorted) {
    const ex = rec.performed.find((p) => p.exerciseId === exerciseId);
    if (!ex) continue;
    const completed = ex.sets.filter((s) => s.completed && !s.skipped);
    if (!completed.length) continue;

    const calibration = completed.filter((set) => set.isCalibration);
    if (calibration.length) {
      const top = calibration.reduce((best, set) => ((set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best));
      const priorWorkingWeightKg = completed
        .filter((set) => !set.isCalibration && !set.isWarmup)
        .reduce((best, set) => Math.max(best, set.weightKg ?? 0), 0) || undefined;
      return summarizeCalibration(top, priorWorkingWeightKg);
    }

    const aggregate = aggregateExerciseSessionWork(ex.sets, loaded);
    if (!aggregate) continue;
    const working = ex.sets.filter((set) => !set.isWarmup && !set.isCalibration);
    const first = working[0];
    const rpes = completed.map((set) => set.rpe).filter((rpe): rpe is number => rpe != null);
    const prescribedRpes = working.map((set) => set.prescribedRpe).filter((rpe): rpe is number => rpe != null);
    const referenceWeight = working
      .map((set) => set.prescribedWeightKg)
      .find((weight): weight is number => weight != null && weight > 0) ??
      completed.map((set) => set.weightKg).find((weight): weight is number => weight != null && weight > 0);
    return {
      weightKg: loaded ? referenceWeight ?? aggregate.heaviestCleanWorkingLoadKg : undefined,
      reps: aggregate.equivalentRepsPerPlannedSet,
      durationSec: aggregate.totalPerformedDurationSec / aggregate.prescribedSetCount || undefined,
      rpe: rpes.length ? Math.max(...rpes) : undefined,
      prescribedReps: working.reduce((sum, set) => sum + (set.prescribedReps ?? set.reps ?? 0), 0) / aggregate.prescribedSetCount,
      prescribedRpe: prescribedRpes.length ? Math.max(...prescribedRpes) : first?.prescribedRpe,
      prescribedDurationSec: working.reduce((sum, set) => sum + (set.prescribedDurationSec ?? set.durationSec ?? 0), 0) / aggregate.prescribedSetCount || undefined,
      prescribedZone: first?.prescribedZone,
      prescribedSetCount: aggregate.prescribedSetCount,
      completedSetCount: aggregate.completedSetCount,
      skippedSetCount: aggregate.skippedSetCount,
      prescribedWork: aggregate.prescribedWork,
      performedWork: aggregate.performedWork,
      workCompletionRatio: aggregate.workCompletionRatio,
      equivalentRepsPerPlannedSet: aggregate.equivalentRepsPerPlannedSet,
      lowerLoad: aggregate.lowerLoad,
      qualityBlocked: aggregate.qualityBlocked,
    };
  }
  return undefined;
}

/**
 * Step a load up by one increment, honoring the session cap.
 *
 * The +10% cap is the wrong instrument for a light lift: at 10 kg it leaves 1 kg
 * of headroom while the smallest real dumbbell/plate step is 2.5 kg, and
 * `snapToSensibleWeight` then floors straight back to 10 kg — which is why every
 * lift under 25 kg used to hold its load forever. One minimum increment is
 * always permitted *here specifically*, because this branch is only reached once
 * the athlete has completed the top of the rep range, and the accompanying reset
 * to `range.min` cuts the set's volume-load anyway (10 kg × 12 = 120 →
 * 12.5 kg × 8 = 100). The rep reset is what makes the step safe, not the
 * percentage — so the allowance stays scoped to the earned case and never
 * loosens the cap for `recommendLoad`.
 */
function steppedLoad(
  fromKg: number,
  unit: WeightUnit,
  available: number[] | undefined,
  weeklyCeilingKg: number | undefined,
  achievedReps: number,
  resetReps: number,
  floorKg?: number,
): number {
  const increment = defaultIncrementKg(unit);
  const ceiling = Math.max(fromKg * (1 + SAFETY.MAX_SESSION_LOAD_INCREASE_PCT), fromKg + increment);
  const target = Math.min(fromKg + increment, roundToHalfKg(ceiling));
  // The weekly ceiling binds on top of the session cap, but never below the
  // load already being used — it exists to stop compounding, not to force a
  // reduction (which is what the deload branches are for).
  const capped = weeklyCeilingKg != null ? Math.min(target, Math.max(fromKg, weeklyCeilingKg)) : target;
  const candidate = snapToSensibleWeight(capped, unit, available, floorKg);
  // A large minimum increment needs performance evidence. A rep reset is not
  // proof when the candidate implies a materially higher estimated strength.
  if (epley1RM(candidate, resetReps) > epley1RM(fromKg, achievedReps) * 1.04) return fromKg;
  return candidate;
}

const WEEK_MS = 7 * 86_400_000;

/**
 * The most a lift may weigh today given what it weighed last week (CLAUDE.md
 * §6, `SAFETY.MAX_WEEKLY_LOAD_INCREASE_PCT`). Measured against the best
 * *working* load of the previous ISO week — calibration/max-day top sets are
 * deliberately excluded, since they are a test, not a working baseline.
 *
 * Returns undefined when there is no previous-week evidence, so a brand-new or
 * long-dormant lift is never blocked from finding its level.
 */
export function weeklyLoadCeiling(
  exerciseId: string,
  history: SessionRecord[],
  now: number,
  unit: WeightUnit = 'kg',
): number | undefined {
  const thisWeekStart = isoWeekStart(now);
  const lastWeekStart = thisWeekStart - WEEK_MS;

  let best = 0;
  for (const record of history) {
    const when = record.completedAt ?? record.plannedFor;
    if (when < lastWeekStart || when >= thisWeekStart) continue;
    for (const performed of record.performed) {
      if (performed.exerciseId !== exerciseId) continue;
      for (const set of performed.sets) {
        if (!set.completed || set.skipped || set.isCalibration) continue;
        if (set.weightKg != null && set.weightKg > best) best = set.weightKg;
      }
    }
  }
  if (best <= 0) return undefined;
  // Same reasoning as `steppedLoad`: a percentage ceiling alone would re-create
  // the light-lift stall one level up. At 10 kg, +15% is 11.5 while the smallest
  // real step is 12.5, so a weekly cap without this floor would permanently
  // block exactly the lifts the double-progression fix was written to rescue.
  // One increment above last week is always reachable; the point of the ceiling
  // is to stop *compounding*, not to freeze small loads.
  return Math.max(best * (1 + SAFETY.MAX_WEEKLY_LOAD_INCREASE_PCT), best + defaultIncrementKg(unit));
}

/** Preserve estimated 1RM when the prescribed rep count moves (ADR-0125). */
function reconcileForReps(weightKg: number, earnedReps: number, targetReps: number, unit: WeightUnit, available?: number[], floorKg?: number): number {
  if (earnedReps <= 0 || targetReps <= 0 || earnedReps === targetReps) return weightKg;
  const estimated = epley1RM(weightKg, earnedReps) / (1 + targetReps / 30);
  return snapToSensibleWeight(roundToHalfKg(estimated), unit, available, floorKg);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The range's nominal target — what the session would have prescribed flat. */
function rangeCentre(range: RepRange): number {
  return Math.round((range.min + range.max) / 2);
}

/**
 * Today's prescription for one exercise: what load, and what work at that load.
 *
 * Supersedes the load-only `recommendLoad` for the Main block. Reps carry the
 * progression inside `range`; the load only steps once the top of the range has
 * actually been earned, at which point reps reset to the bottom. Unloaded work
 * (bodyweight reps, timed holds) has no load axis, so its reps/holds climb past
 * `range.max` up to a sane ceiling — that is its progression.
 *
 * Effort is read conservatively. The tracker pre-fills each set's RPE with the
 * target, so a logged RPE equal to what was prescribed is indistinguishable from
 * an untouched default and is treated as *no* effort signal; the rep evidence
 * decides instead. Records predating ADR-0125 carry no prescribed values, so
 * they fall back to the logged ones and behave as before.
 */
export function recommendPrescription(
  ex: Exercise,
  history: SessionRecord[],
  targetRpe: number,
  range: RepRange,
  options: PrescriptionOptions = {},
): ExercisePrescription {
  const { unit = 'kg', available, now, zone } = options;
  const loaded = ex.progression === 'weight' || ex.loadsWeight === true;
  const timed = ex.progression === 'time' || ex.progression === 'hold';
  const floorKg = barbellFloorKg(ex);
  const last = lastPerformance(ex.id, history, loaded);

  // No basis yet — start in the MIDDLE of the range and let the athlete log the
  // load themselves (same contract `recommendLoad` has always had). The centre,
  // not the bottom: the range is centred on the session's existing rep target,
  // so a first exposure is prescribed exactly what it always was. Starting at
  // `min` would quietly make every new exercise easier than before.
  if (!last) return timed && !loaded ? {} : { reps: rangeCentre(range) };

  const askedReps = last.prescribedReps ?? last.reps;
  const didReps = last.reps;
  const askedSec = last.prescribedDurationSec ?? last.durationSec;
  const didSec = last.durationSec;

  // An RPE equal to the one prescribed carries no information (see above).
  const effortKnown = last.rpe != null && (last.prescribedRpe == null || last.rpe !== last.prescribedRpe);
  const feltEasy = effortKnown && (last.rpe as number) <= targetRpe - 1;
  const groundOut = effortKnown && (last.rpe as number) >= targetRpe + 2;

  // ---- Unloaded timed work: the hold itself is the progression. ----
  if (timed && !loaded) {
    if (didSec == null) return {};
    const metWork = last.workCompletionRatio >= 1;
    if (last.qualityBlocked && metWork) {
      return { durationSec: Math.max(10, Math.round(askedSec ?? didSec)), note: 'work achieved — holding duration because pain or form changed' };
    }
    if (groundOut) return { durationSec: Math.max(10, didSec - PROGRESSION.HOLD_STEP_SEC), note: 'shorter hold — last one ground out' };
    if (!metWork) return { durationSec: askedSec, note: `holding at ${askedSec}s` };
    const step = feltEasy ? PROGRESSION.HOLD_STEP_EASY_SEC : PROGRESSION.HOLD_STEP_SEC;
    const next = Math.min(PROGRESSION.MAX_HOLD_SEC, didSec + step);
    return {
      durationSec: next,
      note: next > didSec ? `+${next - didSec}s from last time` : `holding at ${next}s`,
    };
  }

  // ---- Unloaded rep work (bodyweight): reps climb without a load ceiling. ----
  if (!loaded) {
    if (didReps == null) return { reps: range.min };
    const metWork = last.workCompletionRatio >= 1;
    if (last.qualityBlocked && metWork) {
      return { reps: Math.round(askedReps ?? didReps), note: 'work achieved — holding reps because pain or form changed' };
    }
    if (groundOut) {
      return { reps: Math.max(range.min, didReps - PROGRESSION.REP_BACKOFF), note: 'fewer reps — last set ground out' };
    }
    if (!metWork) return { reps: askedReps, note: `holding at ${askedReps} reps` };
    const step = feltEasy ? PROGRESSION.REP_STEP_EASY : PROGRESSION.REP_STEP;
    const next = Math.min(PROGRESSION.MAX_UNLOADED_REPS, didReps + step);
    return {
      reps: next,
      note: next > didReps ? `+${next - didReps} rep${next - didReps > 1 ? 's' : ''} from last time` : `holding at ${next} reps`,
    };
  }

  // ---- Loaded work: double progression. ----
  const lastW = last.weightKg;
  if (lastW == null || lastW <= 0) return { reps: range.min };
  const performedReps = didReps ?? range.min;
  const metWork = last.workCompletionRatio >= 1;

  // A test set is a measurement, not an invitation to train at that load
  // (ADR-0128). It must be handled BEFORE the effort branches: an all-out AMRAP
  // is logged at RPE 9, which `groundOut` would otherwise read as "they ground
  // it out — deload", and its weight is by construction the heaviest set of the
  // session, so `lastPerformance` picks it. Left unhandled, a max day's ~110%
  // attempt silently became the next session's working weight.
  if (last.isCalibration && didReps != null && didReps > 0) {
    const capBase = last.priorWorkingWeightKg ?? lastW;
    const cap = roundToHalfKg(capBase * (1 + SAFETY.MAX_SESSION_LOAD_INCREASE_PCT));
    const estimatedOneRepMax = epley1RM(lastW, didReps);
    // Converting the rep count alone is not enough: a test is taken to failure
    // while working sets deliberately are not, so the same reps at the same
    // weight mean different things. Discount by the RPE gap between the test and
    // the working target — roughly a couple of percent of load per RPE point.
    const testRpe = last.prescribedRpe ?? last.rpe ?? PROGRESSION.TEST_RPE;
    const effortGap = clamp(testRpe - targetRpe, 0, PROGRESSION.MAX_TEST_BUFFER_RPE);
    const buffer = 1 - effortGap * PROGRESSION.LOAD_PCT_PER_RPE;
    const workingAtTarget = (estimatedOneRepMax / (1 + range.min / 30)) * buffer;
    const target = snapToSensibleWeight(Math.min(workingAtTarget, cap), unit, available, floorKg);
    return {
      weightKg: target,
      reps: range.min,
      note: `calibrated from ${didReps} clean reps — working load set to ${formatSuggestedWeight(target, unit)}`,
    };
  }

  if (groundOut) {
    return {
      weightKg: snapToSensibleWeight(lastW * (1 - SAFETY.DELOAD_PCT), unit, available, floorKg),
      reps: range.min,
      note: `deloaded ${Math.round(SAFETY.DELOAD_PCT * 100)}% — RPE ${last.rpe} last time`,
    };
  }

  // Pain/form breakdown and a reduced performed load do not erase completed
  // work, but neither can independently justify a heavier prescription.
  if (metWork && last.qualityBlocked) {
    return {
      weightKg: lastW,
      reps: clamp(Math.round(Math.max(askedReps ?? range.min, performedReps)), range.min, range.max),
      note: 'aggregate work achieved — load held because pain or form changed',
    };
  }
  if (metWork && last.lowerLoad) {
    return {
      weightKg: lastW,
      reps: clamp(Math.round(askedReps ?? range.min), range.min, range.max),
      note: 'aggregate work credited proportionally — repeat the planned load before increasing it',
    };
  }

  // The rep band itself moved (e.g. switching bodybuilding → sculpting), so the
  // load earned at the old rep count is not the right load for the new one. The
  // upper tolerance keeps an equipment-capped rep climb (below) from reading as
  // a style change and pointlessly re-reconciling a load that never moved.
  const zoneChanged = zone != null && last.prescribedZone != null && last.prescribedZone !== zone;
  const bandDrifted =
    askedReps != null &&
    (askedReps < range.min || askedReps > range.max + PROGRESSION.EQUIPMENT_CAPPED_REP_HEADROOM);
  if (zoneChanged || (last.prescribedZone == null && bandDrifted)) {
    const reconciled = reconcileForReps(lastW, performedReps, range.min, unit, available, floorKg);
    return {
      weightKg: reconciled,
      reps: range.min,
      note:
        reconciled === lastW
          ? `${range.min} reps today`
          : `${formatSuggestedWeight(reconciled, unit)} for ${range.min} reps — matched to your ${performedReps}-rep effort at ${formatSuggestedWeight(lastW, unit)}`,
    };
  }

  if (!metWork) {
    const repeat = clamp(Math.round(askedReps ?? range.min), range.min, range.max);
    return { weightKg: lastW, reps: repeat, note: `repeating ${repeat} reps at ${formatSuggestedWeight(lastW, unit)} — ${Math.round(last.workCompletionRatio * 100)}% of planned work completed` };
  }

  // Top of the range earned → step the load and reset the reps.
  if (performedReps >= range.max) {
    const weeklyCeiling = now != null ? weeklyLoadCeiling(ex.id, history, now, unit) : undefined;
    const stepped = steppedLoad(lastW, unit, available, weeklyCeiling, performedReps, range.min, floorKg);
    if (stepped > lastW) {
      return {
        weightKg: stepped,
        reps: range.min,
        note: `+${formatSuggestedWeight(stepped - lastW, unit)} — you finished ${performedReps} reps at ${formatSuggestedWeight(lastW, unit)}`,
      };
    }
    // The step didn't land — either the athlete owns nothing heavier, or this
    // week's ceiling is already reached. Keep climbing reps rather than
    // resetting them onto an unchanged load, which would be a straight
    // regression, and say which limit is actually binding.
    const heldByWeek = weeklyCeiling != null && weeklyCeiling < lastW + defaultIncrementKg(unit);
    const ceiling = range.max + PROGRESSION.EQUIPMENT_CAPPED_REP_HEADROOM;
    const next = Math.min(ceiling, performedReps + PROGRESSION.REP_STEP);
    if (next <= performedReps) {
      // Out of road: no heavier load and no more rep headroom. Hold honestly
      // rather than inventing progress that isn't there.
      return { weightKg: lastW, reps: performedReps, note: `holding ${performedReps} reps at ${formatSuggestedWeight(lastW, unit)}` };
    }
    return {
      weightKg: lastW,
      reps: next,
      note: heldByWeek
        ? `${next} reps — already at this week's load ceiling for this lift`
        : `${next} reps — no heavier weight available yet`,
    };
  }

  const step = feltEasy ? PROGRESSION.REP_STEP_EASY : PROGRESSION.REP_STEP;
  const base = Math.max(askedReps ?? range.min, performedReps);
  const next = Math.min(range.max, Math.floor(base) + step);
  return {
    weightKg: lastW,
    reps: next,
    note: next > performedReps
      ? `+${next - performedReps} rep${next - performedReps > 1 ? 's' : ''} at ${formatSuggestedWeight(lastW, unit)}`
      : `${next} reps at ${formatSuggestedWeight(lastW, unit)}`,
  };
}
