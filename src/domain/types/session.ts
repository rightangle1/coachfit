/**
 * Session types — the core contract the ProgrammingEngine speaks.
 * Mirrors CLAUDE.md §5. Nuance is captured as STRUCTURED inputs
 * (targeting + avoidance + readiness) the rules act on — never free text alone.
 */

import type { AthleteProfile, WeightUnit } from './athlete';
import type { BodyArea, MuscleGroup } from './body-area';
import type { EquipmentInventory } from './equipment';
import type { CardioModality } from './exercise';
import type { Modality, TrainingGoals, TrainingZone } from './goals';

// ---------------------------------------------------------------------------
// Rolling weekly plan — a day-level forecast (no exercises/weights), the
// output of `buildRollingPlan`. Persisted on `AthleteProfile.rollingPlan`.
// ---------------------------------------------------------------------------

export interface RollingPlanDay {
  /** localDay-anchored (noon) epoch ms. */
  date: number;
  kind: 'workout' | 'rest';
  modality?: Modality;
  priorityMuscles?: MuscleGroup[];
  targetSetRange?: { min: number; max: number };
  /** Today's proposed cardio format (ADR-0143), only set when modality is
   * 'cardio'. A default `generateSession` may still adapt or override —
   * see `SessionContext.weeklyPlan`. */
  cardioIntent?: CardioIntent;
}

export interface RollingPlan {
  id: string;
  generatedAt: number;
  /** localDay this plan was generated on — the trigger checks compare against it. */
  generatedForDay: number;
  horizonDays: number;
  days: RollingPlanDay[];
  /** Short, rules-generated (templated) explanation of the forecast. */
  rationale: string;
  /** Whole-athlete systemic-load verdict as of `generatedForDay` (`systemicState`,
   * ADR-0126) — surfaced one interaction earlier than the same-day volume cut
   * it already drives inside `generateSession`. A snapshot of TODAY's
   * backward-looking signal, not a forecast of a future week — periodization
   * stays out of scope (ADR-0133). */
  deloadRecommended: boolean;
  deloadNote?: string;
}

// ---------------------------------------------------------------------------
// Inputs to generateSession()
// ---------------------------------------------------------------------------

export interface SessionContext {
  athlete: AthleteProfile;
  equipment: EquipmentInventory;
  history: SessionRecord[];
  fatigue: FatigueState;
  readiness: ReadinessInput;
  goals: TrainingGoals;
  targeting: SessionTargeting;
  avoidToday: AvoidanceInput;
  /** When the session is being planned for (epoch ms). */
  plannedFor: number;
  /** User-selected daily effort preference, kept separate from readiness. */
  trainingIntent?: 'recovery' | 'balanced' | 'challenge';
  /**
   * User-selected time budget for today's session (minutes, 10-60). Scales the
   * number of main exercises and their reps/sets — a shorter budget trims the
   * session down, a longer one adds work. Unset preserves prior fixed-template
   * behavior exactly. Not used by 'stretch'/'yoga', which have their own
   * `workoutOptions.flow.durationMin` control.
   */
  targetDurationMin?: number;
  /**
   * User-selected session style for today, layered on top of (not replacing)
   * goals/equipment/readiness/avoidance. Unset preserves prior goal-weighted
   * behavior exactly. 'bodyweight' restricts equipment to bodyweight-only;
   * 'stretch'/'yoga'/'barre'/'cardio' replace the usual Main/Conditioning shape
   * with a single-purpose block for that style.
   */
  workoutType?: WorkoutType;
  /**
   * True when the athlete actually tapped a style in the "Kind of session"
   * picker this visit — including "Balanced", whose `workoutType` value is
   * `undefined`, identical to an unseeded day's. Without this, an explicit
   * Balanced pick is indistinguishable from "no preference" and would lose
   * to `weeklyPlan`'s default instead of winning outright like every other
   * explicit `workoutType` value already does.
   */
  workoutTypeExplicit?: boolean;
  /** Per-session controls that make each dedicated workout style behave differently. */
  workoutOptions?: WorkoutOptions;
  /** Catalog ids the athlete has excluded (settings) — never selected or offered as swaps. */
  excludedExerciseIds?: string[];
  /** Catalog ids the athlete has favorited (settings) — biases selection, doesn't override it. */
  favoriteExerciseIds?: string[];
  /**
   * A user-authored routine (ADR-0137) driving today's Main exercise
   * selection. When set, Main draws only from this ordered list (filtered
   * by equipment/avoidance exactly like normal selection) instead of the
   * goal-weighted catalog pool. Every other rule — progression, load,
   * safety caps, warmup/cooldown — still applies unchanged.
   */
  routine?: { id: string; name: string; exerciseIds: string[] };
  /**
   * Today's baseline from the weekly rolling plan (ADR-0142), threaded in by
   * the caller from `AthleteProfile.rollingPlan` / `services/rolling-plan.ts`.
   * Optional and additive — absent preserves today's exact naive-weight-
   * based behavior. A DEFAULT the daily engine may still adapt or override,
   * never a mandate: an explicit `workoutType`/`workoutOptions` choice and a
   * `routine` both still win outright, exactly like `goals.weeklyTargets`'s
   * existing cadence override never touches an explicit choice either.
   */
  weeklyPlan?: { modality?: Modality; cardioIntent?: CardioIntent };
}

export type WorkoutType = 'stretch' | 'yoga' | 'barre' | 'pilates' | 'bodyweight' | 'cardio' | 'bodybuilding' | 'sculpting';

/**
 * The "Kind of session" picker's top-level grouping (ADR-0407) — three broad
 * families the athlete picks between before narrowing to a specific
 * `WorkoutType`. See `familyOfWorkoutType()` (app-lib/options.ts) for the
 * single source-of-truth mapping; nothing else should re-derive this bucketing.
 */
export type WorkoutFamily = 'strength' | 'cardio' | 'mobility';

export type BodybuildingRotation = 'straight' | 'superset' | 'triset';
/**
 * Cardio's intensity-structure axis (ADR-0141) — orthogonal to
 * `CardioModality` (the movement-family axis, exercise.ts), which
 * deliberately keeps its own `'aerobics'` value; `'circuit'` here used to be
 * named `'aerobics'` too until that collision was renamed away. `'basic'`
 * absorbs the old `'base'` and `'benchmark'` values (ADR-0141) — benchmark's
 * only distinguishing behavior (a single exercise, RPE hard-pinned to 7) was
 * never tracked as a distinct entity anywhere, so it was dropped rather than
 * preserved as a toggle.
 */
export type CardioIntent = 'basic' | 'circuit' | 'interval';
export type FlowPace = 'gentle' | 'standard';

/**
 * Normalizes a `CardioIntent` value, including stale pre-ADR-0141 strings
 * that may still live in previously-persisted `WorkoutOptions` (this repo
 * has no schema-migration framework — see ADR-0141). Anything unrecognized
 * falls back to `'basic'`, the safest/most conservative structure.
 */
export function normalizeCardioIntent(value: string | undefined): CardioIntent {
  if (value === 'circuit' || value === 'aerobics') return 'circuit';
  if (value === 'interval' || value === 'intervals') return 'interval';
  return 'basic'; // covers 'basic', 'base', 'benchmark', undefined, and anything else stale/unrecognized
}

export interface WorkoutOptions {
  /** Available to intermediate and advanced athletes in a bodybuilding session. */
  bodybuildingRotation?: BodybuildingRotation;
  /** Cardio format is explicit instead of treating every timed session alike. */
  cardioIntent?: CardioIntent;
  /**
   * Which cardio movement families (ADR-0139) today's Main block may draw
   * from — e.g. combat, running/walking. Empty/unset means no preference
   * (every modality eligible, today's default behavior). OR-matched: an
   * exercise is eligible if its `cardioModality` is any one of these. When a
   * combination has no matching exercises for the chosen `cardioIntent`, the
   * engine drops the preference for that session rather than failing —
   * see `rules-engine.ts`'s cardio pool build (ADR-0140).
   */
  cardioModalities?: CardioModality[];
  /**
   * Dedicated yoga/stretch controls; visual cues stay entirely offline. What
   * to target for a Stretch session comes from `SessionContext.targeting.emphasize`
   * (ADR-0114 v2) — there is deliberately no separate `focus` field here, to
   * avoid two inputs carrying the same value.
   */
  flow?: { durationMin?: number; pace?: FlowPace };
  /**
   * Optional session components. Omitted/true keeps the prior always-on
   * behavior; false skips the block entirely, and its planned minutes are
   * folded back into Main so a chosen `targetDurationMin` still gets used
   * rather than ending the session short. Not applicable to 'stretch'/'yoga'
   * (the whole session is a single flow block already).
   */
  includeWarmup?: boolean;
  includeConditioning?: boolean;
  includeCooldown?: boolean;
  /**
   * Touchless, auto-advancing playback for a timed flow (yoga/stretch/barre
   * stage order, an aerobics circuit, or steady/interval cardio phases) —
   * see `src/domain/engine/guided-flow.ts` and `src/app/workout-flow.tsx`.
   * Deliberately a different field from `flow` above (that's yoga/stretch
   * pacing knobs, unrelated). Unset resolves via `defaultAutoAdvance()`
   * rather than "off" — there's no prior guided-flow behavior to preserve,
   * so the per-style smart default is the right unset behavior here.
   */
  autoAdvance?: boolean;
}

/** Unset `workoutOptions.autoAdvance` resolves here — a timed flow defaults
 * to touchless playback, everything else has nothing to sequence. */
export function defaultAutoAdvance(workoutType: WorkoutType | undefined, cardioIntent?: CardioIntent): boolean {
  if (workoutType === 'yoga' || workoutType === 'stretch' || workoutType === 'barre' || workoutType === 'pilates') return true;
  if (workoutType === 'cardio') return true;
  void cardioIntent; // every CardioIntent gets a guided flow (thumbnail strip or phase timer) — see guided-flow.ts
  return false;
}

/** Per-area fatigue estimates (0 = fresh, 1 = maximally fatigued). ADR-0102. */
export interface FatigueState {
  byGroup: Partial<Record<MuscleGroup, number>>;
  details?: Partial<Record<MuscleGroup, MuscleFatigueDetail>>;
  updatedAt: number;
}

export type FatigueStatus = 'good' | 'recovering' | 'fatigued';

/** Explainable local-fatigue detail used by the Today body map. */
export interface MuscleFatigueDetail {
  score: number;
  status: FatigueStatus;
  lastTrainedAt?: number;
  lastWorkoutName?: string;
  completedSets: number;
  lastWorkoutWasMax?: boolean;
}

/** Prebrief cards. Values 1..5 unless noted. */
export interface ReadinessInput {
  sleepQuality?: number;
  soreness?: number;
  energy?: number;
  note?: string;
}

// Structured nuance — this replaces the need for an LLM.

/**
 * How hard `emphasize` binds (ADR-0126).
 *
 * `balanced` (the default) guarantees emphasis a minimum share of the Main
 * block while leaving room for the rest of the body. `priority` is the explicit
 * override for someone who means "train *only* shoulders today" and hands the
 * whole block over. Neither pierces the safety envelope: hard avoidance stays
 * absolute, weekly-volume ceilings still trim, and pushing an emphasized area
 * through severe fatigue still costs the usual heavy de-load.
 */
export type EmphasisMode = 'balanced' | 'priority';

export interface SessionTargeting {
  emphasize: BodyArea[];
  avoid: BodyArea[];
  emphasisMode?: EmphasisMode;
}

export interface AvoidanceFlag {
  area: BodyArea;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface AvoidanceInput {
  flags: AvoidanceFlag[];
  /** Optional free text; stored, not the thing rules act on. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Output of generateSession()
// ---------------------------------------------------------------------------

export interface SessionPlan {
  id: string;
  plannedFor: number;
  blocks: SessionBlock[];
  /** Short, rules-generated (templated) explanation of today's plan. */
  rationale: string;
  estimatedDurationMin?: number;
  /**
   * Full per-exercise swap/skip detail behind `rationale`'s summary — not
   * shown in the main UI, kept for the decision log (CLAUDE.md §7).
   */
  adjustments?: string[];
  workoutType?: WorkoutType;
  workoutOptions?: WorkoutOptions;
  /**
   * The check-in this plan was built from (ADR-0126). Carried onto the record so
   * "have they been feeling rough lately?" is answerable — readiness was
   * previously read once and discarded, leaving it stateless.
   */
  readiness?: ReadinessInput;
  /** Structured record of mid-session decisions, retained for explanation/audit. */
  liveAdjustments?: LiveAdjustmentRecord[];
  /** Set when this plan was generated from a routine (ADR-0137) — the id of `SessionContext.routine`. */
  routineId?: string;
  /**
   * Whether this plan was generated under a dense-pacing lean (ADR-0145,
   * `TrainingGoals.restPacing === 'dense'`), resolved once at generation time.
   * Downstream consumers that only have the plan — not the full
   * `SessionContext`/`TrainingGoals` (e.g. the pre-workout duration badge,
   * a live mid-session adjustment) read this instead of re-deriving it, so a
   * plan's rest/duration math stays internally consistent everywhere it's read.
   */
  densePacing?: boolean;
}

export interface SessionBlock {
  modality: Modality;
  label: string;              // e.g. "Main strength", "Warmup", "Conditioning"
  exercises: PlannedExercise[];
}

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  primaryAreas: BodyArea[];
  secondaryAreas?: BodyArea[];
  sets: PlannedSet[];
  /** Why this exercise/prescription (e.g. "swapped from squat: left knee flag"). */
  note?: string;
  /**
   * This exercise is here to serve today's emphasis (ADR-0126). Drives the
   * extra set emphasis earns, and protects it from being the first thing the
   * duration balancer drops.
   */
  emphasized?: boolean;
  /**
   * Volume was deliberately cut on this exercise — a flagged area, high fatigue,
   * the weekly volume ceiling, or targeting pushed through severe fatigue. The
   * duration balancer must never add sets back to it: a de-load is a safety
   * decision, and CLAUDE.md §7 says nothing may override those.
   */
  deloaded?: boolean;
  /**
   * Which rep/effort zone this exercise is trained in today (ADR-0128). Drives
   * the STRENGTH/ENDURANCE badge, and is copied onto each performed set at
   * materialization so the zone rotation can read its own history back.
   */
  zone?: TrainingZone;
  /** Exercises sharing an id are performed once each, then repeated as a round. */
  rotationGroup?: string;
  /**
   * Typed superset/triset membership with a stated rationale (ADR-0121). When
   * set, `group.id === rotationGroup` (the string id is kept for the tracker's
   * round-based flatten); `type` + `rationale` explain *what it is and why*.
   */
  group?: SupersetGroup;
}

/** Why two/three exercises are paired — never random (ADR-0121). `circuit`
 * (ADR-0138) is a distinct case: an aerobics circuit's stations aren't paired
 * by muscle relationship at all, just rotated together for continuous work. */
export type SupersetType = 'antagonist' | 'pre_exhaust' | 'post_exhaust' | 'time_saver' | 'circuit';

export interface SupersetGroup {
  /** Shared id across the group's members (mirrors `rotationGroup`). */
  id: string;
  type: SupersetType;
  /** Short, human rationale shown in the prebrief and tracker. */
  rationale: string;
}

export interface PlannedSet {
  /** Prescribed targets; any may be undefined depending on modality. */
  reps?: number;
  weightKg?: number;
  durationSec?: number;     // cardio / holds
  distanceM?: number;       // cardio
  /**
   * Prescribed rest AFTER this set (seconds), load-aware (heavy compounds rest
   * longest — see docs/methodology/strength-set-design.md §2). Drives the session
   * time estimate and the per-set rest timer in the tracker. Undefined on the
   * final set of an exercise / where rest is intrinsic (cardio).
   */
  restSec?: number;
  targetRpe?: number;       // 1..10
  isWarmup?: boolean;
  /** Explicit interval semantics drive the cardio timeline rather than a generic set row. */
  phase?: 'work' | 'recovery';
  /** A controlled, higher-load AMRAP used to calibrate a working baseline. */
  isCalibration?: boolean;
  /** Cardio axis deliberately advanced for this prescription. */
  progressionVariable?: 'duration' | 'distance' | 'pace' | 'rounds' | 'work_recovery_ratio' | 'perceived_intensity';
}

// ---------------------------------------------------------------------------
// Live adjustment + logging
// ---------------------------------------------------------------------------

export interface LiveSignal {
  kind: 'too_easy' | 'too_hard' | 'pain' | 'skip' | 'time_short' | 'swap';
  exerciseId?: string;
  area?: BodyArea;
  severity?: 'mild' | 'moderate' | 'severe';
  symptomType?: 'ache' | 'sharp' | 'burning' | 'numbness' | 'instability' | 'other';
  note?: string;
  /** For kind 'swap': the catalog exercise id chosen to replace `exerciseId`. */
  replacementExerciseId?: string;
  /**
   * For kind 'swap': the athlete deliberately picked this replacement from
   * the picker's "Any Equipment" browse mode, knowing it needs gear they
   * don't have on file (e.g. at a gym away from home) — bypass the equipment
   * check for this one swap. Never set by generation, only a manual pick.
   */
  ignoreEquipment?: boolean;
  /** Preferred UI unit, used only to choose a sensible first load for a new weighted swap. */
  weightUnit?: WeightUnit;
  /** For time_short: actual time remaining, when the UI knows it. */
  remainingMinutes?: number;
}

export interface LiveAdjustmentRecord {
  kind: LiveSignal['kind'];
  exerciseId?: string;
  replacementExerciseId?: string;
  area?: BodyArea;
  severity?: LiveSignal['severity'];
  symptomType?: LiveSignal['symptomType'];
  reasonCode:
    | 'pain_stop'
    | 'difficulty_reduce'
    | 'zone_progression'
    | 'time_trim'
    | 'skip_repair'
    | 'compatible_substitution'
    | 'rejected_substitution';
  note: string;
}

/** Context needed to validate a live replacement as rigorously as generation. */
export interface LiveAdjustmentContext {
  equipment: EquipmentInventory;
  history?: SessionRecord[];
  avoidToday?: AvoidanceInput;
  excludedExerciseIds?: string[];
  experience?: import('./goals').ExperienceLevel;
  /**
   * Needed to derive the same per-session volume ceiling generation used
   * (ADR-0134), so a swap is clamped against the athlete's real landmarks rather
   * than a default. Omitted → the swap inherits the original's set count
   * unclamped, which is the prior behavior.
   */
  resistanceFocus?: import('./goals').ResistanceFocus;
}

/** A completed (or in-progress) session as actually performed. */
export interface SessionRecord {
  id: string;
  planId: string;
  plannedFor: number;
  startedAt?: number;
  /** Active timer is paused locally without changing the workout's started-at
   * record. These fields keep the elapsed clock honest across app reloads. */
  pausedAt?: number;
  pausedDurationMs?: number;
  /** Estimate shown before starting; used to calibrate future time estimates. */
  plannedDurationMin?: number;
  completedAt?: number;
  /** Finished before all planned sets were logged (CLAUDE.md §7: kept for an honest decision log). */
  endedEarly?: boolean;
  /** Denormalized from the plan at start (mirrors `plannedFor`); older records predate this and are simply excluded from workout-style achievements. */
  workoutType?: WorkoutType;
  /** Denormalized from the plan at start (ADR-0137) — lets history be filtered to "sessions that used this routine" for routine-level progress. */
  routineId?: string;
  performed: PerformedExercise[];
  debrief?: DebriefInput;
  /** iOS-only. Set once this session's workout is written to HealthKit; guards against a duplicate write. */
  healthKitWorkoutUUID?: string;
  /** iOS-only. Diagnostic id of this session's Live Activity. */
  liveActivityId?: string;
  /** The check-in this session was planned from (ADR-0126). */
  readiness?: ReadinessInput;
  /**
   * Why the athlete stopped early (ADR-0126). `endedEarly` alone cannot be read
   * as "the prescription was too much" — running out of time is at least as
   * common as running out of gas, and treating them alike would make the engine
   * timid for the wrong reason.
   */
  endedEarlyReason?: EndedEarlyReason;
}

/** Distinguishes "no time left" from "nothing left in the tank". */
export type EndedEarlyReason = 'out_of_time' | 'too_hard' | 'other';

export interface PerformedExercise {
  exerciseId: string;
  name: string;
  primaryAreas: BodyArea[];
  /** Assisting muscles, retained on the record for local-fatigue accounting. */
  secondaryAreas?: BodyArea[];
  sets: PerformedSet[];
}

export interface PerformedSet {
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  completed: boolean;
  /** Set aside during the workout. Kept distinct from completion for an honest log. */
  skipped?: boolean;
  /** Optional safety/technique signal; quality can constrain progression. */
  quality?: 'clean' | 'form_breakdown' | 'pain';
  isCalibration?: boolean;
  /**
   * A ramp set, copied from the plan (ADR-0128). Recorded because zone tests
   * prepend warm-up sets, and counting those as working sets would inflate both
   * weekly volume and fatigue — falsely pushing a muscle toward its ceiling and
   * suppressing the next session.
   */
  isWarmup?: boolean;
  phase?: 'work' | 'recovery';
  /**
   * What was ASKED of this set, frozen at materialization (ADR-0125). The
   * tracker pre-fills `reps`/`rpe` from the plan and lets the athlete edit them,
   * so the logged values alone cannot answer "did they do the work we asked?" —
   * an untouched set looks identical to one deliberately confirmed on target.
   * Double progression needs that distinction, so the prescription is recorded
   * separately from the performance. Absent on records predating ADR-0125;
   * consumers fall back to the logged value (see `lastPerformance`).
   */
  prescribedReps?: number;
  prescribedWeightKg?: number;
  prescribedRpe?: number;
  prescribedDurationSec?: number;
  prescribedDistanceM?: number;
  progressionVariable?: PlannedSet['progressionVariable'];
  /**
   * Which training zone this set was prescribed in (ADR-0128). Recorded rather
   * than inferred: a hypertrophy -> endurance move (12 -> 15 reps) falls inside
   * the tolerance the rep-drift heuristic uses for equipment-capped climbs, so
   * inference would silently miss it and skip reconciling the load.
   */
  prescribedZone?: TrainingZone;
}

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------

export interface DebriefInput {
  overallRpe?: number;
  /** Explicit override for the automatic max-effort classification. */
  maxEffort?: boolean;
  enjoyment?: number;
  wouldDoAgain?: boolean;
  issues?: AvoidanceFlag[];   // anything that came up (feeds future avoidance)
  note?: string;
}

export interface DebriefResult {
  /** Structured takeaways that feed the next generateSession call. */
  fatigueDelta?: Partial<Record<MuscleGroup, number>>;
  newConstraintsSuggested?: AvoidanceFlag[];
  summary: string;            // short, templated note
}
