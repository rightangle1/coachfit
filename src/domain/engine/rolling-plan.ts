/**
 * The weekly programming layer (ADR-0142) — a rolling, day-level forecast
 * (workout/rest, modality, cardio format, focus areas — no exercises/
 * weights) over the next several days. `RulesEngine.generateSession` reads
 * today's entry as a DEFAULT baseline (`SessionContext.weeklyPlan`), never a
 * mandate: an explicit user choice or a routine always overrides it, exactly
 * like `ADR-0105 v2`'s `weeklyTargets` cadence override already works.
 *
 * Trainer nuance here comes from projecting the same fatigue-decay model
 * `deriveFatigueFromHistory` uses (fatigue.ts) forward in time, not from
 * re-deriving a new heuristic — and critically, that projection is
 * *cumulative across the forecast itself*: a muscle group prioritized on day
 * 1 registers as more fatigued going into day 2, exactly like a completed
 * session would. Without that, every day independently re-asks "what's
 * freshest right now?", gets the same answer every time, and produces the
 * same two muscles for the entire week. Cardio format (`cardioIntentFor`)
 * gets the same treatment: it varies across the week and never repeats
 * `'interval'` on consecutive cardio days, rather than defaulting to
 * `'basic'` every time.
 *
 * "Rolling" is deliberate, not a naming leftover: this forecast rolls across
 * week boundaries instead of resetting every Monday, persisted via
 * `services/rolling-plan.ts`. It is UI-facing (the "Weekly Plan" card) AND
 * now the daily engine's real weekly input — the two roles converged when
 * `weekly-program.ts`'s separate, largely-unread six-week schedule was
 * retired in favor of this module (ADR-0142).
 */

import { ALL_MUSCLE_GROUPS, ageYearsOf } from '../types';
import type {
  CardioIntent,
  ExperienceLevel,
  Modality,
  ModalityWeights,
  MuscleGroup,
  RollingPlan,
  RollingPlanDay,
  SessionContext,
} from '../types';
import { FATIGUE, ageRecoveryFactor } from './fatigue';
// Type-only — erased at compile time, so this doesn't pull systemic-load.ts's
// runtime dependency chain (which touches the catalog via the metrics
// barrel) into this deliberately catalog-free module (ADR-0003). The caller
// (services/rolling-plan.ts, which already touches the catalog) computes the
// real value and passes it in, mirroring the existing `fixedDays` pattern.
import type { SystemicState } from './systemic-load';

/**
 * The week's modality mix — either the athlete's explicit per-modality
 * session-count targets (ADR-0105 v2), expanded directly into a schedule, or
 * a weight-PROPORTIONAL apportionment when no explicit targets are set
 * (ADR-0142 v2) — a goal weighted 60% cardio should actually produce mostly
 * cardio sessions, not the same count as a modality weighted 10%. Moved here
 * from the now-retired `weekly-program.ts` (ADR-0142) — this is the only
 * consumer left; `anchors.ts` needed its own, narrower slot-rotation helper
 * (`slotsFor`), which stayed catalog-adjacent rather than moving here, to
 * keep this module free of any catalog dependency (ADR-0003). The returned
 * sequence is grouped by modality, not pre-interleaved — `buildRollingPlan`
 * always runs it through `interleaveModalities` afterward, which is what
 * actually spaces same-modality sessions apart.
 */
export function modalitySchedule(context: SessionContext, count: number): Modality[] {
  const explicit = context.goals.weeklyTargets;
  if (explicit && Object.values(explicit).some((value) => (value ?? 0) > 0)) {
    return (Object.entries(explicit) as [Modality, number][])
      .flatMap(([modality, target]) => Array.from({ length: target }, () => modality))
      .slice(0, count);
  }
  const weighted = (Object.entries(context.goals.weights) as [Modality, number][]).filter(([, weight]) => weight > 0);
  const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  if (!weighted.length || totalWeight <= 0) return [];
  // Largest-remainder apportionment: each modality's exact proportional share
  // of `count` is floored, then leftover slots (from the flooring) go to
  // whichever modality's fractional remainder was largest — the standard way
  // to divide a whole number of seats proportionally without any one
  // modality's count silently rounding to zero when it shouldn't.
  const shares = weighted
    .map(([modality, weight]) => {
      const exact = (weight / totalWeight) * count;
      return { modality, base: Math.floor(exact), remainder: exact - Math.floor(exact) };
    })
    .sort((a, b) => b.remainder - a.remainder);
  let allocated = shares.reduce((sum, share) => sum + share.base, 0);
  for (let i = 0; allocated < count; i += 1, allocated += 1) {
    shares[i % shares.length].base += 1;
  }
  return shares.flatMap((share) => Array.from({ length: share.base }, () => share.modality));
}

/** What a normal week (`modalitySchedule` at the athlete's expected weekly
 * session count) would have contained, minus what was actually completed in
 * the trailing window — restricted to modalities that fell behind (never
 * negative). Feeds `owedCatchUpBias` below (item 5, ADR-0142 v4). */
function deficitByModality(
  expectedSchedule: Modality[],
  done: Partial<Record<Modality, number>>,
): Partial<Record<Modality, number>> {
  const expectedCounts: Partial<Record<Modality, number>> = {};
  for (const modality of expectedSchedule) expectedCounts[modality] = (expectedCounts[modality] ?? 0) + 1;
  const out: Partial<Record<Modality, number>> = {};
  for (const [modality, count] of Object.entries(expectedCounts) as [Modality, number][]) {
    const deficit = count - (done[modality] ?? 0);
    if (deficit > 0) out[modality] = deficit;
  }
  return out;
}

/**
 * Item 5 (ADR-0142 v4): bias — never force — the `owed` catch-up slots
 * toward whichever modality(ies) actually fell behind, weighted by how
 * central that modality already is to the athlete's stated goals
 * (largest-remainder, the same apportionment `modalitySchedule` already
 * uses). Explicit product guidance this implements literally: don't
 * over-anchor on a missed day, but don't ignore it either — a low-weight
 * goal's miss barely moves the needle, a high-weight goal's miss gets real
 * priority. Each modality is capped at its OWN deficit, so a single missed
 * session can never eat every owed slot regardless of its goal weight.
 */
function owedCatchUpBias(
  owed: number,
  deficits: Partial<Record<Modality, number>>,
  weights: ModalityWeights,
): Modality[] {
  const entries = Object.entries(deficits) as [Modality, number][];
  const totalWeight = entries.reduce((sum, [modality]) => sum + (weights[modality] ?? 0), 0);
  if (owed <= 0 || !entries.length || totalWeight <= 0) return [];
  const shares = entries
    .map(([modality, deficit]) => {
      const exact = ((weights[modality] ?? 0) / totalWeight) * owed;
      return { modality, deficit, base: Math.min(deficit, Math.floor(exact)), remainder: exact - Math.floor(exact) };
    })
    .sort((a, b) => b.remainder - a.remainder);
  let allocated = shares.reduce((sum, share) => sum + share.base, 0);
  for (let i = 0; allocated < owed && shares.some((share) => share.base < share.deficit); i = (i + 1) % shares.length) {
    if (shares[i].base < shares[i].deficit) {
      shares[i].base += 1;
      allocated += 1;
    }
  }
  return shares.flatMap((share) => Array.from({ length: share.base }, () => share.modality));
}

/** Local duplicate of rules-engine.ts's `dominantMainModality` — kept
 * separate rather than imported so this catalog-free module doesn't take on
 * the daily engine's much larger surface for one self-contained calculation.
 * 'general' is now a real, catalog-backed modality in its own right, so this
 * is a plain 4-way argmax, same tie-break order as rules-engine.ts's copy. */
const MODALITY_PRIORITY: Modality[] = ['cardio', 'mobility', 'general', 'strength'];
function dominantModalityOf(weights: ModalityWeights): Modality {
  const best = Math.max(weights.strength, weights.cardio, weights.mobility, weights.general);
  return MODALITY_PRIORITY.find((m) => weights[m] === best) ?? 'strength';
}

/**
 * Default weekly session count when the athlete hasn't set an explicit
 * `weeklyTotalTarget` (onboarding's stepper defaults to 0, and the copy
 * invites leaving it there — "Set 0 to let your coach balance this
 * automatically" — with no validation against a zero submission).
 * Replaces a flat `3` for everyone with a small table keyed by experience x
 * dominant goal modality, matching `volumeLandmarksFor`'s
 * experienceBase/focusShift pattern (domain/metrics/volume.ts). Grounded in
 * ordinary trainer cadence norms, not periodization — still clamped to [1,7]
 * by the caller exactly like an explicit total already is.
 */
const DEFAULT_WEEKLY_FREQUENCY: Record<ExperienceLevel, Record<Modality, number>> = {
  beginner: { strength: 3, cardio: 3, mobility: 3, general: 3 },
  intermediate: { strength: 4, cardio: 4, mobility: 3, general: 4 },
  advanced: { strength: 5, cardio: 5, mobility: 3, general: 4 },
};
// beginner: 3x/week across the board — full recovery between sessions while
//   learning movements, and the cadence most likely to stick for a new exerciser.
// intermediate/advanced strength & cardio scale up with grown recoverable
//   capacity (4- and 5-day splits are ordinary at those tiers).
// mobility deliberately does NOT scale up with experience — growing recovery
//   capacity is not the lever that argues for more stretch days; an athlete
//   who wants more sets an explicit weeklyTarget instead.
//
// Deliberately excluded from this first pass: a second axis on
// `resistanceFocus` (the way volumeLandmarksFor's focusShift further adjusts
// set volume) — a real refinement, but more than a first table needs.

export function defaultWeeklyFrequencyFor(experience: ExperienceLevel, weights: ModalityWeights): number {
  return DEFAULT_WEEKLY_FREQUENCY[experience][dominantModalityOf(weights)];
}

const DAY_MS = 86_400_000;

/** A forecasted session's assumed contribution to a prioritized muscle's
 * fatigue — deliberately coarse (this is a day-level forecast, not a
 * prescribed session), but large enough that the same muscle isn't picked
 * again the very next day, matching FATIGUE.RECOVERING's threshold. */
const FORECAST_SESSION_IMPULSE = 0.45;

function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Re-orders a grouped modality sequence (e.g. strength,strength,strength,
 * cardio,cardio,mobility from explicit weekly targets) into an evenly
 * interleaved one (strength,cardio,strength,cardio,strength,mobility) via
 * weighted round-robin, so a 6-session week doesn't read as three strength
 * days in a row. Ties are broken by avoiding an immediate repeat of the
 * previous pick, then by the modality's original priority order.
 */
function interleaveModalities(schedule: Modality[]): Modality[] {
  const order: Modality[] = [];
  const counts = new Map<Modality, number>();
  for (const modality of schedule) {
    if (!counts.has(modality)) order.push(modality);
    counts.set(modality, (counts.get(modality) ?? 0) + 1);
  }
  const progress = new Map<Modality, number>(order.map((modality) => [modality, 0]));
  const result: Modality[] = [];

  for (let i = 0; i < schedule.length; i += 1) {
    let candidates: Modality[] = [];
    let bestRatio = Infinity;
    for (const modality of order) {
      const count = counts.get(modality) ?? 0;
      const done = progress.get(modality) ?? 0;
      if (done >= count) continue;
      const ratio = (done + 1) / count;
      if (ratio < bestRatio - 1e-9) {
        bestRatio = ratio;
        candidates = [modality];
      } else if (Math.abs(ratio - bestRatio) < 1e-9) {
        candidates.push(modality);
      }
    }
    if (candidates.length === 0) break;
    const previous = result[result.length - 1];
    const pick = candidates.find((modality) => modality !== previous) ?? candidates[0];
    result.push(pick);
    progress.set(pick, (progress.get(pick) ?? 0) + 1);
  }
  return result;
}

/** Projects a muscle group's fatigue score forward across an elapsed gap
 * (hours) with no further training — the same decay curve
 * `deriveFatigueFromHistory` applies retroactively, just run forward. */
function decay(byGroup: Map<MuscleGroup, number>, hours: number, ageFactor: number): void {
  if (hours <= 0) return;
  const halfLife = FATIGUE.NORMAL_HALF_LIFE_HOURS * ageFactor;
  const factor = Math.pow(2, -hours / halfLife);
  for (const [group, score] of byGroup) byGroup.set(group, score * factor);
}

function priorityMusclesFor(
  context: SessionContext,
  runningFatigue: Map<MuscleGroup, number>,
  isToday: boolean,
): MuscleGroup[] {
  const emphasize = context.targeting.emphasize
    .map((area) => area.group)
    .filter((group): group is MuscleGroup => group != null);
  if (emphasize.length > 0) return emphasize.slice(0, 2);

  // Today's "anything bothering you?" flags can only speak to today — future
  // soreness isn't knowable, so they bias just this one day (ADR-0106 nuance).
  const todayAvoidance = isToday
    ? context.avoidToday.flags.map((flag) => flag.area.group).filter((g): g is MuscleGroup => g != null)
    : [];
  const avoided = new Set<MuscleGroup>([
    ...context.targeting.avoid.map((area) => area.group).filter((g): g is MuscleGroup => g != null),
    ...context.athlete.constraints
      .filter((constraint) => constraint.severity === 'avoid')
      .map((constraint) => constraint.area.group)
      .filter((g): g is MuscleGroup => g != null),
    ...todayAvoidance,
  ]);

  return ALL_MUSCLE_GROUPS
    .filter((group) => !avoided.has(group))
    .map((group) => ({ group, projected: runningFatigue.get(group) ?? 0 }))
    .sort((a, b) => a.projected - b.projected)
    .slice(0, 2)
    .map((entry) => entry.group);
}

/**
 * Which cardio format (ADR-0143 basic/circuit/interval) today's forecasted
 * cardio day proposes. Varies across the week instead of implicitly
 * defaulting to 'basic' every time, and specifically never lets 'interval'
 * repeat on consecutive cardio days — two high-intensity interval days back
 * to back is exactly the kind of thing a trainer spaces out.
 * `previousCardioIntent` is the last cardio day's resolved format seen so
 * far in the same forward walk `decay()` already does; the caller resets it
 * to `undefined` after a fixed/routine day whose real format isn't known
 * here (see `FixedForecastDay`), so the rotation conservatively restarts
 * from 'basic' rather than guessing through an unknown — NOTE: with a
 * standing `preferred` lean set, that reset now re-proposes `preferred`
 * immediately on the next algorithmic day rather than always falling back to
 * 'basic' first, so a fixed interval-structured day followed by an
 * algorithmic one can in principle land two real interval days close
 * together — accepted trainer-nuance spacing, not one of CLAUDE.md's hard
 * safety caps.
 *
 * `preferred` (a goal preset's or the athlete's own standing cardio-format
 * lean, `AthleteProfile.preferredCardioIntent`) biases the rotation toward
 * itself roughly every other cardio day, using the *unbiased* rotation above
 * as its own "vary" step so the days between still rotate rather than
 * flip-flopping between only two values. Unset `preferred` reproduces the
 * unbiased rotation byte-for-byte. The interval no-repeat guard applies
 * identically either way.
 */
function cardioIntentFor(
  previousCardioIntent: CardioIntent | undefined,
  preferred?: CardioIntent,
): CardioIntent {
  const unbiasedNext = (previous: CardioIntent | undefined): CardioIntent => {
    if (previous === 'interval') return 'circuit'; // never stack two interval days
    if (previous === 'circuit') return 'interval';
    if (previous === 'basic') return 'circuit';
    return 'basic'; // first cardio day seen in this forecast (or after an unknown-format day)
  };
  const clampInterval = (candidate: CardioIntent): CardioIntent =>
    previousCardioIntent === 'interval' && candidate === 'interval' ? 'circuit' : candidate;

  if (!preferred) return clampInterval(unbiasedNext(previousCardioIntent));
  const candidate = previousCardioIntent === preferred ? unbiasedNext(previousCardioIntent) : preferred;
  return clampInterval(candidate);
}

/**
 * A day already fixed by a user-authored routine (ADR-0137) — either
 * explicitly scheduled (`AthleteProfile.scheduledWorkouts`) or recurring
 * (`Routine.recurrenceDaysOfWeek`) — resolved by the CALLER (typically
 * `services/rolling-plan.ts`, which is allowed to touch the catalog; this
 * module deliberately isn't, matching `timing.ts`'s "callers pass the
 * resolved value" leaf-module convention, ADR-0003) and passed in so the
 * forecast doesn't waste an algorithmic slot proposing a conflicting day, and
 * so its fatigue contribution is still projected forward for later days.
 * Deliberately day-level only, matching this module's own "no exercises"
 * scope: a routine's precise cardio format isn't resolved here (see
 * `cardioIntentFor`'s handling of the day after one of these).
 */
export interface FixedForecastDay {
  /** localDay-anchored (noon) epoch ms — matches `RollingPlanDay.date`. */
  date: number;
  modality: Modality;
  priorityMuscles?: MuscleGroup[];
}

function rationaleFor(days: RollingPlanDay[]): string {
  const workoutDays = days.filter((day) => day.kind === 'workout');
  const counts = new Map<string, number>();
  for (const day of workoutDays) {
    const key = day.modality ?? 'strength';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([modality, count]) => `${count} ${modality}`);
  return parts.length > 0
    ? `${parts.join(' + ')} over the next ${days.length} days, rotated across muscle groups and spaced around projected recovery.`
    : `A rest-forward stretch over the next ${days.length} days.`;
}

/**
 * Builds a rolling day-level forecast starting "today" (context.plannedFor).
 *
 * Missed-day reflow: sessions owed but not completed within the trailing
 * 7 days ("owed") aren't dropped — they're added to this window's session
 * count (capped to +2, so a real gap nudges the forecast rather than
 * cramming every missed session back in) and spread across it via the same
 * even (Bresenham-style) placement as a full week, so a missed day's slot
 * lands on the next open day instead of just disappearing. A brand-new
 * athlete with no history yet hasn't missed anything, so reflow only
 * applies once there's at least one completed session to measure against.
 */
export function buildRollingPlan(
  context: SessionContext,
  horizonDays = 7,
  fixedDays?: FixedForecastDay[],
  systemic?: SystemicState,
  recentModalityCounts?: Partial<Record<Modality, number>>,
): RollingPlan {
  const today = localDay(context.plannedFor);
  const fixedByDate = new Map((fixedDays ?? []).map((day) => [day.date, day]));
  const explicitTotal =
    context.goals.weeklyTotalTarget ||
    Object.values(context.goals.weeklyTargets ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  const expectedSessions = Math.max(
    1,
    Math.min(7, explicitTotal || defaultWeeklyFrequencyFor(context.athlete.experience, context.goals.weights)),
  );
  const ageFactor = ageRecoveryFactor(ageYearsOf(context.athlete));

  const trailingStart = today - 7 * DAY_MS;
  const hasHistory = context.history.some((record) => record.completedAt != null);
  const doneThisCycle = context.history.filter(
    (record) => record.completedAt != null && record.completedAt >= trailingStart && record.completedAt < today,
  ).length;
  const owed = hasHistory ? Math.min(2, Math.max(0, expectedSessions - doneThisCycle)) : 0;
  // Scale the weekly rate to the full horizon (a 14-day forecast should carry
  // roughly double a 7-day one) — `owed` is a one-time catch-up nudge on top,
  // not itself scaled by horizon length.
  const baseSessions = Math.round((expectedSessions * horizonDays) / 7);
  const effectiveSessions = Math.min(horizonDays, baseSessions + owed);
  // ADR-0142: a fixed (routine) day is real training the athlete already
  // committed to — it must count TOWARD the weekly total, not stack an extra
  // session on top of it. Without this, an athlete with routines covering
  // their whole stated frequency would still get algorithmic days piled on.
  let fixedCount = 0;
  for (let offset = 0; offset < horizonDays; offset += 1) {
    if (fixedByDate.has(today + offset * DAY_MS)) fixedCount += 1;
  }
  const algorithmicSessions = Math.max(0, effectiveSessions - fixedCount);
  // Item 5 (ADR-0142 v4): bias, never replace, the owed catch-up slots toward
  // whichever modality(ies) actually fell behind this trailing window,
  // weighted by their goal weight — layered on top of the unchanged baseline
  // apportionment below, not a substitute for it.
  const owedBias = recentModalityCounts
    ? owedCatchUpBias(owed, deficitByModality(modalitySchedule(context, expectedSessions), recentModalityCounts), context.goals.weights)
    : [];
  const restCount = Math.max(0, Math.max(algorithmicSessions, horizonDays) - owedBias.length);
  const schedule = interleaveModalities([...owedBias, ...modalitySchedule(context, restCount)]);

  // Seeded from real current fatigue, then walked forward day by day: decayed
  // across the gap since the previous step, and bumped for whichever muscles
  // get prioritized on a workout day — so the forecast reasons about its own
  // proposed sessions the same way it would about sessions already logged.
  const runningFatigue = new Map<MuscleGroup, number>(
    ALL_MUSCLE_GROUPS.map((group) => [group, context.fatigue.byGroup[group] ?? 0]),
  );
  let lastStepAt = context.plannedFor;

  const days: RollingPlanDay[] = [];
  let previousCumulative = 0;
  let scheduleCursor = 0;
  let previousCardioIntent: CardioIntent | undefined;
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = today + offset * DAY_MS;
    decay(runningFatigue, (date - lastStepAt) / 3_600_000, ageFactor);
    lastStepAt = date;

    const fixed = fixedByDate.get(date);
    if (fixed) {
      // Already fixed by a routine — don't spend an algorithmic slot on it
      // (scheduleCursor untouched, so the remaining algorithmic days keep
      // their own fair interleaving), but still project its fatigue
      // contribution forward, exactly like a proposed algorithmic day would.
      const priorityMuscles = fixed.priorityMuscles ?? [];
      for (const group of priorityMuscles) {
        runningFatigue.set(group, clamp((runningFatigue.get(group) ?? 0) + FORECAST_SESSION_IMPULSE, 0, 1));
      }
      // The fixed day's real cardio format isn't known here — conservatively
      // forget the rotation state rather than guess, so the next algorithmic
      // cardio day restarts from the safe 'basic' default.
      if (fixed.modality === 'cardio') previousCardioIntent = undefined;
      days.push({ date, kind: 'workout', modality: fixed.modality, ...(priorityMuscles.length ? { priorityMuscles } : {}) });
      continue;
    }

    const cumulative = Math.round(((offset + 1) * algorithmicSessions) / horizonDays);
    const isWorkoutDay = cumulative > previousCumulative;
    previousCumulative = Math.max(previousCumulative, cumulative);

    if (!isWorkoutDay) {
      days.push({ date, kind: 'rest' });
      continue;
    }

    const modality = schedule[scheduleCursor % schedule.length];
    scheduleCursor += 1;
    const priorityMuscles = priorityMusclesFor(context, runningFatigue, offset === 0);
    for (const group of priorityMuscles) {
      runningFatigue.set(group, clamp((runningFatigue.get(group) ?? 0) + FORECAST_SESSION_IMPULSE, 0, 1));
    }
    const cardioIntent = modality === 'cardio'
      ? cardioIntentFor(previousCardioIntent, context.athlete.preferredCardioIntent)
      : undefined;
    if (modality === 'cardio') previousCardioIntent = cardioIntent;
    days.push({ date, kind: 'workout', modality, priorityMuscles, ...(cardioIntent ? { cardioIntent } : {}) });
  }

  return {
    id: `rolling-${today}`,
    generatedAt: context.plannedFor,
    generatedForDay: today,
    horizonDays,
    days,
    rationale: rationaleFor(days),
    deloadRecommended: systemic?.deloadRecommended ?? false,
    ...(systemic?.note ? { deloadNote: systemic.note } : {}),
  };
}
