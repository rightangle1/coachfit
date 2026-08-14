/**
 * Exercise catalog schema (ADR-0101). Pure domain data — the contract every
 * exercise conforms to. The engine reasons over these fields for selection,
 * equipment filtering, avoidance matching, and substitution.
 */

import type { ImageSourcePropType } from 'react-native';
import type { MuscleGroup } from './body-area';
import type { EquipmentType } from './equipment';
import type { Modality } from './goals';

/**
 * ADR-0302: only license types we've verified how to attribute correctly.
 * Stills only — clips are attribution-based, not license-gated (ADR-0303).
 */
export type MediaLicense = 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-sa' | 'app-original';

interface MediaProvenance {
  license: MediaLicense;
  /** Credit line; rendered in-app for cc-by / cc-by-sa. */
  attribution: string;
  /** Source file page, kept for re-verifying the license claim later. */
  sourceUrl: string;
}

/** Bundled local image — offline by construction (ADR-0302). */
export interface StillAsset extends MediaProvenance {
  file: ImageSourcePropType;
  /** A taller, uncropped visual guide with key alignment annotations. */
  role?: 'form-guide';
}

/**
 * External video, streamed via an inline embedded player — never bundled
 * (ADR-0302). Not license-gated like stills: any publicly viewable demo video
 * qualifies as long as its creator is credited (ADR-0303).
 */
export interface ClipAsset {
  /** Canonical watch URL (currently YouTube-only — ADR-0303). */
  url: string;
  /** Video title, rendered in-app alongside the player. */
  title: string;
  /** Channel/creator name — always rendered, no exceptions. */
  creator: string;
}

export interface ExerciseMedia {
  stills?: StillAsset[];
  clips?: ClipAsset[];
}

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push'
  | 'pull'
  | 'carry'
  | 'core'
  | 'steady_cardio'
  | 'interval'
  | 'aerobics'
  | 'stretch'
  | 'yoga_flow'
  | 'barre_flow'
  | 'pilates_flow';

/**
 * Movement family for cardio exercises (ADR-0139) — orthogonal to
 * `movementPattern`, which stays the intensity-structure axis (steady vs.
 * interval vs. aerobics-cadence circuit). Not to be confused with `Modality`
 * (strength/cardio/mobility/general), a broader axis one level up. Populated
 * only when `modality === 'cardio'`.
 */
export type CardioModality =
  | 'running_walking'
  | 'machine_cardio'
  | 'combat'
  | 'jump_rope'
  /**
   * The step-touch/dance movement family — shares its name with
   * `MovementPattern`'s `'aerobics'` value (ADR-0138), which means something
   * different (circuit-cadence pacing, an intensity-structure concept). The
   * two are independent axes that happen to reuse the same word.
   */
  | 'aerobics'
  | 'bodyweight'
  | 'loaded_cardio';

/** How load advances over time (drives ADR-0103 progressive overload). */
export type Progression = 'weight' | 'reps' | 'time' | 'hold';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type ImpactLevel = 'low' | 'moderate' | 'high';
export type MovementSlot =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'anti_extension'
  | 'anti_rotation'
  | 'lateral_core'
  | 'trunk_flexion'
  | 'trunk_extension'
  | 'steady_cardio'
  | 'intervals'
  | 'aerobics'
  | 'mobility'
  | 'balance'
  | 'power';

/**
 * Ordered position within a 'stretch'/'yoga_flow'/'barre_flow' session
 * (ADR-0114, ADR-0404) — lets the engine sequence a flow like a real class
 * (open, warm up, standing work, balance, backbend/seated, close) instead of
 * picking arbitrarily. Unset entries default to 'standing' — a safe mid-flow
 * bucket. 'thighs'/'seat'/'core'/'arms' are barre-specific stages (ADR-0404);
 * yoga never uses them.
 */
export type FlowStage =
  | 'center'
  | 'warmup'
  | 'standing'
  | 'balance'
  | 'backbend'
  | 'seated'
  | 'cooldown'
  | 'thighs'
  | 'seat'
  | 'core'
  | 'arms';

export interface Exercise {
  id: string;
  name: string;
  modality: Modality;
  movementPattern: MovementPattern;
  /** Cardio movement family (ADR-0139). Undefined for non-cardio exercises. */
  cardioModality?: CardioModality;
  /** Muscle groups primarily trained. */
  primaryAreas: MuscleGroup[];
  /** Muscle groups assisting (count toward fatigue at reduced weight — ADR-0102). */
  secondaryAreas?: MuscleGroup[];
  /** Free-form joint tags for avoidance matching (e.g. 'knee', 'shoulder'). */
  jointLoad?: string[];
  /** Catalog safety/selection metadata. The exported catalog fills every field. */
  difficulty?: ExerciseDifficulty;
  impact?: ImpactLevel;
  prerequisites?: string[];
  regressionIds?: string[];
  progressionIds?: string[];
  substitutionFamily?: string;
  /**
   * Narrower than `substitutionFamily` (ADR-0134): "this is the same movement,
   * done slightly differently." `substitutionFamily` answers *what can replace
   * what* and is deliberately wide — push-up, dumbbell bench press and dumbbell
   * fly all share `strength:horizontal_push:chest`, which is right for offering
   * swaps and far too coarse for spotting redundancy. This answers *is the plan
   * repeating itself*: the push-up variants form one family, the dumbbell
   * presses another. Drives the selection score's family-saturation penalty,
   * which is a graded bias and never a hard filter — when the pool holds nothing
   * else (bodyweight-only, or the athlete excluded the alternatives), repeating
   * a family is still a legal, intended outcome.
   */
  variantFamily?: string;
  movementSlot?: MovementSlot;
  /** ALL of these must be available for the exercise to be selectable. */
  equipment: EquipmentType[];
  progression: Progression;
  /**
   * A 'time'/'hold' movement that is ALSO externally loaded — a farmer's
   * carry, a weighted plank, a loaded conditioning interval — so the tracker
   * captures `weightKg` alongside `durationSec` instead of dropping the load.
   * Meaningless (and unset) for 'weight'/'reps' progression, which already
   * carries weight through `progression` itself. Unset means the timed/hold
   * movement is unloaded (a stretch, a bodyweight plank, a treadmill jog).
   */
  loadsWeight?: boolean;
  /**
   * Movement mechanic — drives rest length (heavy compounds rest longest) and
   * superset pairing (compound→isolation pre/post-exhaust). Optional: when unset
   * the engine derives it from movementPattern + primaryAreas via `mechanicOf`
   * (timing.ts), so the whole catalog need not be hand-tagged at once. Set it to
   * override the heuristic for a specific exercise.
   */
  mechanic?: 'compound' | 'isolation';
  unilateral?: boolean;
  /**
   * Compendium of Physical Activities MET value for this specific exercise
   * (ADR-0123). Meaningful chiefly for cardio/conditioning, where the
   * Compendium has genuine per-exercise codes. Optional: when unset, falls
   * back to the modality/pattern tier lookup (MET_BY_TIER, calories.ts) —
   * same optional-with-fallback shape as `mechanic`. Do not hand-wave a value
   * for strength work — the Compendium has no per-exercise resistance codes;
   * use `loadDemand` instead.
   */
  metValue?: number;
  /**
   * Relative systemic load of one working set of this exercise, on a fixed
   * 0.7 (lightest isolation) – 1.4 (heaviest compound) scale (ADR-0123). NOT
   * Compendium-sourced — grounded in stimulus-to-fatigue-ratio (SFR) training
   * literature instead. Optional: when unset, derived from `mechanic`, muscle
   * mass recruited (primaryAreas/secondaryAreas), and `unilateral`
   * (`defaultLoadDemand`, domain/engine/intensity.ts). Set it to hand-correct
   * a specific exercise the heuristic under/over-shoots — curatorial tagging,
   * same spirit as `jointLoad`, not a fabricated precision number. Feeds the
   * athlete's multi-day fatigue accumulation (fatigue.ts) as an input, not a
   * replacement for it.
   */
  loadDemand?: number;
  /** One-sentence summary of the movement and what it's good for (ADR-0112). */
  description: string;
  /** Ordered setup + execution instructions, shown in full in the exercise's
   * "How to" disclosure (ADR-0112). Written to stand alone without the cue. */
  steps: string[];
  /** Short glance-able form reminder shown next to the set tracker mid-workout. */
  cues?: string;
  /** Enriched media (ADR-0302); falls back to MovementIllustration when unset. */
  media?: ExerciseMedia;
  /** Sequencing hint for 'stretch'/'yoga_flow'/'barre_flow' patterns (ADR-0114, ADR-0404). */
  flowStage?: FlowStage;
}

/**
 * User-excluded catalog entries (settings). A pure preference, distinct from
 * `Constraint` (injury-driven, engine-enforced safety): excluded exercises are
 * simply removed from the selectable pool — never generated, never offered as
 * a swap alternate.
 */
export interface ExercisePreferences {
  excludedExerciseIds: string[];
  /**
   * User-preferred catalog entries — a bias, not an override. `pick()` biases
   * toward these when otherwise tied, but avoidance and variety rules
   * (distinct movement patterns) still apply.
   */
  favoriteExerciseIds: string[];
  /** Audible cue when a timed-set countdown reaches zero. Defaults to on. */
  timerSoundEnabled: boolean;
  /**
   * Standing defaults for the Build screen's warmup/conditioning/cooldown
   * chips (settings). Each plan build still starts from these but can
   * override per-build via the chips themselves — this only sets what a
   * fresh build (or a newly scheduled day) preselects. Defaults to on.
   */
  defaultIncludeWarmup: boolean;
  defaultIncludeConditioning: boolean;
  defaultIncludeCooldown: boolean;
}
