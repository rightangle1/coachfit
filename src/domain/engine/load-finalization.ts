/**
 * Load finalization (ADR-0122). Pure, deterministic, offline.
 *
 * After progressive overload picks a base working load (recommendLoad, ADR-0103,
 * already clamped to the hard +10% session cap), a good trainer adjusts it for
 * TODAY: how recovered the muscle is, how the athlete feels, and whether they just
 * maxed that muscle out. These modifiers can only **reduce or hold** the load —
 * never raise it past the cap — so safety stays absolute (methodology §6-7).
 *
 * Returns the final load plus the individual factors, so the decision log can
 * record which signal moved the weight (CLAUDE.md §7).
 */

import type { Exercise, FatigueState, MuscleGroup, ReadinessInput, SessionRecord } from '../types';
import { layoffState } from './layoff';
import { readinessFactor } from './readiness';

export interface LoadFinalizationInput {
  baseWeightKg: number;
  exercise: Exercise;
  readiness: ReadinessInput;
  fatigue: FatigueState;
  history: SessionRecord[];
  now: number;
}

export interface LoadDrivers {
  readinessFactor: number;
  fatigueFactor: number;
  maxTaxFactor: number;
  /** Return-to-training ramp (ADR-0125); 1 when the athlete has been training. */
  layoffFactor: number;
}

export interface LoadFinalizationResult {
  weightKg: number;
  /** Human explanation when the load moved; undefined when nothing changed. */
  note?: string;
  drivers: LoadDrivers;
}

const MAX_READINESS_CUT = 0.1; // up to −10% for a rough day
const HIGH_FATIGUE_CUT = 0.1; //   −10% at/above the fatigued threshold
const MODERATE_FATIGUE_CUT = 0.06;
const LOW_FATIGUE_CUT = 0.03;
const MAX_TAX_CUT = 0.08; //        −8% when the muscle was just maxed
const MAX_TAX_WINDOW_MS = 4 * 86_400_000; // "recently" = within 4 days

function roundToHalfKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/** Graded readiness → load factor in [1 − MAX_READINESS_CUT, 1]. Never raises.
 * Shared banding with the volume axis — see readiness.ts (ADR-0107). */
function readinessFactorOf(r: ReadinessInput): number {
  return readinessFactor(r, MAX_READINESS_CUT);
}

/** Peak fatigue across the exercise's primary muscles → load factor. */
function fatigueFactorOf(primaries: MuscleGroup[], fatigue: FatigueState): { factor: number; peakGroup?: MuscleGroup } {
  let peak = 0;
  let peakGroup: MuscleGroup | undefined;
  for (const g of primaries) {
    const score = fatigue.byGroup[g] ?? 0;
    if (score > peak) {
      peak = score;
      peakGroup = g;
    }
  }
  const cut = peak >= 0.7 ? HIGH_FATIGUE_CUT : peak >= 0.5 ? MODERATE_FATIGUE_CUT : peak >= 0.35 ? LOW_FATIGUE_CUT : 0;
  return { factor: 1 - cut, peakGroup: cut > 0 ? peakGroup : undefined };
}

/** Whether any primary muscle was maxed out recently (calibration/PR day). */
function maxTaxOf(
  primaries: MuscleGroup[],
  fatigue: FatigueState,
  history: SessionRecord[],
  now: number,
): { factor: number; group?: MuscleGroup } {
  // Primary signal: the fatigue model already flags a muscle's last session as max.
  for (const g of primaries) {
    const d = fatigue.details?.[g];
    if (d?.lastWorkoutWasMax && d.lastTrainedAt != null && now - d.lastTrainedAt <= MAX_TAX_WINDOW_MS) {
      return { factor: 1 - MAX_TAX_CUT, group: g };
    }
  }
  // Fallback: a completed calibration set on a primary muscle within the window.
  for (const record of history) {
    const when = record.completedAt ?? record.plannedFor;
    if (now - when > MAX_TAX_WINDOW_MS) continue;
    for (const perf of record.performed) {
      const trains = perf.primaryAreas.some((a) => a.group != null && primaries.includes(a.group));
      if (trains && perf.sets.some((s) => s.completed && s.isCalibration)) {
        const group = perf.primaryAreas.find((a) => a.group != null && primaries.includes(a.group))?.group;
        return { factor: 1 - MAX_TAX_CUT, group };
      }
    }
  }
  return { factor: 1 };
}

function humanGroup(g?: MuscleGroup): string {
  return g === 'lower_back' ? 'lower back' : (g ?? 'that muscle');
}

/**
 * Finalize a working load against today's readiness, per-muscle fatigue, and
 * recent maxing. Only reduces/holds — the +10% cap upstream is never breached.
 */
export function finalizeLoad(input: LoadFinalizationInput): LoadFinalizationResult {
  const primaries = input.exercise.primaryAreas;
  const readinessFactor = readinessFactorOf(input.readiness);
  const { factor: fatigueFactor, peakGroup } = fatigueFactorOf(primaries, input.fatigue);
  const { factor: maxTaxFactor, group: maxGroup } = maxTaxOf(primaries, input.fatigue, input.history, input.now);
  // ADR-0125: coming back from time off is a "today" adjustment like the rest —
  // reductions only, so it composes here rather than inside progressive overload.
  const layoff = layoffState(input.history, input.now);
  const layoffFactor = layoff.loadFactor;

  const drivers: LoadDrivers = { readinessFactor, fatigueFactor, maxTaxFactor, layoffFactor };
  const weightKg = roundToHalfKg(input.baseWeightKg * readinessFactor * fatigueFactor * maxTaxFactor * layoffFactor);

  if (weightKg >= input.baseWeightKg) {
    return { weightKg: input.baseWeightKg, drivers };
  }

  const reasons: string[] = [];
  if (readinessFactor < 1) reasons.push('how you feel today');
  if (fatigueFactor < 1) reasons.push(`${humanGroup(peakGroup)} fatigue`);
  if (maxTaxFactor < 1) reasons.push(`a recent ${humanGroup(maxGroup)} max`);
  if (layoffFactor < 1 && layoff.note) reasons.push(layoff.note);
  const easedPct = Math.round((1 - weightKg / input.baseWeightKg) * 100);
  const note = `eased ${easedPct}% to ${weightKg} kg — ${reasons.join(' + ')}`;

  return { weightKg, note, drivers };
}
