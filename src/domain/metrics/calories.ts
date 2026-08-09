/**
 * Calorie estimation (ADR-0201 v1). Pure, MET-based. Rough by design — this is
 * an estimate until HR/wearable data lands (CLAUDE.md §10), not a lab figure.
 */

import { EXERCISES } from '../catalog';
import { ageYearsOf, type AthleteProfile, type BiologicalSex, type Modality, type SessionRecord } from '../types';

const SECONDS_PER_REP = 3;
const DEFAULT_BODYWEIGHT_KG = 70;

/** Tier fallback MET values (ADR-0201). Used when an exercise has no
 * researched `metValue` of its own (ADR-0123) — exported so intensity.ts can
 * reuse the same cardio tier constants instead of duplicating them. */
export const MET_BY_TIER: Record<'mobility' | 'strength' | 'core' | 'cardio_steady' | 'cardio_interval', number> = {
  mobility: 2.5,
  strength: 5.0,
  core: 3.8,
  cardio_steady: 7.0,
  cardio_interval: 8.5,
};

function metFor(exerciseId: string, modality: Modality): number {
  const ex = EXERCISES.find((e) => e.id === exerciseId);
  if (ex?.metValue != null) return ex.metValue;
  if (modality === 'mobility') return MET_BY_TIER.mobility;
  if (modality === 'cardio') {
    return ex?.movementPattern === 'interval' ? MET_BY_TIER.cardio_interval : MET_BY_TIER.cardio_steady;
  }
  if (ex?.movementPattern === 'core') return MET_BY_TIER.core;
  return MET_BY_TIER.strength;
}

export function setSeconds(set: { durationSec?: number; reps?: number }): number {
  if (set.durationSec != null) return set.durationSec;
  if (set.reps != null) return set.reps * SECONDS_PER_REP;
  return 0;
}

export interface CalorieEstimate {
  totalKcal: number;
  byModality: Partial<Record<Modality, number>>;
}

/**
 * Optional body data for the BMR-adjusted estimate (ADR-0127).
 *
 * METRICS ONLY. `sex` and `heightCm` exist purely to make this formula work and
 * are deliberately barred from the programming engine — the engine already
 * measures the individual through logged loads and RPE, and the strength metric
 * is self-relative, so a population prior on top of that would be a downgrade.
 */
export interface BodyProfile {
  bodyweightKg?: number;
  heightCm?: number;
  ageYears?: number;
  sex?: BiologicalSex;
}

/**
 * Mifflin–St Jeor resting metabolic rate, kcal/day.
 *
 * `MET × kg × h` implicitly assumes everyone's resting metabolism scales with
 * bodyweight alone. That is a decent first approximation and a poor second one:
 * two people at the same weight but different height, age, and sex have
 * measurably different resting expenditure. The sex-neutral constant is the
 * midpoint of the male (+5) and female (−161) offsets, so declining to answer
 * gives a sensible average rather than silently assuming a default person.
 */
export function mifflinStJeorRmr(profile: BodyProfile): number | undefined {
  const { bodyweightKg, heightCm, ageYears, sex } = profile;
  if (bodyweightKg == null || heightCm == null || ageYears == null) return undefined;
  if (bodyweightKg <= 0 || heightCm <= 0 || ageYears <= 0) return undefined;
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * bodyweightKg + 6.25 * heightCm - 5 * ageYears + offset;
}

/**
 * How much to scale the MET estimate to reflect this person's resting
 * metabolism rather than the 1 MET ≈ 1 kcal/kg/h population average the MET
 * scale is defined against. Returns 1 whenever the body data is incomplete, so
 * an athlete who skipped those questions gets exactly today's behavior.
 */
function bmrAdjustment(profile: BodyProfile): number {
  const rmr = mifflinStJeorRmr(profile);
  const weight = profile.bodyweightKg;
  if (rmr == null || weight == null || weight <= 0) return 1;
  // 1 MET is defined as ~1 kcal per kg per hour; compare this person's actual
  // resting rate against that assumption.
  const impliedRmr = weight * 24;
  const ratio = rmr / impliedRmr;
  // Clamped: this refines an estimate, it does not licence extreme numbers.
  return Math.max(0.8, Math.min(1.2, ratio));
}

export function estimateSessionCalories(
  record: SessionRecord,
  bodyweightKgOrProfile: number | BodyProfile = DEFAULT_BODYWEIGHT_KG,
): CalorieEstimate {
  const profile: BodyProfile =
    typeof bodyweightKgOrProfile === 'number'
      ? { bodyweightKg: bodyweightKgOrProfile }
      : bodyweightKgOrProfile;
  const bodyweightKg = profile.bodyweightKg ?? DEFAULT_BODYWEIGHT_KG;
  const adjustment = bmrAdjustment({ ...profile, bodyweightKg });
  const byModality: Partial<Record<Modality, number>> = {};

  for (const ex of record.performed) {
    const catalogEntry = EXERCISES.find((e) => e.id === ex.exerciseId);
    const modality: Modality = catalogEntry?.modality ?? 'general';
    const met = metFor(ex.exerciseId, modality);

    const seconds = ex.sets
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + setSeconds(s), 0);
    const hours = seconds / 3600;
    const kcal = met * bodyweightKg * hours * adjustment;

    byModality[modality] = (byModality[modality] ?? 0) + kcal;
  }

  const totalKcal = Object.values(byModality).reduce((a, b) => a + (b ?? 0), 0);
  return { totalKcal: Math.round(totalKcal), byModality };
}

/**
 * The metrics-only view of an athlete (ADR-0127). One place converts the
 * profile into calorie inputs, so call sites never reach for `sex`/`heightCm`
 * themselves and the engine boundary stays easy to see.
 */
export function bodyProfileOf(
  athlete: Partial<Pick<AthleteProfile, 'bodyweightKg' | 'heightCm' | 'birthYear' | 'sex'>> | null | undefined,
  now: number = Date.now(),
): BodyProfile {
  if (!athlete) return {};
  return {
    bodyweightKg: athlete.bodyweightKg,
    heightCm: athlete.heightCm,
    ageYears: ageYearsOf(athlete, now),
    sex: athlete.sex,
  };
}
