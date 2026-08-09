/**
 * How a set presents itself to the athlete (ADR-0128).
 *
 * Pure and UI-free so it can be tested directly — the components that render it
 * pull in native modules (audio, haptics, images) that don't load under Jest.
 */

export interface SetKind {
  reps?: number;
  isWarmup?: boolean;
  isCalibration?: boolean;
  /** The floor an all-out set is asked to beat. */
  prescribedReps?: number;
}

/**
 * What the REPS control is asking for.
 *
 * `5+` on a test set is the whole instruction in two characters: here is the
 * minimum, now find out how many you have. Without it a max-rep set looks
 * identical to any other set and the athlete has no reason to push — which
 * would make the entire zone-testing feature invisible.
 */
export function repsLabelFor(set: SetKind): string {
  // A ramp is never a max attempt, so warm-up wins if somehow both are set.
  if (set.isWarmup) return 'WARM-UP REPS';
  if (set.isCalibration) {
    const floor = set.prescribedReps ?? set.reps;
    return floor != null ? `MAX REPS (${floor}+)` : 'MAX REPS';
  }
  return 'REPS';
}
