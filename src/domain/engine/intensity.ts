/**
 * Shared per-exercise intensity model (ADR-0123). Two honestly-sourced
 * tracks collapse into one continuous signal:
 *  - cardio: a real (or tier-fallback) MET value, interpolated between
 *    fixed ACSM-style anchors.
 *  - strength: a mechanics-derived load-demand multiplier (SFR-grounded),
 *    hand-overridable per exercise.
 *
 * Pure, no RN/IO (ADR-0003). Anchors are FIXED constants, not derived from
 * catalog min/max — adding one new extreme-MET exercise later can never
 * silently shift every other exercise's derived RPE/rest/fatigue.
 */

import { MET_BY_TIER } from '../metrics/calories';
import type { Exercise } from '../types';
import { mechanicOf } from './mechanic';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** ACSM-style intensity band anchors. */
export const MET_LO = 3; // light
export const MET_HI = 12; // vigorous

/** Shared multiplier range both tracks (cardio MET, strength loadDemand)
 * resolve into — this is what lets FATIGUE.SET_LOAD scale consistently
 * regardless of which track an exercise belongs to. `loadDemand` itself is
 * authored on this same fixed scale. */
export const LOAD_DEMAND_LO = 0.7;
export const LOAD_DEMAND_HI = 1.4;
/** Neutral midpoint — an exercise at exactly this loadDemand produces a rest
 * multiplier of exactly 1.0 (see restIntensityFactor): today's flat per-tier
 * rest value, unchanged. */
export const LOAD_DEMAND_MID = (LOAD_DEMAND_LO + LOAD_DEMAND_HI) / 2; // 1.05

type CardioInputs = Pick<Exercise, 'metValue' | 'movementPattern'>;

/** MET for an exercise: real value if tagged, else the same cardio tier
 * fallback calories.ts uses (kept in sync via the shared constant, not a
 * duplicated magic number). */
export function metForExercise(exercise: CardioInputs): number {
  if (exercise.metValue != null) return exercise.metValue;
  return exercise.movementPattern === 'interval' ? MET_BY_TIER.cardio_interval : MET_BY_TIER.cardio_steady;
}

/** Normalized 0..1 position of `met` within [MET_LO, MET_HI] — exported for
 * UI bucketing (intensityLabel, exercise-detail.tsx), not just internal use. */
export function cardioIntensityT(met: number): number {
  return clamp((met - MET_LO) / (MET_HI - MET_LO), 0, 1);
}

/** RPE for the "work" phase/bout — 5 (MET_LO, light) .. 9 (MET_HI, vigorous). */
export function cardioWorkRpe(met: number): number {
  return Math.round(5 + cardioIntensityT(met) * 4);
}

/** Recovery:work rest ratio for interval rounds — 1x (MET_LO) .. 3x (MET_HI). */
export function cardioRestRatio(met: number): number {
  return 1 + cardioIntensityT(met) * 2;
}

/** Cardio side of the shared multiplier range. */
export function cardioIntensityMultiplier(met: number): number {
  return LOAD_DEMAND_LO + cardioIntensityT(met) * (LOAD_DEMAND_HI - LOAD_DEMAND_LO);
}

type LoadDemandInputs = Pick<Exercise, 'mechanic' | 'movementPattern' | 'primaryAreas' | 'secondaryAreas' | 'unilateral'>;

/**
 * Heuristic default when `loadDemand` is unset — derived only from fields the
 * catalog already has: compound vs. isolation (base cost), how much muscle
 * mass is recruited (primary + half-credit secondary, mirroring
 * FATIGUE.SECONDARY_CREDIT's 0.4 spirit), and unilateral stabilization
 * demand. Clamped to the fixed [LOAD_DEMAND_LO, LOAD_DEMAND_HI] scale.
 */
export function defaultLoadDemand(exercise: LoadDemandInputs): number {
  const base = mechanicOf(exercise as Exercise) === 'compound' ? 1.1 : 0.85;
  const massCount = exercise.primaryAreas.length + (exercise.secondaryAreas?.length ?? 0) * 0.5;
  const massBonus = clamp((massCount - 1) * 0.08, 0, 0.25);
  const unilateralBonus = exercise.unilateral ? 0.05 : 0;
  return clamp(base + massBonus + unilateralBonus, LOAD_DEMAND_LO, LOAD_DEMAND_HI);
}

export function resolvedLoadDemand(exercise: LoadDemandInputs & { loadDemand?: number }): number {
  return exercise.loadDemand ?? defaultLoadDemand(exercise);
}

type IntensityInputs = CardioInputs &
  LoadDemandInputs & {
    modality: Exercise['modality'];
    loadDemand?: number;
  };

/** Top-level dispatcher fatigue.ts uses: cardio → MET track, else →
 * loadDemand track. Both land in [LOAD_DEMAND_LO, LOAD_DEMAND_HI]. */
export function intensityMultiplierFor(exercise: IntensityInputs): number {
  if (exercise.modality === 'cardio') return cardioIntensityMultiplier(metForExercise(exercise));
  return resolvedLoadDemand(exercise);
}

const REST_INTENSITY_LO = 0.85;
const REST_INTENSITY_HI = 1.15;

/** Graded rest multiplier for strength sets (timing.ts). Bounded ±15% so it
 * nudges within timing.ts's existing rep-range tiers rather than overriding
 * them — HYPERTROPHY_COMPOUND × 1.15 stays below HEAVY_COMPOUND × 0.85, so
 * tiers never invert. */
export function restIntensityFactor(exercise: LoadDemandInputs & { loadDemand?: number }): number {
  const demand = resolvedLoadDemand(exercise);
  const t = clamp((demand - LOAD_DEMAND_LO) / (LOAD_DEMAND_HI - LOAD_DEMAND_LO), 0, 1);
  return REST_INTENSITY_LO + t * (REST_INTENSITY_HI - REST_INTENSITY_LO);
}
