/**
 * Session types — the core contract the ProgrammingEngine speaks.
 * Mirrors CLAUDE.md §5. Nuance is captured as STRUCTURED inputs
 * (targeting + avoidance + readiness) the rules act on — never free text alone.
 */

import type { AthleteProfile, WeightUnit } from './athlete';
import type { BodyArea, MuscleGroup } from './body-area';
import type { EquipmentInventory } from './equipment';
import type { Modality, TrainingGoals, TrainingZone } from './goals';

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
   * 'stretch'/'yoga'/'cardio' replace the usual Main/Conditioning shape with a
   * single-purpose block for that style.
   */
  workoutType?: WorkoutType;
  /** Per-session controls that make each dedicated workout style behave differently. */
  workoutOptions?: WorkoutOptions;
  /** Catalog ids the athlete has excluded (settings) — never selected or offered as swaps. */
  excludedExerciseIds?: string[];
  /** Catalog ids the athlete has favorited (settings) — biases selection, doesn't override it. */
  favoriteExerciseIds?: string[];
}

export type WorkoutType = 'stretch' | 'yoga' | 'bodyweight' | 'cardio' | 'bodybuilding' | 'sculpting';

export type BodybuildingRotation = 'straight' | 'superset' | 'triset';
export type CardioIntent = 'base' | 'intervals' | 'benchmark';
export type FlowPace = 'gentle' | 'standard';

export interface WorkoutOptions {
  /** Available to intermediate and advanced athletes in a bodybuilding session. */
  bodybuildingRotation?: BodybuildingRotation;
  /** Cardio format is explicit instead of treating every timed session alike. */
  cardioIntent?: CardioIntent;
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

/** Why two/three exercises are paired — never random (ADR-0121). */
export type SupersetType = 'antagonist' | 'pre_exhaust' | 'post_exhaust' | 'time_saver';

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
  /** Estimate shown before starting; used to calibrate future time estimates. */
  plannedDurationMin?: number;
  completedAt?: number;
  /** Finished before all planned sets were logged (CLAUDE.md §7: kept for an honest decision log). */
  endedEarly?: boolean;
  /** Denormalized from the plan at start (mirrors `plannedFor`); older records predate this and are simply excluded from workout-style achievements. */
  workoutType?: WorkoutType;
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
