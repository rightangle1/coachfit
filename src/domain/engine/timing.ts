/**
 * Session time model (ADR-0120). Pure, deterministic, offline.
 *
 * A session's real length is dominated by REST, and rest depends on the set's
 * job (heavy compounds rest longest). This module turns a prescribed set into an
 * honest number of seconds so the engine can budget by real time instead of a
 * flat fudge factor — see docs/methodology/strength-set-design.md §2.
 *
 * Kept free of catalog/data imports (ADR-0003): callers pass the resolved
 * `Exercise` (or a resolver), so this stays trivially unit-testable.
 */

import type { Exercise, PlannedSet, SessionBlock, SessionRecord } from '../types';
import { restIntensityFactor } from './intensity';
import { mechanicOf } from './mechanic';

export { mechanicOf } from './mechanic';
export type { Mechanic } from './mechanic';

/**
 * Nominal active-work seconds for a rep-based strength set. Deliberately
 * rep-INDEPENDENT: a set's work time (~20-45 s) is dwarfed by its rest
 * (90-165 s), and effort (the reps/RPE lever) must never change scheduled
 * session length — that's the time budget's job (methodology §3). Timed holds /
 * cardio use their real `durationSec` instead.
 */
export const NOMINAL_REP_WORK_SEC = 30;

/** Median athlete-specific actual/planned ratio, conservatively bounded. */
export function durationCalibrationFactor(history: SessionRecord[]): number {
  const ratios = history
    .filter((record) =>
      record.startedAt != null && record.completedAt != null &&
      record.plannedDurationMin != null && record.plannedDurationMin > 0 &&
      record.completedAt > record.startedAt,
    )
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number))
    .slice(0, 8)
    .map((record) => ((record.completedAt as number) - (record.startedAt as number)) / 60_000 / (record.plannedDurationMin as number))
    .filter((ratio) => ratio >= 0.5 && ratio <= 2)
    .sort((a, b) => a - b);
  if (!ratios.length) return 1;
  const middle = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2;
  return Math.max(0.85, Math.min(1.15, median));
}

/** Load-aware rest, in seconds, by set job. */
export const REST = {
  HEAVY_COMPOUND: 165, // ≤6 reps or RPE ≥8, multi-joint
  HYPERTROPHY_COMPOUND: 90,
  ISOLATION: 50,
  CORE_MOBILITY: 15,
  WARMUP: 15,
  CARDIO: 0, // rest is intrinsic to the bout / recovery phase
  // A circuit keeps moving between stations (ADR-0138) — brief, not zero
  // like steady/interval cardio's "rest is intrinsic to the bout" case.
  AEROBICS_TRANSITION: 10,
  // Loaded-implement circuit stations (kettlebell/dumbbell work) keep the
  // "brief transition, not full recovery" circuit format, but get double the
  // bodyweight transition — ballistic loaded movement needs more buffer
  // between stations than a bodyweight aerobics step does.
  LOADED_CIRCUIT_TRANSITION: 20,
  // Dense-pacing (ADR-0145) circuit transitions. Deliberately a gentler 20%
  // cut than the straight-set factors below — these constants already sit at
  // the tightest-safe value ADR-0138/the loaded-station buffer established,
  // not a generic default with headroom. The 2x aerobics:loaded ratio above is
  // preserved exactly (8 × 2 = 16), not re-derived.
  DENSE_AEROBICS_TRANSITION: 8,
  DENSE_LOADED_CIRCUIT_TRANSITION: 16,
} as const;

/**
 * A superset/antagonist pairing pays its shared rest roughly once per round
 * rather than once per exercise — this is what makes supersets buy time. Applied
 * to grouped exercises' rest so the budget actually credits the structure.
 */
export const SUPERSET_REST_FACTOR = 0.55;

/**
 * Dense pacing's (ADR-0145) discount on a compound set's rest — gentler than
 * isolation's, since compound recovery is where insufficient rest risks
 * technique breakdown (`PerformedSet.quality: 'form_breakdown'`), not just a
 * slower pace. Never applied to a genuinely heavy set — see `densePacingFactor`.
 */
export const DENSE_PACING_COMPOUND_FACTOR = 0.75;
/** Isolation work tolerates a more aggressive cut — lower stakes, single joint. */
export const DENSE_PACING_ISOLATION_FACTOR = 0.6;

/**
 * Whether a strength set is heavy enough to need long, full rest. Keyed on the
 * REP range (low reps = high load), not the daily effort dial: a 10-rep
 * hypertrophy set stays in the 90 s tier whether it's an easy or a challenge day,
 * so effort never silently changes scheduled length. Only genuinely heavy work
 * (≤6 reps, or ≤8 reps taken to a true grind at RPE ≥9) earns full rest.
 */
function isHeavySet(set: PlannedSet): boolean {
  if (set.reps != null && set.reps <= 6) return true;
  return set.reps != null && set.reps <= 8 && set.targetRpe != null && set.targetRpe >= 9;
}

/** Rest AFTER a set of `exercise`, before superset adjustment. */
export function restSecondsFor(exercise: Exercise, set: PlannedSet): number {
  if (set.isWarmup) return REST.WARMUP;
  if (exercise.movementPattern === 'aerobics') return REST.AEROBICS_TRANSITION;
  if (exercise.modality === 'cardio') return REST.CARDIO;
  if (
    exercise.modality === 'mobility' ||
    exercise.movementPattern === 'stretch' ||
    exercise.movementPattern === 'yoga_flow' ||
    exercise.movementPattern === 'core'
  ) {
    return REST.CORE_MOBILITY;
  }
  const factor = restIntensityFactor(exercise);
  if (mechanicOf(exercise) === 'compound') {
    return roundToNearest10((isHeavySet(set) ? REST.HEAVY_COMPOUND : REST.HYPERTROPHY_COMPOUND) * factor);
  }
  return roundToNearest10(REST.ISOLATION * factor);
}

/**
 * Dense-pacing (ADR-0145) discount on `restSecondsFor`'s output for `set`, or
 * `1` (no-op) when it doesn't apply. Every safety exemption lives here, in one
 * place, rather than as separately-derived booleans at each call site:
 *  - Off entirely, or a calibration/AMRAP test set, or a warmup — always `1`.
 *    A max-effort test (`isCalibration`) needs full recovery regardless of
 *    rep count, so it's exempt even outside `isHeavySet`'s reps ≤8 window
 *    (the endurance-zone test is 15 reps at RPE 9 — genuinely all-out, not
 *    caught by the low-rep heuristic that flags a heavy compound).
 *  - Cardio/mobility/aerobics exercises — `1`; dense pacing only shapes
 *    strength-tier rest. Circuit-station transitions have their own,
 *    separately-calibrated lever (`REST.DENSE_AEROBICS_TRANSITION`/
 *    `REST.DENSE_LOADED_CIRCUIT_TRANSITION`), applied at the call site.
 *  - A genuinely heavy compound set (`isHeavySet`) — `1`; full rest regardless
 *    of goal pacing (CLAUDE.md: "a good trainer would rather under-load than
 *    injure").
 *  - Otherwise: `DENSE_PACING_COMPOUND_FACTOR` or `DENSE_PACING_ISOLATION_FACTOR`.
 */
export function densePacingFactor(exercise: Exercise, set: PlannedSet, densePacing: boolean): number {
  if (!densePacing || set.isCalibration || set.isWarmup) return 1;
  if (
    exercise.modality === 'cardio' ||
    exercise.modality === 'mobility' ||
    exercise.movementPattern === 'stretch' ||
    exercise.movementPattern === 'yoga_flow' ||
    exercise.movementPattern === 'core' ||
    exercise.movementPattern === 'aerobics'
  ) {
    return 1;
  }
  if (mechanicOf(exercise) === 'compound') {
    return isHeavySet(set) ? 1 : DENSE_PACING_COMPOUND_FACTOR;
  }
  return DENSE_PACING_ISOLATION_FACTOR;
}

/**
 * `restSecondsFor`, adjusted for dense pacing. Kept as a thin wrapper — rather
 * than a 3rd param on `restSecondsFor` itself — so `restSecondsFor` stays pure
 * and every existing caller/test is untouched. Only re-rounds when a real
 * discount applies (`factor !== 1`): re-running an already-rounded value
 * through `roundToNearest10` unconditionally would silently inflate it (e.g.
 * `roundToNearest10(15)` = 20, not 15 — `Math.round(1.5)` rounds up), which
 * would break the "densePacing: false reproduces today's values exactly"
 * guarantee this whole feature depends on.
 */
export function pacedRestSecondsFor(exercise: Exercise, set: PlannedSet, densePacing: boolean): number {
  const base = restSecondsFor(exercise, set);
  const factor = densePacingFactor(exercise, set, densePacing);
  return factor === 1 ? base : roundToNearest10(base * factor);
}

/** Rest is displayed/counted down in the tracker UI, so keep it a round, glanceable number. */
export function roundToNearest10(seconds: number): number {
  return Math.round(seconds / 10) * 10;
}

/** One-time setup/teardown for an exercise (rack a bar, clip a cable, etc.). */
export function transitionSecondsFor(exercise: Exercise): number {
  // Mobility work flows quickly between drills/poses — little setup.
  if (
    exercise.modality === 'mobility' ||
    exercise.movementPattern === 'stretch' ||
    exercise.movementPattern === 'yoga_flow'
  ) {
    return 10;
  }
  if (exercise.modality === 'cardio') return 20;
  // This 45 is SECONDS of rack-setup time — unrelated to progression.ts's
  // BARBELL_BAR_WEIGHT_KG (ADR-0144, the empty bar's 45-LB weight). Same
  // number, disjoint meaning; don't conflate the two when reading either one.
  if (exercise.equipment.includes('barbell') || exercise.equipment.includes('squat_rack')) return 45;
  if (exercise.equipment.includes('cable_machine') || exercise.equipment.includes('bench')) return 35;
  return 30;
}

/** Active work seconds for one set: real duration for holds/cardio, a nominal
 * rep-independent value for rep-based strength work (see NOMINAL_REP_WORK_SEC).
 * A `unilateral` exercise (single-leg hold, single-arm carry, etc.) is
 * prescribed and performed per side, so its real work time is double the
 * per-side figure — a "3 sets of 30s per leg" hold costs 60s of work per set,
 * not 30s, even though every rep/duration on the plan is still the per-side
 * number a trainer would actually prescribe. */
export function workSecondsFor(set: PlannedSet, exercise?: Pick<Exercise, 'unilateral'>): number {
  const base = set.durationSec != null
    ? set.durationSec
    : set.reps != null
      ? Math.max(3, set.reps * 3)
      : NOMINAL_REP_WORK_SEC;
  return exercise?.unilateral ? base * 2 : base;
}

/**
 * Full cost of a single set: work + rest. Grouped (superset) and dense-paced
 * are mutually exclusive, never stacked (ADR-0145) — a grouped set always pays
 * `SUPERSET_REST_FACTOR` alone, exactly as before this feature existed.
 * Multiplying both discounts together would compound into a budget estimate
 * far below the real displayed rest for that same set (`annotateRest` never
 * applies `SUPERSET_REST_FACTOR`), causing `fitDurationToBudget` to pack in
 * more work than actually fits and real sessions to run over their requested
 * duration.
 */
export function setCostSeconds(exercise: Exercise, set: PlannedSet, grouped = false, densePacing = false): number {
  const rest = grouped
    ? restSecondsFor(exercise, set) * SUPERSET_REST_FACTOR
    : pacedRestSecondsFor(exercise, set, densePacing);
  return workSecondsFor(set, exercise) + rest;
}

/**
 * Estimate total seconds for a set of blocks. `resolve` maps a planned
 * exercise's id back to its catalog `Exercise`; unknown ids fall back to a
 * neutral cost so a missing entry never zeroes the estimate. `densePacing`
 * mirrors the real rest model (`annotateRest`, rules-engine.ts) so the
 * duration estimate and the athlete-facing displayed rest never diverge.
 */
export function estimateBlocksSeconds(
  blocks: SessionBlock[],
  resolve: (id: string) => Exercise | undefined,
  densePacing = false,
): number {
  let seconds = 0;
  for (const block of blocks) {
    for (const planned of block.exercises) {
      const exercise = resolve(planned.exerciseId);
      const grouped = planned.rotationGroup != null;
      if (!exercise) {
        // Neutral fallback: treat as a rep-based isolation set.
        seconds += 30 + planned.sets.reduce((s, set) => s + workSecondsFor(set) + REST.ISOLATION, 0);
        continue;
      }
      seconds += transitionSecondsFor(exercise);
      const circuitTransition = planned.group?.type === 'circuit'
        ? (exercise.loadsWeight
            ? (densePacing ? REST.DENSE_LOADED_CIRCUIT_TRANSITION : REST.LOADED_CIRCUIT_TRANSITION)
            : (densePacing ? REST.DENSE_AEROBICS_TRANSITION : REST.AEROBICS_TRANSITION))
        : undefined;
      for (const set of planned.sets) {
        seconds += circuitTransition != null
          ? workSecondsFor(set, exercise) + circuitTransition
          : setCostSeconds(exercise, set, grouped, densePacing);
      }
    }
  }
  return seconds;
}
