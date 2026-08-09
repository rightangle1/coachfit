/**
 * Readiness scaling (ADR-0107). Pure, deterministic, offline.
 *
 * Grades each self-reported readiness signal (sleep, soreness, energy) by
 * threshold band and sums the penalties, rather than collapsing to a single
 * binary "poor day" flag — one mildly-off signal trims a little, several
 * genuinely bad signals trim a lot more. Shared by both axes readiness moves:
 * load (`load-finalization.ts`'s `readinessFactorOf`, ADR-0122 — the proven,
 * already-shipped pattern this reuses) and volume/reps (`rules-engine.ts`'s
 * `readinessScale`). Never raises anything — a good day is earned through
 * performance (ADR-0103), not a self-report.
 */

import type { ReadinessInput } from '../types';

/**
 * Per-signal penalty bands. Raw and additive (not capped here) — the caller's
 * `maxCut` decides how much of this can actually move its axis.
 *
 * These are calibrated against the values the prebrief ACTUALLY emits
 * (sleep/energy ∈ {2,3,4}, soreness ∈ {1,3,4}), which the original bands were
 * not: the worst day a user could report summed to 0.08 against bands designed
 * around 0.14, so roughly half the intended response was unreachable and the
 * grimmest possible check-in cost only ~8% of the session's reps.
 *
 * A value of 3 ("Okay") is neutral by design, and 4 ("Great") is deliberately
 * identical to it — readiness never *raises* anything (ADR-0103: a good day is
 * earned through performance, not self-report). The gradations all live below
 * neutral, which is where they matter.
 */
function gradedPenalty(r: ReadinessInput): number {
  let penalty = 0;
  if (r.energy != null) penalty += r.energy <= 1 ? 0.07 : r.energy === 2 ? 0.05 : 0;
  if (r.soreness != null) penalty += r.soreness >= 5 ? 0.07 : r.soreness === 4 ? 0.05 : r.soreness === 3 ? 0.02 : 0;
  if (r.sleepQuality != null) penalty += r.sleepQuality <= 1 ? 0.06 : r.sleepQuality === 2 ? 0.04 : 0;
  return penalty;
}

/**
 * The penalty at which a trainer would stop scaling the session down and
 * instead suggest making it a recovery day. Reachable from the prebrief: it
 * takes genuinely bad answers on more than one signal, not one grumpy tap.
 */
export const RECOVERY_SUGGESTION_PENALTY = 0.12;

/**
 * True when today's self-report is bad enough that a lighter *kind* of session
 * — not merely a lighter version of this one — is the honest recommendation.
 * This is surfaced as a suggestion in the plan's rationale; it deliberately
 * does not silently rewrite the athlete's chosen workout.
 */
export function readinessSuggestsRecovery(r: ReadinessInput): boolean {
  return gradedPenalty(r) >= RECOVERY_SUGGESTION_PENALTY;
}

/**
 * Graded readiness → multiplicative factor in [1 - maxCut, 1]. Never raises.
 * `maxCut` is axis-specific: the load axis (ADR-0122) caps at a small ~10%
 * (weight is otherwise earned via performance, ADR-0103) with `scale: 1`
 * (exactly its original numbers). The volume/reps axis (ADR-0107) allows a
 * deeper cut and a steeper `scale`, since "how the day feels" is exactly the
 * signal reps/holds are meant to carry.
 */
export function readinessFactor(r: ReadinessInput, maxCut: number, scale = 1): number {
  return 1 - Math.min(maxCut, gradedPenalty(r) * scale);
}
