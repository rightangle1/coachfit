/**
 * Return-to-training ramp (ADR-0125). Pure, deterministic, offline.
 *
 * The engine used to have no concept of time away at all: `lastTopSet` walks
 * history back with no recency bound, so an athlete returning after six weeks
 * off was prescribed the exact load they last lifted, at full volume. Every
 * trainer eases someone back in — not mainly because strength decays (over a few
 * weeks it barely does), but because connective tissue and work capacity fall
 * off faster than strength, and a full-volume first session back is how people
 * get hurt or wrecked for a week.
 *
 * So the ramp cuts volume harder than load, and it fades over the first couple
 * of sessions back rather than snapping to normal the moment one session is
 * logged.
 */

import type { SessionRecord } from '../types';

const DAY_MS = 86_400_000;

export const LAYOFF = {
  /** Below this a gap is just rest days — a normal week has these. */
  GRACE_DAYS: 10,
  /** Beyond this, treat the layoff as fully detrained; the ramp stops deepening. */
  MAX_DAYS: 60,
  /** Deepest cut a layoff may impose on load... */
  MAX_LOAD_CUT: 0.25,
  /** ...and on volume, which falls off faster and matters more on day one back. */
  MAX_VOLUME_CUT: 0.35,
} as const;

export interface LayoffState {
  /** Days since the athlete's last completed session. */
  daysSinceLastSession?: number;
  /** The gap being ramped back from (may predate the last session). */
  gapDays?: number;
  /** Multiplicative, ≤ 1. Never raises. */
  loadFactor: number;
  volumeFactor: number;
  /** Human explanation when the ramp is active. */
  note?: string;
}

const NONE: LayoffState = { loadFactor: 1, volumeFactor: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * How deep into the layoff curve a gap sits, 0..1. Square-rooted so the early
 * weeks — where the practical risk actually is — move the ramp meaningfully
 * instead of the curve staying nearly flat until a gap is enormous. A 3-week
 * gap should feel like a real re-entry, not a rounding error.
 */
function severity(gapDays: number): number {
  const span = LAYOFF.MAX_DAYS - LAYOFF.GRACE_DAYS;
  return Math.sqrt(clamp((gapDays - LAYOFF.GRACE_DAYS) / span, 0, 1));
}

function describe(gapDays: number, easing: boolean): string {
  const weeks = Math.round(gapDays / 7);
  const away = weeks >= 2 ? `${weeks} weeks` : `${Math.round(gapDays)} days`;
  return easing
    ? `still easing back in after ${away} off`
    : `first session back after ${away} off — easing in`;
}

/**
 * The active return-to-training ramp, if any.
 *
 * The ramp keys off the most recent gap longer than `GRACE_DAYS`, and fades by
 * how many sessions have been completed since it: the first session back gets
 * the full ramp, the second gets half, and by the third the athlete is simply
 * training again.
 */
export function layoffState(history: SessionRecord[], now: number): LayoffState {
  const completed = history
    .filter((r): r is SessionRecord & { completedAt: number } => r.completedAt != null && r.completedAt <= now)
    .sort((a, b) => b.completedAt - a.completedAt);

  // A brand-new athlete has no layoff — they have no baseline to ramp back to.
  if (!completed.length) return NONE;

  const daysSinceLastSession = (now - completed[0].completedAt) / DAY_MS;

  let gapDays = daysSinceLastSession;
  let sessionsSince = 0;

  if (gapDays <= LAYOFF.GRACE_DAYS) {
    // They trained recently — but they may still be working back from a gap a
    // session or two ago. Find the most recent one.
    let found = false;
    for (let i = 0; i < completed.length - 1; i++) {
      const gap = (completed[i].completedAt - completed[i + 1].completedAt) / DAY_MS;
      if (gap > LAYOFF.GRACE_DAYS) {
        gapDays = gap;
        sessionsSince = i + 1;
        found = true;
        break;
      }
    }
    if (!found) return { ...NONE, daysSinceLastSession };
  }

  // Full ramp on the first session back, half on the second, done by the third.
  const attenuation = sessionsSince === 0 ? 1 : sessionsSince === 1 ? 0.5 : 0;
  if (attenuation === 0) return { ...NONE, daysSinceLastSession };

  const depth = severity(gapDays) * attenuation;
  return {
    daysSinceLastSession,
    gapDays,
    loadFactor: 1 - LAYOFF.MAX_LOAD_CUT * depth,
    volumeFactor: 1 - LAYOFF.MAX_VOLUME_CUT * depth,
    note: describe(gapDays, sessionsSince > 0),
  };
}
