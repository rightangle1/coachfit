/**
 * Exercise selection scoring (ADR-0126). Pure, deterministic, offline.
 *
 * Replaces the lexicographic comparator selection used to run on. That
 * comparator ranked by emphasis → favorite → prior-work → under-MEV → fatigue,
 * and because the first four keys were booleans, *every* favorite outranked
 * *every* non-favorite, absolutely. With only eleven movement patterns to break
 * ties, an athlete who had favorited one exercise per pattern received the same
 * session indefinitely — and nothing anywhere in the engine penalised an
 * exercise for having been done yesterday.
 *
 * The deeper problem was that a boolean cascade cannot express a trade-off. It
 * has no way to say "a favorite, but I trained it yesterday and its muscle sits
 * at 0.6 fatigue, versus a fresh lift that is under its weekly minimum" — the
 * first flag that differs simply wins. An additive score can, so this is where
 * the trainer-like judgment about *what to train* now lives.
 *
 * Two things this deliberately does NOT do:
 *  - It never touches the safety envelope. Hard exclusions (`hardSafety`, and
 *    `hardFatigue` unless explicitly emphasized) are filters applied by the
 *    caller before anything is scored. Scoring only ever reorders what is
 *    already allowed.
 *  - It does not rotate everything. You cannot run progressive overload on a
 *    lift you meet once a month, so the `anchor` profile deliberately damps
 *    novelty to keep the session's main lifts stable and measurable; only the
 *    `accessory` profile chases variety.
 */

import {
  GROUP_TO_REGION,
  type BodyArea,
  type Exercise,
  type ExerciseDifficulty,
  type ExperienceLevel,
  type MuscleGroup,
  type SessionRecord,
} from '../types';
import { MEV, MRV } from '../metrics';
import { mechanicOf } from './mechanic';
import { matchStrength } from './matching';

/**
 * Term weights. Kept in one table so the engine's taste is auditable and
 * tunable in a single place rather than smeared across comparator branches.
 * Emphasis dominates by design — an explicit ask outranks every heuristic — but
 * it is now a weight rather than an absolute gate, so a wildly fatigued or
 * badly stale exercise can still lose to a sensible alternative.
 */
export const SELECTION_WEIGHTS = {
  EMPHASIS: 100,
  ANCHOR: 30,
  FAVORITE: 25,
  VOLUME_DEFICIT: 20,
  COMPOUND: 8,
  FATIGUE: 40,
  VOLUME_EXCESS: 35,
  RECENCY: 45,
  PATTERN_SATURATION: 30,
  /**
   * Repeating a *variant family* — the same movement at a different angle
   * (ADR-0134). Sits well above PATTERN_SATURATION because it is the specific,
   * actionable version of the same idea: 'push' covers every upper-body press
   * ever invented, so pattern saturation could never distinguish "three pushes"
   * (a legitimate chest day) from "three push-ups" (the plan repeating itself).
   *
   * A penalty and never a filter, on purpose. It competes *within* the
   * emphasized pool, where the +100 emphasis term is constant, so it reorders
   * which chest exercises get picked without ever making chest lose to a muscle
   * group the athlete didn't ask for. When the pool holds only one family —
   * bodyweight-only equipment, or the athlete excluded the alternatives — every
   * candidate takes the same penalty and push-ups still win. Total volume is
   * bounded by the hard per-session ceiling (session-volume.ts), not by this.
   */
  FAMILY_SATURATION: 45,
  ENJOYMENT: 12,
  /**
   * How well an exercise's difficulty tier fits the athlete's experience
   * (ADR-0136). A beginner has no track record to judge "this is worth the
   * technical risk" — a trainer defaults them to the common, foundational
   * catalog and only reaches for a barbell/skill lift when it's the explicit
   * emphasis. An advanced athlete gets the opposite lean: no penalty for
   * staying in beginner-tier accessory work, but a real pull toward the
   * intermediate/advanced catalog they've earned, so selection doesn't keep
   * handing them the same basic movements a beginner would get. Sits below
   * COMPOUND and well below EMPHASIS/ANCHOR — a bias that reorders ties, never
   * a gate: a beginner whose pool is all-advanced (e.g. equipment-limited to
   * one barbell lift) still gets it.
   */
  EXPERIENCE_FIT: 16,
} as const;

/**
 * -1..1 lean toward an exercise's difficulty tier, by athlete experience
 * (ADR-0136). An explicit table, not a formula, so the trainer's taste here
 * stays auditable in one place: steer beginners hard toward beginner-tier
 * (the common, foundational) catalog and away from harder tiers; let advanced
 * athletes range across the deeper catalog without being pulled back toward
 * the basics they've already mastered.
 */
const EXPERIENCE_DIFFICULTY_FIT: Record<ExperienceLevel, Record<ExerciseDifficulty, number>> = {
  beginner: { beginner: 1, intermediate: -0.6, advanced: -1 },
  intermediate: { beginner: 0.3, intermediate: 0.7, advanced: -0.4 },
  advanced: { beginner: 0, intermediate: 0.4, advanced: 0.8 },
};

/** Catalog entries are guaranteed a `difficulty` (`catalog/index.ts`); an
 * unenriched fixture without one is treated as beginner-tier, the common case. */
export function experienceFit(experience: ExperienceLevel, ex: Exercise): number {
  return EXPERIENCE_DIFFICULTY_FIT[experience][ex.difficulty ?? 'beginner'];
}

/** How fast "I just did this" wears off. Five days ≈ half the penalty. */
export const RECENCY_HALF_LIFE_DAYS = 5;

const DAY_MS = 86_400_000;

/**
 * Anchors are the session's measurable lifts: novelty is damped almost to
 * nothing and a known progression baseline is rewarded, so overload has
 * somewhere to accumulate. Accessories are where variety lives. `neutral` is
 * for pools where neither idea applies (warmup drills, cardio, flow stages).
 */
export type SelectionProfile = 'anchor' | 'accessory' | 'neutral';

const PROFILE_SCALE: Record<SelectionProfile, { recency: number; anchor: number; favorite: number; experienceFit: number }> = {
  // ADR-0136: EXPERIENCE_FIT is a catalog-depth/novelty signal like recency —
  // an established anchor lift must not get bumped by a difficulty-tier
  // reshuffle the moment it picks up a routine fatigue penalty. Damped almost
  // to nothing here, same spirit as recency's 0.15.
  anchor: { recency: 0.15, anchor: 1, favorite: 1, experienceFit: 0.2 },
  accessory: { recency: 1, anchor: 0.1, favorite: 0.6, experienceFit: 1 },
  neutral: { recency: 0.6, anchor: 0, favorite: 1, experienceFit: 0.6 },
};

export interface ScoreContext {
  emphasize: BodyArea[];
  favorites: Set<string>;
  /** Drives the EXPERIENCE_FIT term (ADR-0136) — never a filter. */
  experience: ExperienceLevel;
  weeklyVolume: Partial<Record<MuscleGroup, number>>;
  fatigueByGroup: Partial<Record<MuscleGroup, number>>;
  /** exerciseId → when it was last performed. Built once via `lastPerformedIndex`. */
  lastPerformedAt: Map<string, number>;
  /** exerciseIds with completed weighted work — a progression baseline exists. */
  withProgressionBasis: Set<string>;
  /** -1..1 preference learned from session enjoyment, subordinate to intent/safety. */
  enjoymentByExercise?: Map<string, number>;
  /** movementPattern → how many already chosen this block. */
  usedPatterns: Map<string, number>;
  /** variantFamily → how many already chosen this block (ADR-0134). */
  usedFamilies: Map<string, number>;
  now: number;
  profile: SelectionProfile;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build the per-exercise history lookups once per session rather than rescanning
 * history inside every comparison.
 */
export function buildHistoryIndex(history: SessionRecord[]): {
  lastPerformedAt: Map<string, number>;
  withProgressionBasis: Set<string>;
  enjoymentByExercise: Map<string, number>;
} {
  const lastPerformedAt = new Map<string, number>();
  const withProgressionBasis = new Set<string>();
  const enjoymentTotals = new Map<string, { total: number; count: number }>();
  for (const record of history) {
    const when = record.completedAt ?? record.plannedFor;
    for (const performed of record.performed) {
      const done = performed.sets.some((s) => s.completed && !s.skipped);
      if (!done) continue;
      if (record.debrief?.enjoyment != null || record.debrief?.wouldDoAgain != null) {
        const enjoyment = record.debrief.enjoyment != null ? (record.debrief.enjoyment - 3) / 2 : 0;
        const repeat = record.debrief.wouldDoAgain == null ? 0 : record.debrief.wouldDoAgain ? 0.5 : -0.5;
        const prior = enjoymentTotals.get(performed.exerciseId) ?? { total: 0, count: 0 };
        enjoymentTotals.set(performed.exerciseId, { total: prior.total + clamp(enjoyment + repeat, -1, 1), count: prior.count + 1 });
      }
      const previous = lastPerformedAt.get(performed.exerciseId);
      if (previous == null || when > previous) lastPerformedAt.set(performed.exerciseId, when);
      if (performed.sets.some((s) => s.completed && !s.skipped && s.weightKg != null && s.weightKg > 0)) {
        withProgressionBasis.add(performed.exerciseId);
      }
    }
  }
  const enjoymentByExercise = new Map<string, number>();
  for (const [id, value] of enjoymentTotals) enjoymentByExercise.set(id, value.total / value.count);
  return { lastPerformedAt, withProgressionBasis, enjoymentByExercise };
}

/**
 * How strongly an exercise serves the day's emphasis. Graded, unlike the
 * primary-only `emphasizesArea`: emphasize "chest" and a dip (chest secondary)
 * used to score exactly the same as a leg curl — zero. It genuinely is worth
 * less than an incline press, but it is not worth nothing.
 */
export function emphasisStrength(emphasize: BodyArea[], ex: Exercise): number {
  let best = 0;
  for (const area of emphasize) {
    const strength = matchStrength(area, ex);
    if (strength === 'primary') return 1;
    if (strength === 'secondary') best = Math.max(best, 0.5);
    else if (strength === 'joint') best = Math.max(best, 0.25);
  }
  return best;
}

/** Peak fatigue across everything the exercise loads, 0..1. */
function peakFatigue(ex: Exercise, byGroup: Partial<Record<MuscleGroup, number>>): number {
  const groups = [...ex.primaryAreas, ...(ex.secondaryAreas ?? [])];
  return groups.reduce((peak, group) => Math.max(peak, byGroup[group] ?? 0), 0);
}

/**
 * How badly this exercise's muscles still need work this week, 0..1 — graded by
 * deficit rather than the old boolean "is under MEV". On a Friday, rear delts
 * sitting at 4 sets used to rank exactly level with lats at 9; now the emptier
 * group wins, which is what a trainer would actually do.
 */
function volumeDeficit(ex: Exercise, weekly: Partial<Record<MuscleGroup, number>>): number {
  return ex.primaryAreas.reduce(
    (worst, group) => Math.max(worst, clamp((MEV - (weekly[group] ?? 0)) / MEV, 0, 1)),
    0,
  );
}

/** How far past the weekly ceiling this exercise's muscles already are, 0..1. */
function volumeExcess(ex: Exercise, weekly: Partial<Record<MuscleGroup, number>>): number {
  return ex.primaryAreas.reduce(
    (worst, group) => Math.max(worst, clamp(((weekly[group] ?? 0) - MRV) / MRV, 0, 1)),
    0,
  );
}

/** 1 when performed today, decaying by half every `RECENCY_HALF_LIFE_DAYS`. */
function recencyPenalty(ex: Exercise, ctx: ScoreContext): number {
  const last = ctx.lastPerformedAt.get(ex.id);
  if (last == null || last > ctx.now) return 0;
  const days = (ctx.now - last) / DAY_MS;
  return Math.pow(2, -days / RECENCY_HALF_LIFE_DAYS);
}

/** Diminishing returns on repeating a movement pattern already used today. */
function patternSaturation(ex: Exercise, ctx: ScoreContext): number {
  const used = ctx.usedPatterns.get(ex.movementPattern) ?? 0;
  return used === 0 ? 0 : clamp(used / 2, 0, 1);
}

/**
 * Repeating the same movement at a different angle (ADR-0134). Escalates faster
 * than pattern saturation — the second variant of a family is a defensible
 * trainer call (a mechanical drop-set), the fourth is the plan padding itself —
 * and saturates at 1 so it stays a bounded penalty rather than an exclusion.
 * Exercises with no family (never, for catalog entries) take no penalty.
 */
function familySaturation(ex: Exercise, ctx: ScoreContext): number {
  if (!ex.variantFamily) return 0;
  const used = ctx.usedFamilies.get(ex.variantFamily) ?? 0;
  return used === 0 ? 0 : clamp(used * 0.6, 0, 1);
}

/**
 * The additive score. Higher is a better pick. Callers apply hard exclusions
 * first — nothing here can rescue an exercise the safety rules rejected, and
 * nothing here can reject one they allowed.
 */
export function scoreExercise(ex: Exercise, ctx: ScoreContext): number {
  const scale = PROFILE_SCALE[ctx.profile];
  const w = SELECTION_WEIGHTS;

  const anchorBonus = ctx.withProgressionBasis.has(ex.id) ? 1 : 0;
  const favoriteBonus = ctx.favorites.has(ex.id) ? 1 : 0;
  const compoundBonus = mechanicOf(ex) === 'compound' ? 1 : 0;

  return (
    w.EMPHASIS * emphasisStrength(ctx.emphasize, ex) +
    w.ANCHOR * anchorBonus * scale.anchor +
    w.FAVORITE * favoriteBonus * scale.favorite +
    w.VOLUME_DEFICIT * volumeDeficit(ex, ctx.weeklyVolume) +
    w.EXPERIENCE_FIT * experienceFit(ctx.experience, ex) * scale.experienceFit +
    w.COMPOUND * compoundBonus -
    w.FATIGUE * peakFatigue(ex, ctx.fatigueByGroup) -
    w.VOLUME_EXCESS * volumeExcess(ex, ctx.weeklyVolume) -
    w.RECENCY * recencyPenalty(ex, ctx) * scale.recency -
    w.PATTERN_SATURATION * patternSaturation(ex, ctx) -
    w.FAMILY_SATURATION * familySaturation(ex, ctx) +
    w.ENJOYMENT * (ctx.enjoymentByExercise?.get(ex.id) ?? 0)
  );
}

/**
 * Session ordering (ADR-0126): heaviest compound work first, while the athlete
 * is fresh; isolation last. Selection previously left the Main block in
 * whatever order scoring produced — and `pickFullBodySpread` interleaved by
 * region — so a triceps extension could be prescribed before a squat, which no
 * trainer would ever write.
 */
export function orderForSession(
  exercises: Exercise[],
  isTest?: (exerciseId: string) => boolean,
  isPriority?: (exercise: Exercise) => boolean,
): Exercise[] {
  // Test sets go first of all (ADR-0128): an all-out attempt belongs on a fresh
  // athlete, and it must precede the accessories whose zone the within-session
  // cascade adjusted precisely *because* of it.
  const rank = (ex: Exercise) => {
    if (isTest?.(ex.id)) return 0;
    if (isPriority?.(ex)) return 1;
    return mechanicOf(ex) === 'compound' ? 2 : 3;
  };
  const demand = (ex: Exercise) => ex.loadDemand ?? 0;
  return exercises
    .map((ex, index) => ({ ex, index }))
    .sort((a, b) => {
      const byRank = rank(a.ex) - rank(b.ex);
      if (byRank) return byRank;
      const byDemand = demand(b.ex) - demand(a.ex);
      if (byDemand) return byDemand;
      return a.index - b.index; // stable: preserve the selection's own spread
    })
    .map((entry) => entry.ex);
}

/** Region of an exercise's first primary group — used by the full-body spread. */
export function primaryRegionOf(ex: Exercise): string | undefined {
  const group = ex.primaryAreas[0];
  return group ? GROUP_TO_REGION[group] : undefined;
}
