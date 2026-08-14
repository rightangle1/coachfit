/**
 * Per-session per-muscle-group volume ceiling (ADR-0134). Pure, deterministic,
 * offline.
 *
 * ADR-0104 gave the engine weekly volume landmarks (MEV/MRV) and nothing else.
 * A weekly ceiling cannot see a single day, so a chest-emphasis session could —
 * and did — prescribe 22 chest sets against a weekly MRV of 16, then report
 * itself as within limits. Two things made that possible:
 *
 *  1. Nothing counted a muscle group's sets *within* the session being built.
 *     `weeklyVolume` is computed once from completed history before selection
 *     runs, so the sets a session is currently allocating were invisible to
 *     every volume rule.
 *  2. The existing over-MRV response trims sets *per exercise* while exercise
 *     *count* is decided separately from session duration. Trimming freed time,
 *     freed time bought more exercises, and total volume went UP while the
 *     rationale announced it was trimming.
 *
 * This module owns the day. It is a **hard constraint** in the CLAUDE.md §7
 * sense: no emphasis setting, workout style, duration request, or live
 * adjustment may exceed it. That is deliberately different from the redundancy
 * penalty in selection-score.ts, which is a graded bias the athlete can
 * override — an all-push-up session stays a legal, reachable outcome; 250 reps
 * of one does not.
 */

import type { BodyArea, Exercise, MuscleGroup, PlannedExercise, PlannedSet, SessionBlock } from '../types';
import type { VolumeLandmarks } from '../metrics';

/**
 * The largest share of a muscle group's weekly ceiling one session may carry.
 *
 * Derived from the weekly landmark rather than picked, so it inherits the
 * experience and resistance-focus adjustments `volumeLandmarksFor` already
 * makes, and moves automatically when those are tuned.
 *
 * Deliberately NOT `mrv / sessionsPerWeek`: training frequency is not reliably
 * known today. `goals.weeklyTargets` is usually unset, and the fallback
 * schedule in rolling-plan.ts's `modalitySchedule` can hand a strength-focused
 * athlete a single strength session per week — which would derive a *higher*
 * daily ceiling than MRV itself. A fixed share of MRV degrades sanely with no
 * frequency data and is the more conservative reading, which is the one
 * safety rules should take.
 */
const DAILY_SHARE_OF_MRV = 0.55;

/** Below this a "capped" session stops being a session; above it, no muscle
 * group tolerates the concentration regardless of how generous MRV looks. */
const ABSOLUTE_MIN_DAILY_SETS = 4;
const ABSOLUTE_MAX_DAILY_SETS = 10;

/**
 * Hard ceiling on working sets for ONE muscle group in ONE session.
 *
 * Counts primary areas at full weight and secondary at
 * `SECONDARY_SET_CREDIT`, matching how fatigue and weekly volume already
 * credit assistance work so all three agree about what a set "cost".
 */
export function dailySetCeiling(landmarks: VolumeLandmarks): number {
  return Math.max(
    ABSOLUTE_MIN_DAILY_SETS,
    Math.min(ABSOLUTE_MAX_DAILY_SETS, Math.round(landmarks.mrv * DAILY_SHARE_OF_MRV)),
  );
}

/**
 * Assistance credit, mirroring `FATIGUE.SECONDARY_CREDIT` (ADR-0102). Kept as
 * its own constant rather than imported: this is a volume-accounting decision,
 * and coupling it to the fatigue model would make tuning one silently retune
 * the other.
 */
export const SECONDARY_SET_CREDIT = 0.4;

/** The muscle groups one exercise loads, split by how much they're credited. */
export interface LoadedGroups {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

function groupsOf(areas: BodyArea[] | undefined): MuscleGroup[] {
  return (areas ?? []).flatMap((area) => (area.group ? [area.group] : []));
}

/** Catalog entry → loaded groups. */
export function loadedGroupsOf(exercise: Exercise): LoadedGroups {
  return { primary: exercise.primaryAreas, secondary: exercise.secondaryAreas ?? [] };
}

/** Planned entry → loaded groups (areas are already persisted on the plan). */
export function loadedGroupsOfPlanned(exercise: PlannedExercise): LoadedGroups {
  return { primary: groupsOf(exercise.primaryAreas), secondary: groupsOf(exercise.secondaryAreas) };
}

/** Sets that count toward volume: real working sets, not ramp or calibration. */
export function isWorkingSet(set: PlannedSet): boolean {
  return !set.isWarmup && !set.isCalibration;
}

export function workingSetCount(exercise: PlannedExercise): number {
  return exercise.sets.filter(isWorkingSet).length;
}

/**
 * Running per-group set tally for a session. Credits primary fully and
 * secondary at `SECONDARY_SET_CREDIT`.
 */
export class SessionVolumeTally {
  private readonly byGroup = new Map<MuscleGroup, number>();

  /** Sets already credited to `group` this session. */
  get(group: MuscleGroup): number {
    return this.byGroup.get(group) ?? 0;
  }

  /**
   * How many of `sets` this exercise may still add before any group it loads
   * would exceed `ceiling`. Returns 0 when the exercise cannot be trained at
   * all today, and never more than `sets`.
   *
   * Primary areas bind first: a chest/triceps press is limited by whichever of
   * chest and triceps has less headroom, because both are genuinely trained.
   */
  headroom(groups: LoadedGroups, sets: number, ceiling: number): number {
    let allowed = sets;
    for (const group of groups.primary) {
      allowed = Math.min(allowed, ceiling - this.get(group));
    }
    for (const group of groups.secondary) {
      allowed = Math.min(allowed, (ceiling - this.get(group)) / SECONDARY_SET_CREDIT);
    }
    // Floored, not rounded: secondary credit is fractional, so a group sitting at
    // 1.2 of a 4-set ceiling leaves 2.8 sets of room — which is two sets, not
    // three. Rounding here would let the ceiling be exceeded by a fraction of a
    // set per exercise, which across a block is a whole set.
    return Math.max(0, Math.floor(Math.min(sets, allowed)));
  }

  /** Which of `groups` are already at or past `ceiling` — for the rationale. */
  atCeiling(groups: LoadedGroups, ceiling: number): MuscleGroup[] {
    return groups.primary.filter((group) => this.get(group) >= ceiling);
  }

  /** Credit `sets` working sets against every group the exercise loads. */
  add(groups: LoadedGroups, sets: number): void {
    for (const group of groups.primary) {
      this.byGroup.set(group, this.get(group) + sets);
    }
    for (const group of groups.secondary) {
      this.byGroup.set(group, this.get(group) + sets * SECONDARY_SET_CREDIT);
    }
  }

  /** Snapshot for the decision log and rationale. */
  snapshot(): Partial<Record<MuscleGroup, number>> {
    return Object.fromEntries([...this.byGroup].map(([group, sets]) => [group, Math.round(sets * 10) / 10]));
  }
}

/**
 * Build a tally from already-planned blocks — used by the duration balancer,
 * which runs after Main is assembled and must not pad a capped group back up.
 */
export function tallyOf(blocks: SessionBlock[], countsToward: (block: SessionBlock) => boolean): SessionVolumeTally {
  const tally = new SessionVolumeTally();
  for (const block of blocks) {
    if (!countsToward(block)) continue;
    for (const exercise of block.exercises) {
      tally.add(loadedGroupsOfPlanned(exercise), workingSetCount(exercise));
    }
  }
  return tally;
}

export interface VolumeAllocation {
  /** exerciseId → working sets it may carry. Absent or 0 means dropped. */
  allowance: Map<string, number>;
  /** Groups whose ceiling actually bound — i.e. the ones to explain. */
  boundGroups: MuscleGroup[];
  /** exerciseIds the ceiling removed because no real set block would fit. */
  dropped: string[];
}

/**
 * Share the day's ceiling across the exercises that want it (ADR-0134).
 *
 * The obvious implementation — walk the block and let each exercise take its
 * full prescription until the ceiling runs out — is wrong, and visibly so: on a
 * chest day with a 9-set ceiling it gave the first two lifts 5 and 4 sets and
 * dropped the remaining three, producing a two-exercise session out of a block
 * the selector had deliberately spread across five different movements. A
 * trainer with 9 chest sets to spend writes three exercises of three, not two of
 * five.
 *
 * So allocation happens in two passes. The first reserves a real set block
 * (ADR-0120) for as many exercises as the ceiling can support, in priority
 * order; the second tops those up toward their full prescription with whatever
 * is left. Exercises that cannot get a real block are dropped outright rather
 * than rendered as one-set stubs.
 *
 * Priority order is the caller's: `main` arrives sorted with tests first, then
 * compounds, emphasized work ahead of filler. So when the ceiling forces a
 * choice, what survives is what matters most.
 */
export function allocateDailyVolume(
  exercises: { id: string; groups: LoadedGroups }[],
  ceiling: number,
  requested: (id: string) => number,
  minimumBlock: number,
): VolumeAllocation {
  const tally = new SessionVolumeTally();
  const allowance = new Map<string, number>();
  const bound = new Set<MuscleGroup>();
  const dropped: string[] = [];

  for (const exercise of exercises) {
    const want = Math.max(1, Math.min(requested(exercise.id), minimumBlock));
    const granted = tally.headroom(exercise.groups, want, ceiling);
    if (granted < want) {
      dropped.push(exercise.id);
      allowance.set(exercise.id, 0);
      for (const group of exercise.groups.primary) {
        if (tally.get(group) + want > ceiling) bound.add(group);
      }
      continue;
    }
    allowance.set(exercise.id, granted);
    tally.add(exercise.groups, granted);
  }

  for (const exercise of exercises) {
    const current = allowance.get(exercise.id) ?? 0;
    if (current <= 0) continue;
    const extra = requested(exercise.id) - current;
    if (extra <= 0) continue;
    const granted = tally.headroom(exercise.groups, extra, ceiling);
    if (granted < extra) {
      for (const group of exercise.groups.primary) {
        if (tally.get(group) + extra > ceiling) bound.add(group);
      }
    }
    if (granted <= 0) continue;
    allowance.set(exercise.id, current + granted);
    tally.add(exercise.groups, granted);
  }

  return { allowance, boundGroups: [...bound], dropped };
}

/**
 * Drop working sets from the end until only `allowed` remain, preserving ramp
 * and calibration sets (those are warm-up structure, not volume — ADR-0128).
 */
export function trimToWorkingSets(sets: PlannedSet[], allowed: number): PlannedSet[] {
  let excess = sets.filter(isWorkingSet).length - allowed;
  if (excess <= 0) return sets;
  const kept: PlannedSet[] = [];
  for (let i = sets.length - 1; i >= 0; i--) {
    const set = sets[i];
    if (excess > 0 && isWorkingSet(set)) {
      excess--;
      continue;
    }
    kept.unshift(set);
  }
  return kept;
}
