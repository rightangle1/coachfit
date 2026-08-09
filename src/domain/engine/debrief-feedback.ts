/**
 * Debrief → next session (ADR-0126). Pure, deterministic, offline.
 *
 * CLAUDE.md §8.5 says the debrief "feeds the next session". It did not. The
 * engine computed `DebriefResult.newConstraintsSuggested` from the athlete's
 * reported issues, the service dutifully wrote it to the decision log, the
 * screen threw the return value away, and `buildAvoidance` only ever read
 * `avoidToday.flags` and `athlete.constraints`. So "my knee flared up" was
 * recorded, echoed back, logged — and had exactly zero effect on tomorrow
 * unless the athlete remembered to type it in again the next day.
 *
 * The fix needs no new storage. `debrief.issues` is already persisted on every
 * SessionRecord, and the engine already receives history, so the loop closes by
 * *reading* what is already there. A reported issue becomes a real avoidance
 * input for a few days and then fades, which is how a trainer treats "my
 * shoulder was cranky on Tuesday" — you work around it for a while, and you
 * stop working around it once it stops being mentioned.
 */

import type { AvoidanceFlag, BodyArea, SessionRecord } from '../types';

const DAY_MS = 86_400_000;

export const DEBRIEF_FEEDBACK = {
  /** A severe issue is treated as hard avoidance for this long. */
  SEVERE_HARD_DAYS: 3,
  /** Any reported issue keeps de-loading the area it touches for this long. */
  LIMIT_DAYS: 7,
} as const;

export interface DebriefFeedback {
  /** Areas to exclude outright — recent, severe, self-reported problems. */
  hardSafety: BodyArea[];
  /** Areas to keep training but de-load. */
  limit: BodyArea[];
}

function areaKey(area: BodyArea): string {
  return `${area.group ?? ''}|${area.region ?? ''}|${area.joint ?? ''}|${area.side ?? ''}`;
}

function dedupe(areas: BodyArea[]): BodyArea[] {
  const seen = new Set<string>();
  const out: BodyArea[] = [];
  for (const area of areas) {
    const key = areaKey(area);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(area);
  }
  return out;
}

/**
 * Turn recently-reported debrief issues into avoidance inputs for today.
 *
 * Severity is respected but decays with time rather than persisting forever:
 * a severe issue blocks its area for `SEVERE_HARD_DAYS`, then softens to a
 * de-load for the rest of `LIMIT_DAYS`, then disappears. Anything the athlete
 * wants remembered permanently belongs in `AthleteProfile.constraints`, which
 * is a deliberate, explicit choice and is untouched by this.
 */
export function debriefFeedback(history: SessionRecord[], now: number): DebriefFeedback {
  const hardSafety: BodyArea[] = [];
  const limit: BodyArea[] = [];

  for (const record of history) {
    const issues: AvoidanceFlag[] | undefined = record.debrief?.issues;
    if (!issues?.length) continue;
    const when = record.completedAt ?? record.plannedFor;
    if (when > now) continue;
    const days = (now - when) / DAY_MS;
    if (days > DEBRIEF_FEEDBACK.LIMIT_DAYS) continue;

    for (const issue of issues) {
      if (issue.severity === 'severe' && days <= DEBRIEF_FEEDBACK.SEVERE_HARD_DAYS) {
        hardSafety.push(issue.area);
      } else {
        limit.push(issue.area);
      }
    }
  }

  return { hardSafety: dedupe(hardSafety), limit: dedupe(limit) };
}
