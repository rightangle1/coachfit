/**
 * RulesEngine — the deterministic, offline core. This IS the app's brain.
 *
 * v1 (Phase 1): real, adaptive session generation from structured inputs
 * (ADR-0105 pipeline + ADR-0106 avoidance/targeting). Nuance comes from the
 * `targeting` and `avoidToday` inputs — no LLM. Fatigue (ADR-0102), progressive
 * overload + safety caps (ADR-0103), and volume landmarks (ADR-0104) deepen the
 * numbers in later steps; v1 uses conservative fixed templates.
 */

import type { ProgrammingEngine } from './programming-engine';
import {
  type SessionContext,
  type SessionPlan,
  type SessionBlock,
  type PlannedExercise,
  type PlannedSet,
  type LiveSignal,
  type LiveAdjustmentContext,
  type DebriefInput,
  type DebriefResult,
  type BodyArea,
  type Exercise,
  type Modality,
  type ModalityWeights,
  type ExperienceLevel,
  type FlowStage,
  type MuscleGroup,
  type WarmupPreferences,
  type CooldownPreferences,
  type EmphasisMode,
  type TrainingZone,
  type WorkoutType,
  type CardioIntent,
  type CardioModality,
  type BodyRegion,
  type EquipmentType,
  DEFAULT_WARMUP_PREFERENCES,
  DEFAULT_COOLDOWN_PREFERENCES,
  GROUP_TO_REGION,
  normalizeCardioIntent,
} from '../types';
import { EXERCISES } from '../catalog';
import {
  equipmentSatisfied,
  anyAreaMatches,
  emphasizesArea,
  availableWeightsForExercise,
  isFullBodyTargeting,
  replacementAllowed,
} from './matching';
import {
  type ExercisePrescription,
  type RepRange,
  barbellFloorKg,
  formatSuggestedWeight,
  recommendLoad,
  recommendPrescription,
  snapToSensibleWeight,
  startingWeightKgFor,
} from './progression';
import { ageYearsOf } from '../types';
import { layoffState } from './layoff';
import { debriefFeedback } from './debrief-feedback';
import { systemicState } from './systemic-load';
import {
  ZONE_SPEC,
  type ZoneAssignment,
  zoneCadenceFor,
  zonePlanFor,
  workingZoneFor,
} from './training-zone';
import {
  type ScoreContext,
  type SelectionProfile,
  buildHistoryIndex,
  orderForSession,
  scoreExercise,
} from './selection-score';

import { fatigueAreas } from './fatigue';
import { durationCalibrationFactor, estimateBlocksSeconds, pacedRestSecondsFor, REST, roundToNearest10 } from './timing';
import { cardioRestRatio, cardioWorkRpe, metForExercise } from './intensity';
import { applySupersets } from './supersets';
import { applyAerobicsCircuit } from './cardio-circuit';
import { mechanicOf } from './mechanic';
import { slotsFor, stableAnchorExerciseIds } from './anchors';
import { finalizeLoad } from './load-finalization';
import { readinessFactor, readinessSuggestsRecovery } from './readiness';
import {
  isoWeekStart,
  rollingSevenDayVolumeByGroup,
  volumeLandmarksFor,
  volumeStatus,
  weeklySessionCountsByModality,
  weeklyVolumeByGroup,
} from '../metrics';
import {
  allocateDailyVolume,
  dailySetCeiling,
  isWorkingSet,
  loadedGroupsOf,
  loadedGroupsOfPlanned,
  tallyOf,
  trimToWorkingSets,
  workingSetCount,
} from './session-volume';

/** The first two Main picks are stable, measurable progression anchors. */
const MAIN_ANCHOR_COUNT = 2;
/** How far above the working load a strength test ramps. */
const STRENGTH_TEST_LOAD_FACTOR = 1.1;
/** All-out effort — the whole point of a test set. */
const TEST_RPE = 9;

/** Resolve a planned exercise's id back to its catalog entry (for timing). */
const resolveExercise = (id: string): Exercise | undefined => EXERCISES.find((e) => e.id === id);

/** Majority-vote cardio vs. everything-else across a routine's exercises
 * (ADR-0137) — mirrors the engine's existing Main-block binary split
 * (cardio vs. strength-shaped), so a routine drives which branch runs. */
function routineSkewsCardio(exerciseIds: string[]): boolean {
  let cardio = 0;
  let other = 0;
  for (const id of exerciseIds) {
    const exercise = resolveExercise(id);
    if (!exercise) continue;
    if (exercise.modality === 'cardio') cardio++;
    else other++;
  }
  return cardio > other;
}

interface AvoidanceModel {
  /** Injury/pain-based — severe today-flags, 'avoid' constraints, explicit
   * targeting.avoid. Absolute: nothing, including explicit targeting, ever
   * overrides this (CLAUDE.md: safety cannot be overridden by any component). */
  hardSafety: BodyArea[];
  /** Severe accumulated fatigue (ADR-0102). Excludes by default, but explicit
   * `targeting.emphasize` on the same area overrides it — the exercise still
   * gets built, just heavily de-loaded (see `pushedThroughFatigue` at the
   * call site). Never overrides `hardSafety`. */
  hardFatigue: BodyArea[];
  limit: BodyArea[]; // user/constraint limits → de-load ("flagged area")
  recovery: BodyArea[]; // high (not severe) fatigue → de-load ("recovery")
  /** Used as a tie-breaker: fresher valid muscles get priority today. */
  fatigueByGroup: SessionContext['fatigue']['byGroup'];
}

export interface Prescription {
  mainSets: number;
  mainReps: number;
  mainRpe: number;
  coreSeconds: number;
  cardioSeconds: number;
}

export class RulesEngine implements ProgrammingEngine {
  readonly id = 'rules-engine';
  readonly version = '0.1.0';

  async generateSession(input: SessionContext): Promise<SessionPlan> {
    const avoid = buildAvoidance(input);
    // Current ISO week's per-muscle-group volume so far (ADR-0104). `plannedFor`
    // (not wall-clock time) keeps week bucketing deterministic and testable.
    const programWeekVolume = weeklyVolumeByGroup(input.history, 0, input.plannedFor);
    const rollingVolume = rollingSevenDayVolumeByGroup(input.history, input.plannedFor);
    const weeklyVolume: Partial<Record<MuscleGroup, number>> = {};
    for (const group of new Set([...Object.keys(programWeekVolume), ...Object.keys(rollingVolume)] as MuscleGroup[])) {
      weeklyVolume[group] = Math.max(programWeekVolume[group] ?? 0, rollingVolume[group] ?? 0);
    }
    const volumeLandmarks = volumeLandmarksFor(
      input.goals.resistanceFocus,
      input.athlete.experience,
      input.history,
      input.plannedFor,
    );
    const weights = normalize(input.goals.weights);
    // ADR-0145: resolved once here so every rest/duration consumer below
    // (annotateRest, fitDurationToBudget, estimateDuration, cardioSets) agrees
    // on the same value, and so it can be persisted onto the plan (SessionPlan.
    // densePacing) for consumers that only have the plan, not the full goals.
    const densePacing = input.goals.restPacing === 'dense';
    const experience = input.athlete.experience;
    const targetDurationMin = input.targetDurationMin;
    const options = input.workoutOptions;
    // Optional session components (skip Warmup/Conditioning/Cool down). Omitted/true
    // keeps every block always-on (prior behavior); a skipped block's planned
    // minutes fold back into Main below so a chosen time budget still gets used.
    const includeWarmup = options?.includeWarmup !== false;
    const includeConditioning = options?.includeConditioning !== false;
    const includeCooldown = options?.includeCooldown !== false;
    const warmupBase: WarmupPreferences = input.athlete.warmup ?? DEFAULT_WARMUP_PREFERENCES;
    // ADR-0127: older athletes get a longer MINIMUM warm-up — a trainer always
    // lengthens these with age. It is a floor, not an override: an athlete who
    // already prefers a longer warm-up keeps it.
    const warmupPrefs: WarmupPreferences = isOlderAthlete(input)
      ? { ...warmupBase, totalMinutes: Math.max(warmupBase.totalMinutes, AGE.WARMUP_FLOOR_MIN) }
      : warmupBase;
    const cooldownPrefs: CooldownPreferences = input.athlete.cooldown ?? DEFAULT_COOLDOWN_PREFERENCES;
    // Real seconds those blocks would have consumed (matches estimateDurationSeconds
    // exactly, since totalMinutes*60 is exactly what their durationSec sets sum to) —
    // folded into Main's exercise count below rather than driving the count/reps
    // formulas indirectly, which rounds too coarsely to reliably use up the time.
    const skippedFixedBlockSeconds =
      (includeWarmup ? 0 : Math.max(60, Math.round(warmupPrefs.totalMinutes * 60))) +
      (includeCooldown ? 0 : Math.max(60, Math.round(cooldownPrefs.totalMinutes * 60)));
    const baseRx = prescriptionFor(experience, targetDurationMin);
    const intent = input.trainingIntent ?? 'balanced';
    const intentRpeShift = intent === 'challenge' ? 1 : intent === 'recovery' ? -1 : 0;
    const rx = {
      ...baseRx,
      mainRpe: Math.max(5, Math.min(9, baseRx.mainRpe + intentRpeShift)),
    };
    // ADR-0125: a return-to-training ramp multiplies the day's scale rather than
    // being folded inside the readiness clamp, so a long layoff can ease the
    // session further than a bad night's sleep ever should on its own.
    const layoff = layoffState(input.history, input.plannedFor);
    // ADR-0126: systemic fatigue — consecutive training days, a rising 4-week
    // load trend, and repeated rough check-ins. Per-muscle fatigue cannot see
    // any of this, so a well-rotated six-day week used to cost nothing at all.
    const systemic = systemicState(input.history, input.plannedFor);
    const volumeScale =
      Math.max(
        0.65,
        Math.min(1.1, readinessScale(input.readiness) * (intent === 'challenge' ? 1.1 : intent === 'recovery' ? 0.8 : 1)),
      ) * layoff.volumeFactor * systemic.volumeFactor;

    const workoutType = input.workoutType;
    const excluded = new Set(input.excludedExerciseIds ?? []);
    const favorites = new Set(input.favoriteExerciseIds ?? []);
    let available = EXERCISES.filter(
      (e) => equipmentSatisfied(e, input.equipment) && !excluded.has(e.id),
    );
    // 'bodyweight' restricts the whole pool up front; every block below (warmup,
    // main, conditioning) then naturally draws only from equipment-free options.
    if (workoutType === 'bodyweight') {
      available = available.filter((e) => e.equipment.every((eq) => eq === 'bodyweight' || eq === 'bench'));
    }
    const swaps: string[] = [];
    const emphasize = input.targeting.emphasize;

    // ADR-0105 v2: explicit weekly cadence targets, if set, can override the
    // naive weight-based pick — populated below when that fires. Resolved
    // before the Stretch/Yoga/Barre/Pilates check below (ADR-0145) so an
    // implicit (no explicit workoutType) mobility-dominant day can be routed
    // into the same flow builder an explicit style choice gets.
    let cadenceNote: string | undefined;
    let mainModality: Modality;
    if (workoutType === 'cardio') {
      mainModality = 'cardio';
    } else if (
      workoutType === 'bodybuilding' || workoutType === 'sculpting' || workoutType === 'bodyweight'
      // 'Balanced' is `workoutType === undefined` — identical to an
      // unseeded day unless `workoutTypeExplicit` says the athlete actually
      // tapped it. See options.ts's familyOfWorkoutType: unset resolves to
      // Strength, so an explicit Balanced pick belongs in this branch too.
      || (workoutType == null && input.workoutTypeExplicit)
    ) {
      // An explicit strength-family choice must win outright, exactly like
      // 'cardio' above — otherwise a cardio-leaning weeklyPlan/weights pick
      // below would silently override the athlete's own Build Workout choice.
      mainModality = 'strength';
    } else if (input.routine) {
      // ADR-0137: a routine's own exercises decide which Main shape runs —
      // the weight/cadence-derived pick would otherwise ignore an all-cardio
      // routine on a day the athlete's goals lean strength.
      mainModality = routineSkewsCardio(input.routine.exerciseIds) ? 'cardio' : 'strength';
    } else {
      // ADR-0142: the weekly plan's proposed modality is a DEFAULT for the
      // naive pick, never a mandate — applyCadenceOverride (and, ultimately,
      // today's actual readiness/history) can still move off it exactly like
      // it already moves off dominantMainModality's own naive weight-based
      // pick. Absent input.weeklyPlan (the byte-identical legacy case), this
      // is exactly today's behavior.
      const naiveModality = input.weeklyPlan?.modality ?? dominantMainModality(weights);
      const cadence = applyCadenceOverride(
        naiveModality,
        input.goals.weeklyTargets,
        input.history,
        input.plannedFor,
      );
      mainModality = cadence.modality;
      cadenceNote = cadence.note;
    }

    // 'stretch'/'yoga'/'barre'/'pilates' replace the usual warmup/main/
    // conditioning shape entirely with a single flow block — the whole
    // session IS the mobility work, so a separate dynamic warmup would be
    // redundant. Yoga, Barre, and Pilates use the same stage-ordered
    // mechanism (ADR-0114 v3, ADR-0404, ADR-0407) with different stage
    // orders/hold specs — one exercise per stage, the whole sequence
    // repeated together for whole natural-time rounds; Stretch instead
    // rotates through a capped set of targeted muscles for whole rounds,
    // extending hold length before adding rounds, so a real duration (e.g.
    // 20 min) is actually achievable.
    // ADR-0145: an implicit day (no explicit workoutType) whose goal
    // weighting resolves to a mobility-dominant main modality is routed here
    // too — the generic Main-block pipeline below is strength-shaped
    // throughout (training zones, rep ranges, RPE-based loading) and has no
    // sensible way to build a mobility-catalog session, so a mobility day can
    // only ever come from this flow. Never reachable for a routine session
    // (routineSkewsCardio makes mainModality strictly cardio/strength above).
    const implicitMobilityDay = workoutType == null && mainModality === 'mobility';
    if (workoutType === 'stretch' || workoutType === 'yoga' || workoutType === 'barre' || workoutType === 'pilates' || implicitMobilityDay) {
      const flowType: 'stretch' | 'yoga' | 'barre' | 'pilates' =
        workoutType === 'yoga' || workoutType === 'barre' || workoutType === 'pilates' ? workoutType : 'stretch';
      const requestedMinutes = options?.flow?.durationMin;
      // Pace (gentle → longer) and readiness fold into hold length, within each
      // hold's clinically bounded min/max — never into how many activities fit.
      const paceScale = (options?.flow?.pace === 'gentle' ? 1.2 : 1) * volumeScale;

      let flow: PlannedExercise[];
      let stageRounds: number | undefined;
      if (flowType === 'yoga' || flowType === 'barre' || flowType === 'pilates') {
        // A mat (yoga/pilates) or a literal barre (barre) is the one piece of
        // "equipment" nearly every entry lists, but it's a nice-to-have
        // surface/prop, not a hard requirement — an athlete without one
        // still gets the full flow (bare floor/carpet, or a sturdy chair/
        // countertop standing in for a barre) rather than a pool gutted down
        // to the couple of entries that don't list it. ADR-0137 v2: a
        // routine restricts the stage-ordered pick to only its own entries —
        // buildStageFlow itself is unchanged, it just naturally produces a
        // routine-scoped sequence (skipping any stage the routine has no
        // entry for) from a smaller candidate pool.
        const movementPattern = flowType === 'yoga' ? 'yoga_flow' : flowType === 'barre' ? 'barre_flow' : 'pilates_flow';
        const optionalEquipment: EquipmentType[] = flowType === 'barre' ? ['barre'] : ['yoga_mat'];
        const stageOrder = flowType === 'yoga' ? YOGA_STAGE_ORDER : flowType === 'barre' ? BARRE_STAGE_ORDER : PILATES_STAGE_ORDER;
        const holdSpec = flowType === 'yoga' ? MOBILITY_HOLD.yoga : flowType === 'barre' ? MOBILITY_HOLD.barre : MOBILITY_HOLD.pilates;
        const flowCandidates = input.routine
          ? EXERCISES.filter((e) => input.routine!.exerciseIds.includes(e.id))
          : EXERCISES;
        const flowPool = flowCandidates.filter(
          (e) => e.movementPattern === movementPattern && !excluded.has(e.id) && equipmentSatisfied(e, input.equipment, optionalEquipment),
        );
        const built = buildStageFlow(flowPool, stageOrder, holdSpec, requestedMinutes, avoid, swaps, favorites, paceScale, input.routine?.exerciseIds);
        flow = built.exercises;
        stageRounds = built.rounds;
      } else {
        // Static/dynamic stretches only (excludes 'time'-progression entries —
        // those are dynamic movement-prep drills, Warmup's territory, not
        // deliberate stretch work) — plus individual yoga poses that primary-
        // match a targeted area, used standalone rather than as part of a
        // sequence (emphasizesArea is trivially false with no targeting, so
        // this pool stays stretch-only when nothing is targeted). ADR-0137 v2:
        // a routine's own list is unconditionally in-pool (and drives the
        // rotation directly below) rather than needing to match targeting.
        const stretchCandidates = input.routine
          ? available.filter((e) => input.routine!.exerciseIds.includes(e.id))
          : available;
        const stretchPool = stretchCandidates.filter(
          (e) =>
            (e.movementPattern === 'stretch' && (e.progression === 'hold' || e.progression === 'reps')) ||
            (e.movementPattern === 'yoga_flow' && (input.routine ? true : emphasizesArea(emphasize, e))),
        );
        flow = buildStretchFlow(stretchPool, emphasize, avoid, swaps, favorites, paceScale, requestedMinutes, input.routine?.exerciseIds);
      }

      const flowLabel = flowType === 'yoga' ? 'Yoga flow' : flowType === 'barre' ? 'Barre flow' : flowType === 'pilates' ? 'Pilates flow' : 'Stretch flow';
      const blocks: SessionBlock[] = flow.length
        ? [
            {
              modality: 'mobility',
              label: flowLabel,
              exercises: flow,
            },
          ]
        : [];
      // No fitDurationToBudget pass here, deliberately: both builders above
      // already derive their structure directly from the time budget using
      // fixed, clinically/naturally-correct hold lengths — round count
      // (yoga/barre) or targeted-area count (stretch) is the only lever.
      // Running the generic budget-fitter afterward would compress holds
      // toward its 20s filler floor, undoing exactly that.
      annotateRest(blocks, densePacing);
      roundPlanTimes(blocks);

      const flowRationale = buildFlowRationale(flowType, emphasize, avoid, volumeScale, flow.length > 0, stageRounds);

      return {
        id: `plan-${input.plannedFor}`,
        plannedFor: input.plannedFor,
        estimatedDurationMin: Math.round(estimateDuration(blocks, densePacing) * durationCalibrationFactor(input.history)),
        // ADR-0137 v2: same "which routine drove this" lead-in the strength/
        // cardio path already uses.
        rationale: input.routine ? `Following your "${input.routine.name}" routine. ${flowRationale}` : flowRationale,
        adjustments: swaps.length ? swaps : undefined,
        workoutType,
        workoutOptions: options,
        routineId: input.routine?.id,
        densePacing,
        blocks,
      };
    }

    const blocks: SessionBlock[] = [];
    // Exercise ids already placed in any block this session (ADR-0136) —
    // threaded forward through Warmup/Conditioning/Cool down so a session
    // never recommends the same exercise twice (e.g. the same stretch opening
    // and closing the workout). Populated as each block below is finalized.
    const sessionChosenIds = new Set<string>();

    // 1) Warmup is built further below (after Main), once today's actual
    // trained muscle groups are known — see `mainAreas`. It's still unshifted
    // to the front of `blocks` so it renders first in the session.

    // 2) Main block — trains the dominant theme. 'cardio' workoutType forces a
    // fuller multi-exercise cardio session regardless of goal weighting.
    // Populated (strength branch only) with groups de-loaded for hitting this
    // week's volume ceiling (ADR-0104), for the rationale summary below.
    let overMrvGroupsToday: BodyArea[] = [];
    let pushedThroughFatigueGroupsToday: BodyArea[] = [];
    // ADR-0126: how many emphasis slots the block could NOT fill, so the
    // rationale can admit it instead of claiming emphasis it didn't deliver.
    let emphasisShortfall = 0;
    // ADR-0134: groups whose per-session ceiling actually bound today, and how
    // many exercises the ceiling removed outright. Drives the rationale — a
    // session that comes back shorter than requested has to say why.
    let dailyCapGroups: BodyArea[] = [];
    let dailyCapCeiling = 0;
    let dailyCapDroppedExercises = 0;
    // ADR-0134: exercises 'priority' emphasis mode could not fill from the
    // emphasized pool alone. Deliberately NOT backfilled with other muscle
    // groups, so the session runs short instead of quietly changing subject.
    let priorityBlockShortfall = 0;
    // ADR-0128: which zone each Main exercise landed in, and where a test sits.
    let zonePlanToday: Map<string, ZoneAssignment> = new Map();
    // Muscle groups Main actually ends up training today — used below to bias
    // Warmup/Cool down toward the same areas (ADR-0111/0116 previously only
    // ever used a static profile preference for this).
    let mainAreas: MuscleGroup[] = [];
    // ADR-0124: true when the strength Main block used "Full Body" targeting —
    // read by fitDurationToBudget below to protect the region spread from
    // being trimmed all the way down to the generic 2-exercise floor.
    let mainIsFullBody = false;
    // ADR-0137: how many of a routine's exercises actually survived into Main
    // (after equipment/safety/volume-ceiling trimming) — read by
    // fitDurationToBudget below so a duration budget can still compress sets
    // or drop non-routine filler, but never silently drops a routine
    // exercise the athlete deliberately chose to run today.
    let routineMainExerciseCount: number | undefined;
    // A skipped Conditioning block's seconds fold into Main the same way a
    // skipped Warmup/Cool down do — only relevant when Conditioning would
    // otherwise have been built at all (step 3 below).
    // Excludes 'general' too: once mainModality can itself be 'general', the
    // Main block already IS the general-weighted work, so a Conditioning
    // finisher here would double-count the same cardio+general signal.
    const conditioningWouldApply =
      mainModality !== 'cardio' && mainModality !== 'general' && weights.cardio + weights.general >= 0.25;
    const freedSeconds =
      skippedFixedBlockSeconds + (conditioningWouldApply && !includeConditioning ? baseRx.cardioSeconds + 30 : 0);
    if (mainModality === 'cardio') {
      // ADR-0142: an explicit workoutOptions.cardioIntent always wins; the
      // weekly plan's proposed format is only a default for a day the
      // athlete didn't pick one, same "default, not a mandate" treatment as
      // mainModality above (harmless no-op for a routine session, whose own
      // effectiveCardioIntent already overrides this per-exercise).
      const cardioIntent: CardioIntent = normalizeCardioIntent(options?.cardioIntent ?? input.weeklyPlan?.cardioIntent);
      // ADR-0137: a routine fixes WHICH cardio exercises Main draws from —
      // equipment/exclusions are already applied via `available`; a hard-
      // safety/fatigue conflict is skipped by `pick()` itself (never
      // substituted with something outside the routine).
      const routinePool = input.routine
        ? available.filter((e) => e.modality === 'cardio' && input.routine!.exerciseIds.includes(e.id))
        : undefined;
      // ADR-0143: count is driven by the session's declared cardioIntent
      // alone, never by whether `workoutType` happened to be explicitly
      // 'cardio' — an implicit cardio day (mainModality derived purely from
      // goal weights) deserves the same exercise-count scaling an explicit
      // choice gets, instead of silently collapsing to a single exercise.
      const baseCount = routinePool
        ? routinePool.length
        : cardioIntent === 'circuit'
          ? aerobicsStationCount(experience, targetDurationMin)
          : cardioIntent === 'interval'
            ? intervalStationCount(experience, targetDurationMin)
            : cardioFocusCount(experience, targetDurationMin);
      // A single cardio Main exercise's estimate — used to convert freed seconds
      // from a skipped block into additional exercises (approximate for intervals).
      const perExerciseSeconds = rx.cardioSeconds + 30;
      let count = routinePool ? routinePool.length : baseCount + (freedSeconds > 0 ? Math.round(freedSeconds / perExerciseSeconds) : 0);
      const matchesIntent = (exercise: Exercise) => cardioIntent === 'circuit'
        ? exercise.movementPattern === 'aerobics' || (exercise.movementPattern === 'interval' && exercise.loadsWeight === true)
        : cardioIntent === 'basic'
          ? exercise.movementPattern === 'steady_cardio'
          : exercise.movementPattern === 'interval';
      // ADR-0143: same reasoning as baseCount above — the pattern filter that
      // keeps a slot's candidates coherent with the declared shape must apply
      // whenever Main is cardio, not only when workoutType was explicitly
      // 'cardio'. Without this, an implicit cardio day's single slot was
      // scored across the ENTIRE cardio pool (steady/interval/aerobics mixed)
      // with nothing steering it toward the shape that intent implies.
      const intentPool = available.filter(matchesIntent);
      // An intent filter that excludes every candidate (e.g. no
      // steady_cardio-tagged exercise survived equipment/avoidance
      // filtering) must never produce an empty Main block — fall back to the
      // unfiltered cardio pool rather than the requested shape.
      const basePool = intentPool.length > 0 ? intentPool : available;
      if (!routinePool && intentPool.length === 0) {
        swaps.push(`No ${cardioIntent} cardio exercises available today — using the closest match instead`);
      }
      // ADR-0140: which cardio movement families (running, combat, ...) Main
      // may draw from today. Empty/unset = no preference (prior behavior).
      const cardioModalities = options?.cardioModalities?.length ? options.cardioModalities : undefined;
      let pool =
        routinePool ??
        (cardioModalities
          ? basePool.filter((exercise) => exercise.cardioModality && cardioModalities.includes(exercise.cardioModality))
          : basePool);
      if (!routinePool && cardioModalities && pool.length === 0) {
        // The chosen cardio type has no exercises matching today's format
        // (e.g. Aerobics format + Loaded cardio type) — drop the preference
        // rather than generate an empty Main block (CLAUDE.md §7: safety and
        // a complete session always win over honoring a preference exactly).
        pool = basePool;
        swaps.push("Cardio type preference skipped — no matching exercises for today's format");
      }
      // Running/walking and cardio-machine intervals (sprint/recovery cycles
      // on one treadmill or track) are naturally single-exercise — unlike a
      // mixed bodyweight/aerobics interval session, there's no real "second
      // station" to rotate to without switching equipment mid-interval. Only
      // overrides when EVERY matched candidate is single-focus; a pool mixing
      // running with other interval work keeps its normal scaled count.
      if (!routinePool && cardioIntent === 'interval' && isSingleFocusCardioPool(pool)) {
        count = 1;
      }
      // Shared by reference across every cardio pick below (ADR-0134's own
      // pattern, mirrored from the strength branch's `usedFamilies` — see
      // rules-engine.ts's resistance Main block) — without this, the backfill
      // pick() below started its own empty family tally, so a near-duplicate
      // (e.g. Burpees' own broad-jump-combo variant) could still land a
      // second time once the first pick() call's own loop ran out of
      // distinct candidates and this one took over with no memory of it.
      const usedFamilies = new Map<string, number>();
      let main = pick(pool, 'cardio', count, emphasize, avoid, swaps, {
        // ADR-0143: the pool is now always intent-filtered (basePool above),
        // whether cardio was explicit or implicit — every candidate already
        // shares one movementPattern by construction of that filter, so
        // requiring pattern-distinct picks would make it impossible to
        // select more than one exercise. This was already correctly false
        // for explicit cardio; it must be false for implicit cardio too, now
        // that both paths share the same intent-filtered pool.
        requireDistinctPattern: false,
        history: input.history,
        now: input.plannedFor,
        favorites,
        experience,
        profile: routinePool ? 'anchor' : 'neutral',
        anchorCount: routinePool ? routinePool.length : 0,
        seedUsedFamilies: usedFamilies,
      });
      // The candidate pool (e.g. distinct cardio patterns) can run out before
      // `count` is met — prefer another distinct cardio exercise (even one
      // repeating a movement pattern) over stretching a single bout very long.
      // Never applies to a routine: a shortfall there means some of the
      // routine's own exercises were unsafe today, not that more variety is
      // needed — backfilling from outside the routine would silently change it.
      if (!routinePool && main.length < count) {
        const remainingPool = pool.filter((e) => e.modality === 'cardio' && !main.some((chosen) => chosen.id === e.id));
        const more = pick(remainingPool, 'cardio', count - main.length, emphasize, avoid, swaps, { requireDistinctPattern: false, history: input.history, now: input.plannedFor, favorites, experience, seedUsedFamilies: usedFamilies });
        main = [...main, ...more];
      }
      if (routinePool) {
        const missingEquipment = input.routine!.exerciseIds.filter(
          (id) => resolveExercise(id)?.modality === 'cardio' && !routinePool.some((e) => e.id === id),
        ).length;
        if (missingEquipment > 0) {
          swaps.push(`Routine "${input.routine!.name}": ${missingEquipment} exercise${missingEquipment === 1 ? '' : 's'} skipped — missing equipment today`);
        }
      }
      // Only once the pool is truly exhausted does leftover time stretch the
      // exercises already picked — capped so a single bout doesn't balloon
      // past a sensible ~40 min ceiling.
      const shortfall = Math.max(0, count - main.length);
      const rxForMain =
        shortfall > 0 && main.length > 0
          ? {
              ...rx,
              cardioSeconds: Math.min(
                2400,
                rx.cardioSeconds + Math.round((shortfall * perExerciseSeconds) / main.length),
              ),
            }
          : rx;
      mainAreas = Array.from(new Set(main.flatMap((e) => e.primaryAreas)));
      const cardioStationCount = cardioIntent === 'circuit' ? main.length : 1;
      const mainExercises = main.map((e) =>
        toPlanned(
          e,
          cardioSets(
            e,
            rxForMain,
            effectiveCardioIntent(e, cardioIntent, Boolean(routinePool)),
            recommendedCardioWeightKg(e, input),
            input.history,
            input.trainingIntent,
            cardioStationCount,
            volumeScale,
            densePacing,
          ),
        ),
      );
      if (cardioIntent === 'circuit') applyAerobicsCircuit(mainExercises);
      blocks.push({ modality: 'cardio', label: 'Main', exercises: mainExercises });
      main.forEach((e) => sessionChosenIds.add(e.id));
    } else {
      // mainModality is guaranteed 'strength' | 'general' here (cardio branches
      // above, mobility is diverted to the flow builder earlier) — this is which
      // resistance-shaped catalog pool Main draws from today.
      const resistanceModality: Modality = mainModality === 'general' ? 'general' : 'strength';
      const isBodybuilding = workoutType === 'bodybuilding';
      const isSculpting = workoutType === 'sculpting';
      // ADR-0137: a routine already fixes exactly which exercises to run —
      // the full-body region spread is a selection strategy for when the
      // engine is choosing, which it isn't here.
      const fullBody = !input.routine && isFullBodyTargeting(emphasize);
      mainIsFullBody = fullBody;
      const baseCount = isBodybuilding
        ? bodybuildingCount(experience, targetDurationMin)
        : isSculpting
          ? sculptingCount(experience, targetDurationMin)
          : mainCount(experience, targetDurationMin);
      // Rep-based strength sets carry no durationSec, so estimateDurationSeconds
      // values each at a flat 45+30=75s — matching that exactly here keeps the
      // extra exercises we add a reliable (not approximate) use of freed time.
      const perExerciseSeconds = rx.mainSets * 75;
      // ADR-0137: a routine fixes WHICH exercises Main draws from —
      // equipment/exclusions are already applied via `available`; a hard-
      // safety/fatigue conflict is skipped by `pick()` itself (never
      // substituted with something outside the routine).
      const routinePool = input.routine
        ? available.filter(
            (e) => (e.modality === 'strength' || e.modality === 'general') && input.routine!.exerciseIds.includes(e.id),
          )
        : undefined;
      const count = routinePool
        ? routinePool.length
        : baseCount + (freedSeconds > 0 ? Math.round(freedSeconds / perExerciseSeconds) : 0);
      // ADR-0124: "Full Body" targeting forces the picks to span upper/lower/
      // core instead of letting normal emphasis-driven scoring concentrate
      // on 1-2 groups — independent of workoutType (works for Bodybuilding
      // or Balanced too, not just Sculpting).
      const emphasisMode = input.targeting.emphasisMode ?? 'balanced';
      // No emphasis-quota backfill for a routine — the pool is already fixed
      // by the athlete, not something to top up by muscle-group emphasis.
      const quotaTarget = routinePool || fullBody ? 0 : emphasisQuotaFor(count, emphasize, emphasisMode);
      // ADR-0134: shared across every selection pass below, so the family
      // redundancy penalty accumulates over the whole Main block instead of
      // resetting each time a sub-pool is picked.
      const usedFamilies = new Map<string, number>();
      // ADR-0134: 'priority' means the whole block, so the pool itself is
      // restricted rather than relying on the quota fill to displace filler
      // afterwards. That displacement is bounded by how much emphasized work
      // exists, so a thin emphasized pool used to leave squats and deadlifts
      // sitting on a "chest only" day. Falls back to the full pool if the
      // emphasized one is empty — a session is better than nothing.
      const emphasisOnlyPool = available.filter(
        (e) => e.modality === resistanceModality && emphasizesArea(emphasize, e),
      );
      const mainPool =
        routinePool ??
        (emphasisMode === 'priority' && emphasize.length && !fullBody && emphasisOnlyPool.length
          ? emphasisOnlyPool
          : available);
      let main = fullBody
        ? pickFullBodySpread(available, count, emphasize, avoid, swaps, weeklyVolume, input.history, favorites, input.plannedFor, usedFamilies, experience, resistanceModality)
        : pick(mainPool, routinePool ? 'any' : resistanceModality, count, emphasize, avoid, swaps, {
            weeklyVolume,
            history: input.history,
            now: input.plannedFor,
            favorites,
            experience,
            seedUsedFamilies: usedFamilies,
            // A routine repeats every time it's run — damp novelty/recency
            // scoring for every one of its exercises, same lean as the
            // session's stable anchor lifts (ADR-0126).
            anchorCount: routinePool ? routinePool.length : MAIN_ANCHOR_COUNT,
            profile: routinePool ? 'anchor' : 'accessory',
            requireDistinctPattern: !routinePool,
          });
      if (routinePool) {
        const missingEquipment = input.routine!.exerciseIds.filter((id) => {
          const m = resolveExercise(id)?.modality;
          return (m === 'strength' || m === 'general') && !routinePool.some((e) => e.id === id);
        }).length;
        if (missingEquipment > 0) {
          swaps.push(`Routine "${input.routine!.name}": ${missingEquipment} exercise${missingEquipment === 1 ? '' : 's'} skipped — missing equipment today`);
        }
      }

      // ADR-0126: emphasis is a guaranteed minimum share of the block, not just
      // the heaviest ranking term. Scoring alone could still deliver a session
      // with ZERO emphasized work — if the emphasized pool is equipment-blocked
      // or collapses into one movement pattern — while the rationale cheerfully
      // announced "Emphasizing chest". Fill the quota explicitly instead.
      let emphasisDelivered = main.filter((e) => emphasizesArea(emphasize, e)).length;
      if (quotaTarget > emphasisDelivered) {
        const emphasisPool = emphasisOnlyPool;
        const chosenIds = new Set(main.map((e) => e.id));
        // Deliberately NOT distinct-pattern: a chest day legitimately runs three
        // pushes, and that guard is what most often makes the quota unfillable.
        // ADR-0134: 'push' was far too coarse to be the thing keeping this
        // honest, though — it let this path deliver six push-up variants. The
        // family-saturation penalty is the precise version of that guard, and it
        // carries the families the pass above already used.
        const extra = pick(emphasisPool, resistanceModality, quotaTarget - emphasisDelivered, emphasize, avoid, swaps, {
          requireDistinctPattern: false,
          weeklyVolume,
          history: input.history,
          now: input.plannedFor,
          favorites,
          experience,
          seedChosenIds: chosenIds,
          seedUsedFamilies: usedFamilies,
          anchorCount: MAIN_ANCHOR_COUNT,
          profile: 'accessory',
        });
        if (extra.length) {
          // Keep the block at `count` by dropping the least-relevant non-emphasized
          // picks from the end, so honoring the quota doesn't quietly lengthen
          // the session past the athlete's chosen duration.
          const keep = main.filter((e) => emphasizesArea(emphasize, e));
          const filler = main.filter((e) => !emphasizesArea(emphasize, e));
          filler.splice(Math.max(0, filler.length - extra.length));
          main = [...keep, ...extra, ...filler];
          emphasisDelivered = keep.length + extra.length;
        }
      }
      emphasisShortfall = Math.max(0, quotaTarget - emphasisDelivered);
      // Main's distinct-movement-pattern rule (avoids redundant picks) can run
      // out of unique patterns before `count` is met, especially at a long
      // requested duration or with several components skipped. Prefer adding
      // more distinct exercises first — even ones repeating an already-used
      // pattern — over piling sets onto a handful of lifts; a trainer fills
      // time with more work, not e.g. 8 sets of one triceps extension.
      //
      // ADR-0134: in 'priority' mode this pool is restricted to emphasized work.
      // "Only chest" previously came back as one push-up followed by squats,
      // deadlifts, lunges and a carry — the engine filled the clock with muscle
      // groups the athlete had explicitly declined, and said nothing. When the
      // emphasized pool is genuinely exhausted, a shorter session is the honest
      // answer, and the rationale says so.
      //
      // ADR-0137: never applies to a routine — a shortfall there means some of
      // the routine's own exercises were unsafe today, not that more variety
      // is needed; backfilling from outside the routine would silently
      // change a list the athlete deliberately curated.
      if (!routinePool && main.length < count) {
        const remainingPool = available.filter(
          (e) =>
            e.modality === resistanceModality &&
            !main.some((chosen) => chosen.id === e.id) &&
            (emphasisMode !== 'priority' || !emphasize.length || emphasizesArea(emphasize, e)),
        );
        const more = pick(remainingPool, resistanceModality, count - main.length, emphasize, avoid, swaps, { requireDistinctPattern: false, weeklyVolume, history: input.history, now: input.plannedFor, favorites, experience, seedUsedFamilies: usedFamilies, profile: 'accessory' });
        main = [...main, ...more];
      }
      // Priority mode fills only with emphasized work, so it can legitimately end
      // up short of `count`. Surfaced in the rationale rather than silently
      // padded with unrequested muscle groups.
      priorityBlockShortfall = !routinePool && emphasisMode === 'priority' && emphasize.length ? Math.max(0, count - main.length) : 0;
      // ADR-0126: heaviest compound work first, while the athlete is fresh;
      // isolation last. Selection order was previously whatever ranking
      // produced, so a triceps extension could precede a squat.
      //
      // This deliberately supersedes ADR-0124's region interleaving for the
      // full-body spread. That interleave existed so end-trimming (see
      // fitDurationToBudget) couldn't wipe out whichever region sorted last —
      // but ordering by mechanic solves the same problem better: when a session
      // has to lose work, a trainer drops the isolation exercise, not the
      // squat. The spread still comes from selection; only its order changed.
      mainAreas = Array.from(new Set(main.flatMap((e) => e.primaryAreas)));
      // Only once the catalog is truly exhausted does any leftover time become
      // extra sets on the exercises picked — capped well short of the 1.3x
      // duration-lever ceiling so a long requested session still reads as a
      // sensible prescription, not a fixed handful of lifts done to exhaustion.
      const shortfallExercises = Math.max(0, count - main.length);
      const extraSets =
        main.length > 0 ? Math.min(2, Math.round((shortfallExercises * perExerciseSeconds) / (main.length * 75))) : 0;
      // ADR-0134: clamped to MAX_WORK_SETS, not 6. The old ceiling predated the
      // emphasis extra set below, which stacks on top of it — so an emphasized
      // lift in a session whose pool was exhausted could reach 7 working sets,
      // well outside the 3-5 block ADR-0120 promises and the rest of the engine
      // enforces. Priority emphasis makes an exhausted pool routine, so this is
      // now reachable rather than theoretical.
      const rxForMain = extraSets > 0 ? { ...rx, mainSets: Math.min(MAX_WORK_SETS, rx.mainSets + extraSets) } : rx;
      const overMrvToday = new Set<MuscleGroup>();
      const pushedThroughFatigueToday = new Set<MuscleGroup>();
      // ADR-0134: the day's hard per-muscle-group ceiling, and the running tally
      // it is enforced against. `main` is already in trainer priority order
      // (tests, then compounds, emphasized first), so consuming headroom in
      // iteration order means the work that matters most gets its full
      // prescription and the redundant tail is what gets trimmed or dropped.
      const dailyCeiling = dailySetCeiling(volumeLandmarks);
      // ADR-0128: decide, per exercise, which rep/effort zone it is trained in
      // today — and whether one of them carries an all-out test. This is where
      // strength work finally becomes reachable: the zone owns the rep band, so
      // it no longer comes from session length or workout style.
      const zoneCadence = zoneCadenceFor({
        experience,
        targetDurationMin,
        weights: input.goals.weights,
        workoutType,
        testingEnabled: input.athlete.maxDay != null,
      });
      const zonePlan = zonePlanFor({
        chosen: main,
        history: input.history,
        now: input.plannedFor,
        cadence: zoneCadence,
        withProgressionBasis: buildHistoryIndex(input.history).withProgressionBasis,
        preferredTestExerciseIds: explicitlyDueTestIds(main, input),
        baselineZone: workingZoneFor(input.goals.resistanceFocus),
        // Same gate max days have always used: a test is a higher-stakes ask
        // than a working set, so any hard exclusion or a poor check-in blocks it.
        testingAllowed:
          input.trainingIntent !== 'recovery' &&
          !systemic.deloadRecommended &&
          isMaxDayReady(input, avoid),
      });
      zonePlanToday = zonePlan;
      // ADR-0142: stable anchors for THIS modality/week-position — replaces
      // the retired weekly-program.ts's separately-recomputed hypothetical
      // schedule, which could (and did) disagree with the modality actually
      // being trained today.
      const weekStart = isoWeekStart(input.plannedFor);
      const completedThisWeek = input.history.filter(
        (record) => record.completedAt != null && record.completedAt >= weekStart && record.completedAt <= input.plannedFor,
      ).length;
      const anchorExerciseIds = stableAnchorExerciseIds(input, mainModality, slotsFor(mainModality, completedThisWeek));
      // Ordered only now that zones are known — a test has to lead the session,
      // which the plain compound-first ordering cannot express on its own.
      main = orderForSession(
        main,
        (id) => zonePlan.get(id)?.isTest ?? false,
        (exercise) =>
          emphasizesArea(emphasize, exercise) ||
          anchorExerciseIds.includes(exercise.id),
      );
      // ADR-0134: share the day's ceiling across the block BEFORE any sets are
      // assigned, in the priority order just established. Doing this per-exercise
      // during assignment instead lets the first lifts drain the ceiling and
      // starve the rest — a five-exercise chest block collapses to two. The
      // allowance below is an upper bound; each exercise still gets whatever its
      // own de-loads and zone decide, then min()'d against this.
      const dailyAllocation = allocateDailyVolume(
        main.map((e) => ({ id: e.id, groups: loadedGroupsOf(e) })),
        dailyCeiling,
        (id) => {
          const e = main.find((candidate) => candidate.id === id);
          return Math.min(MAX_WORK_SETS, rxForMain.mainSets + (e && emphasizesArea(emphasize, e) ? 1 : 0));
        },
        MIN_WORK_SETS,
      );
      for (const droppedId of dailyAllocation.dropped) {
        const e = main.find((candidate) => candidate.id === droppedId);
        if (e) {
          swaps.push(
            `${e.name}: dropped — no room left under today's ${dailyCeiling}-set ceiling for ${describeAreasUnique(e.primaryAreas.map((group) => ({ group })))}`,
          );
        }
      }
      const cappedGroupsToday = new Set<MuscleGroup>(dailyAllocation.boundGroups);
      const cappedExerciseCount = dailyAllocation.dropped.length;
      main = main.filter((e) => (dailyAllocation.allowance.get(e.id) ?? 0) > 0);
      // ADR-0137: whatever the routine actually delivered here (post safety/
      // volume-ceiling trimming) is the floor fitDurationToBudget must respect.
      if (input.routine) routineMainExerciseCount = main.length;
      blocks.push({
        modality: resistanceModality,
        label: 'Main',
        exercises: main.flatMap((e) => {
          const flagged = anyAreaMatches(avoid.limit, e);
          const recovery = anyAreaMatches(avoid.recovery, e);
          // Part 1: explicit targeting can push a pick() selection through
          // severe fatigue (avoid.hardFatigue) — surfaced here so this exercise
          // gets a heavier de-load than a normal `recovery` trim, and the
          // rationale can say so explicitly rather than reading as untouched.
          const pushedThroughFatigue = anyAreaMatches(avoid.hardFatigue, e) && emphasizesArea(emphasize, e);
          if (pushedThroughFatigue) e.primaryAreas.forEach((group) => pushedThroughFatigueToday.add(group));
          const overMrvGroups = exerciseOverMrv(e, weeklyVolume, volumeLandmarks);
          const overMrv = overMrvGroups.length > 0;
          overMrvGroups.forEach((group) => overMrvToday.add(group));
          const unit = input.athlete.weightUnit ?? 'kg';
          const available = availableWeightsForExercise(e, input.equipment);
          // ADR-0125/0128: double progression decides the load AND the work at
          // it; the zone decides which band that happens in. Effort still moves
          // with the day's training intent, exactly as it did before.
          const assignment = zonePlan.get(e.id) ?? FALLBACK_ZONE_ASSIGNMENT;
          const zoneSpec = ZONE_SPEC[assignment.zone];
          const range = zoneSpec.range;
          const zoneRpe = Math.max(5, Math.min(9, zoneSpec.targetRpe + intentRpeShift));
          const rxForZone = { ...rxForMain, mainRpe: zoneRpe, mainReps: rangeCentreOf(range) };
          const rec = recommendPrescription(e, input.history, zoneRpe, range, {
            unit,
            available,
            now: input.plannedFor,
            zone: assignment.zone,
          });
          // ADR-0122: finalize the recommended load against today's readiness,
          // per-muscle fatigue, any recent max-out, and any return-to-training
          // ramp — reductions only, never above the cap progression enforced.
          const final =
            rec.weightKg != null
              ? finalizeLoad({
                  baseWeightKg: rec.weightKg,
                  exercise: e,
                  readiness: input.readiness,
                  fatigue: input.fatigue,
                  history: input.history,
                  now: input.plannedFor,
                })
              : undefined;
          const finalizedKg = final?.weightKg ?? rec.weightKg;
          // ADR-0144: a barbell's total (bar+plates) may never be prescribed
          // below the empty bar, even after finalizeLoad's readiness/fatigue
          // reduction. Deliberately still `undefined` (not a starting guess)
          // when there's no real recommendation yet — addCompoundRampSets
          // below must never ramp up TO a made-up number; the starting-weight
          // fallback is applied afterward, once ramp-set building is done
          // (see `finalSets`).
          const floorKg = barbellFloorKg(e);
          const weightKg = finalizedKg != null
            ? snapToSensibleWeight(finalizedKg, unit, available, floorKg)
            : finalizedKg;
          // Once fatigue/readiness or the athlete's actual rack changes the
          // final load, the preliminary progression note is no longer the
          // prescription. Avoid saying "+2.5 kg" beside a held 40 kg set.
          const recNote = rec.weightKg === weightKg ? rec.note ?? null : null;
          const finalNote = final?.note && weightKg != null && rec.weightKg != null
            ? sensibleFinalizationNote(final.note, rec.weightKg, weightKg, unit)
            : final?.note ?? null;
          const snapNote =
            finalizedKg != null && weightKg != null && weightKg !== finalizedKg
              ? available?.length
                ? `using the closest weight you own: ${formatSuggestedWeight(weightKg, unit)}`
                : `rounded down to ${formatSuggestedWeight(weightKg, unit)} for a practical increment`
              : null;
          if (final?.note) swaps.push(`${e.name}: ${final.note} [readiness×${final.drivers.readinessFactor} fatigue×${final.drivers.fatigueFactor} maxTax×${final.drivers.maxTaxFactor} layoff×${final.drivers.layoffFactor}]`);
          // ADR-0126: emphasis moves VOLUME, not just which exercises appear.
          // A trainer emphasizing a lagging body part adds a set there — but
          // only when nothing else says to back off, so every de-load, the
          // weekly volume ceiling and the fatigue override all still win.
          const isEmphasized = emphasizesArea(emphasize, e);
          const earnsExtraSet =
            isEmphasized && !flagged && !recovery && !overMrv && !pushedThroughFatigue && !assignment.cascaded;
          const deloaded = flagged || recovery || overMrv || assignment.cascaded || volumeScale < 0.95;
          const workingSets = strengthSets(
            e,
            earnsExtraSet ? { ...rxForZone, mainSets: Math.min(MAX_WORK_SETS, rxForZone.mainSets + 1) } : rxForZone,
            volumeScale,
            deloaded,
            { ...rec, weightKg },
            range,
            pushedThroughFatigue,
          );
          const prescribedSets = addCompoundRampSets(e, workingSets, assignment.zone, unit, available);
          // ADR-0134 — the hard per-session ceiling. Applied last, after every
          // other rule has had its say, because it is the one thing nothing may
          // exceed: not emphasis, not workout style, not a long duration
          // request. An exercise with no headroom left is dropped rather than
          // rendered with zero sets.
          const loaded = loadedGroupsOf(e);
          const prescribedWorkSets = prescribedSets.filter(isWorkingSet).length;
          const allowedWorkSets = Math.min(prescribedWorkSets, dailyAllocation.allowance.get(e.id) ?? prescribedWorkSets);
          const capped = allowedWorkSets < prescribedWorkSets;
          if (capped) {
            for (const group of loaded.primary) cappedGroupsToday.add(group);
            swaps.push(
              `${e.name}: ${prescribedWorkSets} → ${allowedWorkSets} sets — today's ${dailyCeiling}-set ceiling for ${describeAreasUnique(loaded.primary.map((group) => ({ group })))}`,
            );
          }
          const sets = capped ? trimToWorkingSets(prescribedSets, allowedWorkSets) : prescribedSets;
          // ADR-0144: no history yet for this exercise — give it a real,
          // equipment-aware STARTING suggestion instead of leaving weightKg
          // blank (which the tracker showed as a confusing em-dash that read
          // as "0"). Applied here, after strengthSets/ramp-set building, so a
          // made-up starting number is never itself fed into
          // addCompoundRampSets as if it were an established load to ramp
          // toward. No-op for anything that isn't a fresh loaded exercise.
          const finalSets = finalizedKg == null && (e.progression === 'weight' || e.loadsWeight)
            ? sets.map((set) =>
                set.weightKg == null && !set.isWarmup && !set.isCalibration
                  ? { ...set, weightKg: startingWeightKgFor(e, available, unit) }
                  : set,
              )
            : sets;
          const note = joinNotes([
            fullBody
              ? "part of today's full-body spread"
              : isEmphasized
                ? earnsExtraSet ? 'targets your emphasis — extra set' : 'targets your emphasis'
                : null,
            pushedThroughFatigue ? 'targeting honored despite high fatigue — volume trimmed further' : null,
            flagged ? 'de-loaded to protect a flagged area' : null,
            recovery ? 'de-loaded for recovery (high fatigue)' : null,
            overMrv
              ? `de-loaded — already at this week's volume ceiling for ${describeAreasUnique(overMrvGroups.map((group) => ({ group })))}`
              : null,
            assignment.cascaded
              ? 'lighter and higher-rep — this muscle is tested earlier in today\'s session'
              : null,
            capped
              ? `trimmed to ${allowedWorkSets} sets — that's all ${describeAreasUnique(loaded.primary.map((group) => ({ group })))} should carry in one session`
              : null,
            recNote,
            finalNote,
            snapNote,
          ]);
          // `capped` counts as de-loaded: the duration balancer must never pad a
          // ceiling-trimmed lift back up (CLAUDE.md §7 — nothing overrides a
          // safety decision).
          return [toPlanned(e, finalSets, note, isEmphasized, deloaded || pushedThroughFatigue || capped, assignment.zone)];
        }),
      });
      // Typed supersets/trisets (ADR-0121) — deliberate, explainable grouping.
      // Beginners stay straight (form + simplicity). Explicit 'straight' opts out;
      // 'superset'/'triset' opt in; otherwise auto-group hypertrophy/general days
      // (never heavy strength — the pairing engine leaves heavy compounds straight).
      const mainBlock = blocks[blocks.length - 1];
      if (experience !== 'beginner') {
        const rotation = options?.bodybuildingRotation;
        const optedOut = rotation === 'straight';
        const optedIn = rotation === 'superset' || rotation === 'triset';
        // A time-efficiency lean (general fitness / conditioning weight) also invites
        // auto-pairing; pure strength/hypertrophy work only pairs when opted in.
        const timeEfficiencyLean = weights.general + weights.cardio >= 0.3;
        if (optedIn || (!optedOut && (isBodybuilding || isSculpting || timeEfficiencyLean))) {
          applySupersets(mainBlock, {
            groupSize: rotation === 'triset' ? 3 : 2,
            allowTimeSaver: optedIn || timeEfficiencyLean,
            resolve: resolveExercise,
          });
        }
        applyZoneTests(mainBlock, input, zonePlan);
      }
      overMrvGroupsToday = Array.from(overMrvToday).map((group) => ({ group }));
      pushedThroughFatigueGroupsToday = Array.from(pushedThroughFatigueToday).map((group) => ({ group }));
      dailyCapGroups = Array.from(cappedGroupsToday).map((group) => ({ group }));
      dailyCapCeiling = dailyCeiling;
      dailyCapDroppedExercises = cappedExerciseCount;
      // Main's own areas must reflect what SURVIVED the ceiling, not what was
      // selected — otherwise a dropped exercise still steers Warmup/Cool down.
      mainAreas = Array.from(
        new Set(mainBlock.exercises.flatMap((ex) => ex.primaryAreas.flatMap((a) => (a.group ? [a.group] : [])))),
      );
      // Only what SURVIVED the ceiling counts as "used" (ADR-0136) — a dropped
      // exercise never appeared in the plan, so it stays free for another block.
      mainBlock.exercises.forEach((ex) => sessionChosenIds.add(ex.exerciseId));
    }

    const mainAreaBodyAreas: BodyArea[] = mainAreas.map((group) => ({ group }));
    // What Warmup/Cool down should treat as "today's real focus": the explicit
    // ask (`targeting.emphasize`) when there is one, else whatever Main landed
    // on. Deliberately narrower than `mainAreaBodyAreas` — Main's exercise-count
    // filler (added purely to hit its target count once the emphasized pool's
    // distinct patterns run out, see the `main.length < count` fallback above)
    // can pull in an unrelated muscle group that then has no business steering
    // Warmup/Cool down (e.g. one filler squat on a chest/shoulders day
    // shouldn't be able to turn the cool down into an all-legs one — it
    // previously could, because a plain merge treats it exactly like the
    // groups the athlete actually asked for). "Full Body" targeting never
    // matches a per-exercise area (`isFullBodyTargeting`), so it falls back to
    // the full spread, same as having no explicit ask.
    const dominantFocusAreas: BodyArea[] =
      emphasize.length && !isFullBodyTargeting(emphasize) ? emphasize : mainAreaBodyAreas;

    // ADR-0137: a routine's own mobility-modality picks — Main only ever
    // drew from whichever modality it was built around (see routineMainExerciseCount
    // above), so anything else the athlete added to the routine needs a
    // different home. Warmup/Cool down below treat these as priority picks.
    const routineMobilityIds = input.routine
      ? input.routine.exerciseIds.filter((id) => resolveExercise(id)?.modality === 'mobility')
      : [];

    // 1) Warmup — low stakes, but optional (session settings). Time/count are a
    // standing profile preference (ADR-0111); focus blends that preference with
    // today's dominant focus, so e.g. a leg day warms up legs even with no
    // personal warmup focus set. Built here (after Main, so `mainAreas` is
    // known) but unshifted to the front of `blocks`.
    if (includeWarmup) {
      const warmupTotalSeconds = Math.max(60, Math.round(warmupPrefs.totalMinutes * 60));
      // Favor a compact circuit of familiar drills over a long list of one-off
      // movements: 2–3 exercises, repeated for 2–4 short rounds each.
      const warmupPlan = planRepeatedMobility(warmupTotalSeconds, warmupPrefs.activityCount, MOBILITY_HOLD.warmup);
      // Nearly all stretches share movementPattern 'stretch' — don't cap at 1 (ADR-0111).
      const warmup = pickFocusedMobility(
        available,
        warmupPlan.exerciseCount,
        warmupPrefs.focus,
        dominantFocusAreas,
        mainAreaBodyAreas,
        avoid,
        swaps,
        favorites,
        experience,
        sessionChosenIds,
        routineMobilityIds,
      );
      warmup.forEach((e) => sessionChosenIds.add(e.id));
      if (warmup.length) {
        const actualPlan = repeatMobilityForSelection(warmupTotalSeconds, warmup.length, warmupPlan, MOBILITY_HOLD.warmup);
        blocks.unshift({
          modality: 'mobility',
          label: 'Warmup',
          exercises: warmup.map((e) =>
            toPlanned(
              e,
              Array.from({ length: actualPlan.setsPerExercise }, () => ({ durationSec: actualPlan.holdSeconds, isWarmup: true })),
              warmupPrefs.focus.length && emphasizesArea(warmupPrefs.focus, e)
                ? 'stretching focus'
                : emphasizesArea(dominantFocusAreas, e)
                  ? "warms up today's muscles"
                  : undefined,
            ),
          ),
        });
      }
    }

    // 3) Conditioning — when cardio/general matter, it isn't already Main, and
    // the athlete hasn't opted out for today.
    if (includeConditioning && conditioningWouldApply) {
      // ADR-0137: a routine's own cardio pick (e.g. a treadmill finisher
      // tacked onto a lifting day) not already claimed by Main — same
      // priority-not-just-bias treatment as routineMobilityIds above, still
      // behind the hard-safety/fatigue floor.
      const routineConditioningPick = input.routine
        ? available.find(
            (e) =>
              e.modality === 'cardio' &&
              input.routine!.exerciseIds.includes(e.id) &&
              !sessionChosenIds.has(e.id) &&
              !anyAreaMatches(avoid.hardSafety, e) &&
              !anyAreaMatches(avoid.hardFatigue, e),
          )
        : undefined;
      // ADR-0143: Conditioning is a finisher tacked onto a lifting day, not a
      // dedicated cardio session — it has no format control of its own, so
      // it always draws a steady-state pick rather than risking an
      // interval/aerobics-tagged exercise's full multi-round structure as an
      // unplanned afterthought. Falls back to the unfiltered cardio pool if
      // nothing steady-state survived equipment/avoidance filtering.
      const conditioningPool = available.filter((e) => e.modality === 'cardio' && e.movementPattern === 'steady_cardio');
      const cond = routineConditioningPick
        ? [routineConditioningPick]
        : pick(conditioningPool.length > 0 ? conditioningPool : available, 'cardio', 1, emphasize, avoid, swaps, { history: input.history, now: input.plannedFor, favorites, experience, seedChosenIds: sessionChosenIds });
      if (cond.length) {
        blocks.push({
          modality: 'cardio',
          label: 'Conditioning',
          exercises: cond.map((e) =>
            toPlanned(
              e,
              cardioSets(
                e,
                rx,
                effectiveCardioIntent(e, 'basic', Boolean(routineConditioningPick)),
                recommendedCardioWeightKg(e, input),
                input.history,
                input.trainingIntent,
                1,
                volumeScale,
                densePacing,
              ),
            ),
          ),
        });
        cond.forEach((e) => sessionChosenIds.add(e.id));
      }
    }

    // 4) Cool down — closes out the session with stretches/foam-rolling drawn
    // from the catalog's `flowStage: 'cooldown'` pool plus any other static
    // stretch (ADR-0116 + widening below). Mirrors Warmup's standing-profile-
    // preference pattern (ADR-0111); defaults to a compact, repeated circuit of
    // 2–3 movements. Optional (session settings); skipping it frees its minutes
    // for Main (see durationForRx above).
    if (includeCooldown) {
      const cooldownTotalSeconds = Math.max(60, Math.round(cooldownPrefs.totalMinutes * 60));
      // Repeat a small number of stretches/rolls for a few rounds instead of
      // spreading one set across many exercises.
      const cooldownPlan = planRepeatedMobility(cooldownTotalSeconds, cooldownPrefs.activityCount, MOBILITY_HOLD.cooldown);
      // The narrow `flowStage: 'cooldown'` pool (ADR-0116) is only foam-rolling
      // + a handful of relaxation poses — it has no chest/shoulder/back entry
      // at all, so a chest/shoulders day could never get a matching cool down
      // no matter how focus was scored. Union in the same static-stretch pool
      // the Stretch/Yoga flow already draws from (line ~162) so every muscle
      // group actually has a real cool-down candidate.
      const cooldownPool = available.filter(
        (e) => e.flowStage === 'cooldown' || (e.movementPattern === 'stretch' && (e.progression === 'hold' || e.progression === 'reps')),
      );
      const cooldown = pickFocusedMobility(
        cooldownPool,
        cooldownPlan.exerciseCount,
        cooldownPrefs.focus,
        dominantFocusAreas,
        mainAreaBodyAreas,
        avoid,
        swaps,
        favorites,
        experience,
        sessionChosenIds,
        routineMobilityIds,
      );
      if (cooldown.length) {
        const actualPlan = repeatMobilityForSelection(cooldownTotalSeconds, cooldown.length, cooldownPlan, MOBILITY_HOLD.cooldown);
        blocks.push({
          modality: 'mobility',
          label: 'Cool down',
          exercises: cooldown.map((e) =>
            toPlanned(
              e,
              Array.from({ length: actualPlan.setsPerExercise }, () => ({ durationSec: actualPlan.holdSeconds })),
              cooldownPrefs.focus.length && emphasizesArea(cooldownPrefs.focus, e)
                ? 'cool-down focus'
                : emphasizesArea(dominantFocusAreas, e)
                  ? "stretches out today's muscles"
                  : undefined,
            ),
          ),
        });
      }
    }

    fitDurationToBudget(
      blocks,
      targetDurationMin,
      routineMainExerciseCount != null
        ? Math.max(MIN_MAIN_EXERCISES, routineMainExerciseCount)
        : mainIsFullBody ? MIN_MAIN_EXERCISES_FULL_BODY : MIN_MAIN_EXERCISES,
      dailyCapCeiling || undefined,
      densePacing,
    );
    // Invariant, system-wide: a superset/triset needs ≥2 members. Trimming above
    // can pop a grouped exercise and orphan its partner — demote any survivor
    // back to a plain straight set rather than leave a "superset of one."
    demoteOrphanedSupersets(blocks);
    annotateRest(blocks, densePacing);
    roundPlanTimes(blocks);

    const rationale = buildRationale(
      input,
      mainModality,
      emphasize,
      avoid,
      volumeScale,
      warmupPrefs,
      cooldownPrefs,
      intent,
      workoutType,
      overMrvGroupsToday,
      cadenceNote,
      pushedThroughFatigueGroupsToday,
      layoff.note,
      emphasisShortfall,
      systemic.note,
      zoneTestNote(zonePlanToday),
      dailyCapGroups,
      dailyCapCeiling,
      dailyCapDroppedExercises,
      priorityBlockShortfall,
      densePacing,
    );

    return {
      id: `plan-${input.plannedFor}`,
      plannedFor: input.plannedFor,
      estimatedDurationMin: Math.round(estimateDuration(blocks, densePacing) * durationCalibrationFactor(input.history)),
      // ADR-0137: leads with which routine drove today's Main block, ahead
      // of the usual generated-session explanation.
      rationale: input.routine ? `Following your "${input.routine.name}" routine. ${rationale}` : rationale,
      adjustments: swaps.length ? swaps : undefined,
      readiness: input.readiness,
      workoutType,
      workoutOptions: options,
      routineId: input.routine?.id,
      densePacing,
      blocks,
    };
  }

  async adjustDuringSession(
    plan: SessionPlan,
    signal: LiveSignal,
    context?: LiveAdjustmentContext,
  ): Promise<SessionPlan> {
    const finish = (
      nextBlocks: SessionBlock[],
      adjustment: NonNullable<SessionPlan['liveAdjustments']>[number],
    ): SessionPlan => {
      nextBlocks = nextBlocks.filter((block) => block.exercises.length > 0);
      demoteOrphanedSupersets(nextBlocks);
      // Reads plan.densePacing (not a fresh LiveAdjustmentContext field) so a
      // live swap stays consistent with how the rest of THIS session was
      // already timed, rather than the athlete's current standing goal.
      annotateRest(nextBlocks, plan.densePacing);
      roundPlanTimes(nextBlocks);
      return {
        ...plan,
        blocks: nextBlocks,
        estimatedDurationMin: estimateDuration(nextBlocks, plan.densePacing),
        rationale: `${plan.rationale} Live adjustment: ${adjustment.note}`,
        adjustments: [...(plan.adjustments ?? []), adjustment.note],
        liveAdjustments: [...(plan.liveAdjustments ?? []), adjustment],
      };
    };

    // Replacement is a fresh prescription for a compatible movement, never a
    // renamed copy of the original lift's load. The engine only hard-blocks
    // the non-negotiable floor (`replacementAllowed`, matching.ts): same
    // training type, equipment owned, not excluded, not loading today's
    // avoidance flags. Movement-slot/muscle fit, difficulty, and prerequisites
    // are "Suggested" signals in the picker UI, not hard gates here — an
    // athlete can deliberately swap outside their usual pattern (e.g. a squat
    // for a push-up) as long as it's still safe and physically possible.
    if (signal.kind === 'swap' && signal.exerciseId && signal.replacementExerciseId) {
      const replacement = EXERCISES.find((e) => e.id === signal.replacementExerciseId);
      const original = EXERCISES.find((e) => e.id === signal.exerciseId);
      const plannedOriginal = plan.blocks.flatMap((block) => block.exercises)
        .find((exercise) => exercise.exerciseId === signal.exerciseId);
      const compatible = Boolean(
        replacement && original && plannedOriginal && context &&
        replacementAllowed(original, replacement, context, { ignoreEquipment: signal.ignoreEquipment }),
      );
      if (!compatible || !replacement || !plannedOriginal) {
        return finish(plan.blocks.map((block) => ({
          ...block,
          exercises: block.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set })) })),
        })), {
          kind: 'swap',
          exerciseId: signal.exerciseId,
          replacementExerciseId: signal.replacementExerciseId,
          reasonCode: 'rejected_substitution',
          note: 'Replacement rejected: wrong training type, missing equipment, excluded, or loads an area flagged to avoid today.',
        });
      }

      const targetRpe = plannedOriginal.sets.find((set) => !set.isWarmup)?.targetRpe ?? 7;
      const zone = plannedOriginal.zone ?? 'hypertrophy';
      const range = ZONE_SPEC[zone].range;
      const history = context?.history ?? [];
      const unit = signal.weightUnit ?? 'kg';
      const availableWeights = context ? availableWeightsForExercise(replacement, context.equipment) : undefined;
      const rec = recommendPrescription(replacement, history, targetRpe, range, {
        unit,
        available: availableWeights,
        zone,
      });
      // ADR-0144: the replaced exercise's own history has no bearing on this
      // one (methodology: "the replaced exercise's weight is never
      // transferred"), so a replacement with no history of its own gets a
      // real starting suggestion here too, rather than silently landing with
      // no weightKg at all.
      const recWeightKg = rec.weightKg ?? startingWeightKgFor(replacement, availableWeights, unit);
      const originalWorkSets = Math.max(1, workingSetCount(plannedOriginal));
      // ADR-0134: clamp the INCOMING exercise only. A swap must never re-plan the
      // session — every other exercise stays exactly as it is — so the ceiling is
      // enforced by capping the replacement against the headroom left once the
      // original's own sets are removed from the tally. A same-slot, muscle-
      // overlapping swap is a no-op here in the ordinary case; a deliberately
      // different-purpose replacement (allowed since the gate above only
      // enforces training type/equipment/safety, not movement fit) is exactly
      // when this bites — it loads a group the rest of the plan already filled.
      const swapCeiling = context
        ? dailySetCeiling(
            volumeLandmarksFor(
              context.resistanceFocus,
              context.experience ?? 'intermediate',
              context.history ?? [],
              plan.plannedFor,
            ),
          )
        : undefined;
      let replacementWorkSets = originalWorkSets;
      let clampNote: string | null = null;
      if (swapCeiling != null) {
        const tally = tallyOf(plan.blocks, isTrimmableStrength);
        tally.add(loadedGroupsOfPlanned(plannedOriginal), -originalWorkSets);
        const allowed = tally.headroom(loadedGroupsOf(replacement), originalWorkSets, swapCeiling);
        if (allowed < originalWorkSets && allowed > 0) {
          replacementWorkSets = allowed;
          clampNote = `trimmed to ${allowed} sets — today's ${swapCeiling}-set ceiling for this muscle group`;
        }
      }
      const oldDuration = plannedOriginal.sets.find((set) => !set.isWarmup)?.durationSec;
      const replacementSets: PlannedSet[] = Array.from({ length: replacementWorkSets }, () => {
        if (replacement.progression === 'time' || replacement.progression === 'hold') {
          return {
            durationSec: rec.durationSec ?? oldDuration ?? 30,
            targetRpe,
            ...(replacement.loadsWeight && recWeightKg != null ? { weightKg: recWeightKg } : {}),
          };
        }
        return {
          reps: rec.reps ?? rangeCentreOf(range),
          targetRpe,
          ...(replacement.progression === 'weight' && recWeightKg != null ? { weightKg: recWeightKg } : {}),
        };
      });
      const blocks = plan.blocks.map((b) => ({
        ...b,
        exercises: b.exercises.map((ex) => {
          if (ex.exerciseId !== signal.exerciseId) return ex;
          return {
            exerciseId: replacement.id,
            name: replacement.name,
            primaryAreas: replacement.primaryAreas.map((g) => ({ group: g })),
            secondaryAreas: replacement.secondaryAreas?.map((g) => ({ group: g })),
            sets: replacementSets,
            note: joinNotes([`compatible substitute for ${ex.name}`, rec.note ?? null, clampNote]),
            rotationGroup: ex.rotationGroup,
            group: ex.group,
            zone,
            emphasized: ex.emphasized,
          };
        }),
      }));
      return finish(blocks, {
        kind: 'swap',
        exerciseId: signal.exerciseId,
        replacementExerciseId: replacement.id,
        reasonCode: 'compatible_substitution',
        note: `${plannedOriginal.name} replaced with ${replacement.name}; its own history and prescription were used.`,
      });
    }

    let blocks = plan.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((set) => ({ ...set })) })),
    }));

    if (signal.kind === 'pain') {
      blocks = blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((exercise) => exercise.exerciseId === signal.exerciseId
          ? { ...exercise, sets: [], deloaded: true, note: joinNotes([exercise.note ?? null, 'stopped because pain was reported']) }
          : exercise),
      }));
      return finish(blocks, {
        kind: 'pain', exerciseId: signal.exerciseId, area: signal.area,
        severity: signal.severity, symptomType: signal.symptomType,
        reasonCode: 'pain_stop',
        note: `Stopped the affected exercise for ${signal.severity ?? 'unspecified'} ${signal.symptomType ?? 'pain'}${signal.area ? ` at ${describeAreasUnique([signal.area])}` : ''}.`,
      });
    }

    if (signal.kind === 'skip') {
      blocks = blocks.map((block) => ({
        ...block,
        exercises: block.exercises.filter((exercise) => exercise.exerciseId !== signal.exerciseId),
      }));
      return finish(blocks, {
        kind: 'skip', exerciseId: signal.exerciseId, reasonCode: 'skip_repair',
        note: 'Skipped exercise removed; grouping, rest, and session duration were repaired.',
      });
    }

    if (signal.kind === 'time_short') {
      const targetSeconds = Math.max(60, (signal.remainingMinutes ?? Math.max(5, Math.floor((plan.estimatedDurationMin ?? 20) * 0.65))) * 60);
      const secondsFor = (candidateBlocks: SessionBlock[]) =>
        estimateBlocksSeconds(candidateBlocks, (id) => EXERCISES.find((exercise) => exercise.id === id), plan.densePacing);
      // Accessories and optional blocks yield before emphasized/priority work.
      for (const label of ['Cool down', 'Conditioning']) {
        if (secondsFor(blocks) <= targetSeconds) break;
        blocks = blocks.filter((block) => block.label !== label);
      }
      while (secondsFor(blocks) > targetSeconds) {
        const candidates = blocks.flatMap((block, blockIndex) => block.exercises.map((exercise, exerciseIndex) => ({ blockIndex, exerciseIndex, exercise })))
          .filter(({ exercise }) => !exercise.emphasized);
        const candidate = candidates[candidates.length - 1];
        if (!candidate) break;
        const exercise = blocks[candidate.blockIndex].exercises[candidate.exerciseIndex];
        if (exercise.sets.length > 1) exercise.sets.pop();
        else blocks[candidate.blockIndex].exercises.splice(candidate.exerciseIndex, 1);
      }
      return finish(blocks, {
        kind: 'time_short', reasonCode: 'time_trim',
        note: `Session trimmed to the available ${Math.round(targetSeconds / 60)} minutes; priority work was preserved first.`,
      });
    }

    const targetExercises = blocks.flatMap((block) => block.exercises)
      .filter((exercise) => !signal.exerciseId || exercise.exerciseId === signal.exerciseId);
    for (const exercise of targetExercises) {
      if (signal.kind === 'too_hard') {
        const loaded = exercise.sets.some((set) => set.weightKg != null && set.weightKg > 0);
        exercise.sets = exercise.sets.map((set) => loaded && set.weightKg != null
          ? { ...set, weightKg: Math.round(set.weightKg * 0.9 * 2) / 2 }
          : set.reps != null
            ? { ...set, reps: Math.max(1, set.reps - 1) }
            : set.durationSec != null
              ? { ...set, durationSec: Math.max(10, set.durationSec - 10) }
              : set);
      } else if (signal.kind === 'too_easy') {
        const ceiling = ZONE_SPEC[exercise.zone ?? 'hypertrophy'].range.max;
        exercise.sets = exercise.sets.map((set) => set.reps != null && set.reps < ceiling
          ? { ...set, reps: set.reps + 1 }
          : set.durationSec != null
            ? { ...set, durationSec: set.durationSec + 5 }
            : set);
      }
    }
    return finish(blocks, {
      kind: signal.kind,
      exerciseId: signal.exerciseId,
      reasonCode: signal.kind === 'too_hard' ? 'difficulty_reduce' : 'zone_progression',
      note: signal.kind === 'too_hard'
        ? 'Prescription reduced without increasing any variable.'
        : 'One work variable increased within the current training zone.',
    });
  }

  async interpretDebrief(
    _plan: SessionPlan,
    debrief: DebriefInput,
  ): Promise<DebriefResult> {
    const parts: string[] = [];
    if (debrief.overallRpe != null) parts.push(`overall RPE ${debrief.overallRpe}`);
    if (debrief.enjoyment != null) parts.push(`enjoyment ${debrief.enjoyment}/5`);
    if (debrief.wouldDoAgain != null) parts.push(debrief.wouldDoAgain ? 'would do again' : 'prefers another option');
    const issueNote =
      debrief.issues && debrief.issues.length
        ? ` Noted ${debrief.issues.length} issue(s) to work around next time.`
        : '';

    return {
      summary:
        `Logged${parts.length ? ` (${parts.join(', ')})` : ''}.` +
        issueNote +
        ` Fatigue accounting refines your next session (Phase 1 continues).`,
      newConstraintsSuggested: debrief.issues,
    };
  }
}

// ---------------------------------------------------------------------------
// Selection + avoidance (ADR-0106)
// ---------------------------------------------------------------------------

function buildAvoidance(input: SessionContext): AvoidanceModel {
  const fatigue = fatigueAreas(input.fatigue);
  // ADR-0126: issues the athlete reported in recent debriefs are real avoidance
  // input, not just a log entry. Without this the debrief loop is open —
  // see debrief-feedback.ts.
  const fromDebriefs = debriefFeedback(input.history, input.plannedFor);
  const hardSafety: BodyArea[] = [
    ...input.avoidToday.flags.filter((f) => f.severity === 'severe').map((f) => f.area),
    ...input.athlete.constraints.filter((c) => c.severity === 'avoid').map((c) => c.area),
    ...input.targeting.avoid,
    ...fromDebriefs.hardSafety,
  ];
  // Calculated local fatigue is a soft signal. It trims/reorders work, but is
  // not a hard exclusion without corroborating athlete feedback or pain.
  const hardFatigue: BodyArea[] = [];
  const limit: BodyArea[] = [
    ...input.avoidToday.flags
      .filter((f) => f.severity === 'moderate' || f.severity === 'mild')
      .map((f) => f.area),
    ...input.athlete.constraints
      .filter((c) => c.severity === 'limit' || c.severity === 'caution')
      .map((c) => c.area),
    ...fromDebriefs.limit,
  ];
  return {
    hardSafety,
    hardFatigue,
    limit,
    recovery: [...fatigue.high, ...fatigue.severe],
    fatigueByGroup: input.fatigue.byGroup,
  };
}

/**
 * Pick up to `count` exercises of a modality, emphasis-biased, honoring
 * hard-exclusions (with same-pattern substitution). Enforces distinct movement
 * patterns by default (avoids e.g. two squat variants back to back); pass
 * `requireDistinctPattern: false` for pools where that constraint doesn't apply
 * (e.g. warmup/stretch, which mostly share a single 'stretch' pattern — ADR-0111).
 *
 * `avoid.hardSafety` is absolute — nothing overrides it. `avoid.hardFatigue`
 * (severe accumulated fatigue) is excluded UNLESS the candidate is explicitly
 * emphasized today, in which case it's let through (the caller applies a
 * heavier de-load — see `pushedThroughFatigue` in the Main-block builder).
 */
interface PickOptions {
  requireDistinctPattern?: boolean;
  /** ADR-0104: bias toward under-MEV muscle groups. Empty = untracked pool. */
  weeklyVolume?: Partial<Record<MuscleGroup, number>>;
  history?: SessionContext['history'];
  /** Enables the recency term (ADR-0126); omit for pools that shouldn't rotate. */
  now?: number;
  /** Explicit favorites (settings) — a bias, never an override. */
  favorites?: Set<string>;
  /** Drives the EXPERIENCE_FIT scoring term (ADR-0136); defaults to a neutral
   * middle ground for pools that don't track the athlete's level. */
  experience?: ExperienceLevel;
  /** Cross-call state for callers picking against sub-pools of one selection. */
  seedChosenIds?: Set<string>;
  seedUsedPatterns?: Set<string>;
  /**
   * Variant families already used by an earlier sub-pool pick (ADR-0134). Without
   * this the family penalty resets between calls, and the emphasis-quota fill —
   * the exact path that produced six push-up variants — would start from a clean
   * slate and re-pick the family the first pass had already used.
   */
  seedUsedFamilies?: Map<string, number>;
  /**
   * How many of the first picks are treated as anchors (ADR-0126) — the
   * session's stable, measurable lifts. The rest rotate as accessories.
   */
  anchorCount?: number;
  /** Profile for picks beyond `anchorCount`. */
  profile?: SelectionProfile;
}

/**
 * Pick up to `count` exercises of a modality, honoring hard-exclusions (with
 * same-pattern substitution). Enforces distinct movement patterns by default
 * (avoids e.g. two squat variants back to back); pass
 * `requireDistinctPattern: false` for pools where that constraint doesn't apply
 * (e.g. warmup/stretch, which mostly share a single 'stretch' pattern — ADR-0111).
 *
 * Ranking is the weighted score in `selection-score.ts` (ADR-0126), applied
 * greedily so that terms depending on what has already been chosen — pattern
 * saturation — actually respond as the block fills. The first `anchorCount`
 * picks use the anchor profile so the lifts carrying progression stay stable;
 * later picks rotate.
 *
 * `avoid.hardSafety` is absolute — nothing overrides it. `avoid.hardFatigue`
 * (severe accumulated fatigue) is excluded UNLESS the candidate is explicitly
 * emphasized today, in which case it's let through (the caller applies a
 * heavier de-load — see `pushedThroughFatigue` in the Main-block builder).
 * Scoring only ever reorders what these filters already allow.
 */
function pick(
  pool: Exercise[],
  modality: Modality | 'any',
  count: number,
  emphasize: BodyArea[],
  avoid: AvoidanceModel,
  swaps: string[],
  options: PickOptions = {},
): Exercise[] {
  const {
    requireDistinctPattern = true,
    weeklyVolume = {},
    history = [],
    now,
    favorites = new Set<string>(),
    experience = 'intermediate',
    seedChosenIds = new Set<string>(),
    seedUsedPatterns = new Set<string>(),
    seedUsedFamilies,
    anchorCount = 0,
    profile = 'neutral',
  } = options;

  const candidates = pool.filter((e) => (modality === 'any' || e.modality === modality) && !seedChosenIds.has(e.id));
  const { lastPerformedAt, withProgressionBasis, enjoymentByExercise } = buildHistoryIndex(history);

  const chosen: Exercise[] = [];
  const chosenIds = new Set<string>();
  const usedPatterns = new Map<string, number>();
  for (const pattern of seedUsedPatterns) usedPatterns.set(pattern, 1);
  // Shared with the caller by reference when seeded (ADR-0134), so a multi-pass
  // selection accumulates family usage across passes instead of forgetting it.
  const usedFamilies = seedUsedFamilies ?? new Map<string, number>();

  const blockedByFatigue = (ex: Exercise) =>
    anyAreaMatches(avoid.hardFatigue, ex) && !emphasizesArea(emphasize, ex);
  const excluded = (ex: Exercise) => anyAreaMatches(avoid.hardSafety, ex) || blockedByFatigue(ex);
  const patternBlocked = (ex: Exercise) => requireDistinctPattern && usedPatterns.has(ex.movementPattern);

  const context = (): ScoreContext => ({
    emphasize,
    favorites,
    experience,
    weeklyVolume,
    fatigueByGroup: avoid.fatigueByGroup,
    lastPerformedAt,
    withProgressionBasis,
    enjoymentByExercise,
    usedPatterns,
    usedFamilies,
    // Without a clock there is no recency signal; an empty index makes every
    // recency term zero, which is exactly the neutral behavior wanted.
    now: now ?? 0,
    profile: chosen.length < anchorCount ? 'anchor' : profile,
  });

  const bestOf = (predicate: (ex: Exercise) => boolean): Exercise | undefined => {
    const ctx = context();
    let best: Exercise | undefined;
    let bestScore = -Infinity;
    for (const ex of candidates) {
      if (chosenIds.has(ex.id) || !predicate(ex)) continue;
      const score = scoreExercise(ex, ctx);
      if (score > bestScore) {
        bestScore = score;
        best = ex;
      }
    }
    return best;
  };

  const take = (ex: Exercise) => {
    chosen.push(ex);
    chosenIds.add(ex.id);
    usedPatterns.set(ex.movementPattern, (usedPatterns.get(ex.movementPattern) ?? 0) + 1);
    if (ex.variantFamily) usedFamilies.set(ex.variantFamily, (usedFamilies.get(ex.variantFamily) ?? 0) + 1);
  };

  while (chosen.length < count) {
    // Score-best candidate ignoring the safety filters, so a blocked top pick
    // can still be *reported* as avoided rather than silently disappearing —
    // preserving the swap messaging the rationale depends on.
    const wanted = bestOf((ex) => !patternBlocked(ex));
    const allowed = bestOf((ex) => !patternBlocked(ex) && !excluded(ex));

    if (wanted && excluded(wanted)) {
      const sub =
        allowed && (!requireDistinctPattern || allowed.movementPattern === wanted.movementPattern)
          ? allowed
          : bestOf(
              (ex) =>
                !patternBlocked(ex) &&
                !excluded(ex) &&
                (!requireDistinctPattern || ex.movementPattern === wanted.movementPattern),
            );
      if (sub) {
        take(sub);
        swaps.push(`avoided ${wanted.movementPattern} conflict → ${sub.name}`);
        continue;
      }
      swaps.push(`skipped ${wanted.name} (no safe substitute)`);
      // Nothing of that pattern is safe; fall through to the best remaining
      // allowed pick rather than abandoning the slot entirely.
      if (!allowed) break;
      take(allowed);
      continue;
    }

    if (!allowed) break;
    take(allowed);
  }

  return chosen;
}

const FULL_BODY_REGION_ORDER: BodyRegion[] = ['upper_body', 'lower_body', 'core'];

/**
 * Splits a Main-block exercise count across the three trainable regions so
 * selection can't concentrate on 1-2 muscle groups (ADR-0124). Core gets a
 * deliberately smaller base share (single-joint work, less time-costly per
 * strength-set-design methodology §2/§3); remainder favors upper before
 * lower. Degrades gracefully below 3 exercises rather than forcing an empty
 * region.
 */
function fullBodyRegionQuotas(count: number): Record<BodyRegion, number> {
  if (count <= 0) return { upper_body: 0, lower_body: 0, core: 0, full_body: 0 };
  if (count === 1) return { upper_body: 1, lower_body: 0, core: 0, full_body: 0 };
  if (count === 2) return { upper_body: 1, lower_body: 1, core: 0, full_body: 0 };
  const core = Math.max(1, Math.round(count * 0.2));
  const remaining = count - core;
  const upper = Math.ceil(remaining / 2);
  const lower = remaining - upper;
  return { upper_body: upper, lower_body: lower, core, full_body: 0 };
}

/**
 * "Full Body" Main-block selection (ADR-0124): partitions `count` across
 * upper_body/lower_body/core via fullBodyRegionQuotas and runs pick() once
 * per region-filtered pool, so the picks are guaranteed to span the body
 * instead of pick()'s normal emphasis-driven concentration. `avoid`
 * (hardSafety/hardFatigue/limit/recovery) and requireDistinctPattern apply
 * exactly as in plain pick() — each per-region call IS a pick() call, just
 * against a narrower pool, with chosen ids/patterns threaded through so two
 * regions can't pick the same exercise or duplicate a movement pattern.
 */
function pickFullBodySpread(
  pool: Exercise[],
  count: number,
  emphasize: BodyArea[],
  avoid: AvoidanceModel,
  swaps: string[],
  weeklyVolume: Partial<Record<MuscleGroup, number>>,
  history: SessionContext['history'] | undefined,
  favorites: Set<string>,
  now?: number,
  /** Shared family tally (ADR-0134) — threaded through so the spread doesn't
   * pick the same variant family once per region. */
  usedFamilies: Map<string, number> = new Map(),
  experience: ExperienceLevel = 'intermediate',
  modality: Modality = 'strength',
): Exercise[] {
  const quotas = fullBodyRegionQuotas(count);
  const chosenIds = new Set<string>();
  const usedPatterns = new Set<string>();
  const byRegion: Exercise[][] = [];

  for (const region of FULL_BODY_REGION_ORDER) {
    const quota = quotas[region];
    if (quota <= 0) {
      byRegion.push([]);
      continue;
    }
    const regionPool = pool.filter((e) => e.primaryAreas.some((g) => GROUP_TO_REGION[g] === region));
    const picked = pick(regionPool, modality, quota, emphasize, avoid, swaps, {
      weeklyVolume,
      history,
      now,
      favorites,
      experience,
      seedChosenIds: chosenIds,
      seedUsedPatterns: usedPatterns,
      seedUsedFamilies: usedFamilies,
      anchorCount: region === 'lower_body' ? 1 : 0,
      profile: 'accessory',
    });
    let regionChosen = picked;
    for (const e of picked) { chosenIds.add(e.id); usedPatterns.add(e.movementPattern); }

    // Region-scoped backfill: mirrors the top-level "pattern pool ran out
    // before count" fallback in the Main-block builder, but scoped so a
    // shortfall in ONE region doesn't silently borrow from another and erase
    // the spread. requireDistinctPattern=false, same relaxation that
    // fallback uses.
    if (picked.length < quota) {
      const more = pick(regionPool, modality, quota - picked.length, emphasize, avoid, swaps, {
        requireDistinctPattern: false,
        weeklyVolume,
        history,
        now,
        favorites,
        experience,
        seedChosenIds: chosenIds,
        seedUsedPatterns: usedPatterns,
        seedUsedFamilies: usedFamilies,
        profile: 'accessory',
      });
      for (const e of more) { chosenIds.add(e.id); usedPatterns.add(e.movementPattern); }
      regionChosen = [...regionChosen, ...more];
    }
    byRegion.push(regionChosen);
  }

  // Interleave round-robin across regions rather than concatenating
  // region-by-region: fitDurationToBudget trims the Main block from the END
  // when a session doesn't fit its time budget, so a straight concatenation
  // would let a tight budget silently wipe out whichever region was ordered
  // last (core). Interleaving puts one exercise from each region as early as
  // possible, so the spread survives end-trimming as long as at least one
  // exercise per region is kept.
  const chosen: Exercise[] = [];
  const maxLen = Math.max(0, ...byRegion.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const regionChosen of byRegion) {
      if (regionChosen[i]) chosen.push(regionChosen[i]);
    }
  }
  return chosen;
}

/** Merge a standing profile focus (ADR-0111/0116) with another set of areas
 * (today's dominant focus, or the full spread Main trained), deduped by
 * group. Lets Warmup/Cool down match the day's real training without
 * dropping an explicit standing preference (e.g. "always include ankle
 * mobility") that isn't part of today's areas. */
function combineFocusAreas(profileFocus: BodyArea[], sessionAreas: BodyArea[]): BodyArea[] {
  const seen = new Set(profileFocus.map((a) => a.group).filter((g): g is MuscleGroup => g != null));
  const merged = [...profileFocus];
  for (const area of sessionAreas) {
    if (area.group == null || seen.has(area.group)) continue;
    seen.add(area.group);
    merged.push(area);
  }
  return merged;
}

/**
 * Selects a mobility circuit (warmup or cool-down) biased toward `dominantAreas`
 * — today's explicit ask, or whatever Main landed on with no explicit ask —
 * ahead of `fullAreas`, the complete (incidental-inclusive) set of groups Main
 * trained. A plain single-pass merge gives every area in `fullAreas` equal
 * weight, so a single count-filler exercise (see `pickFocusedMobility`'s call
 * sites) can crowd out the day's real focus entirely. Only backfills from
 * `fullAreas` if `dominantAreas` alone can't fill the requested count (e.g.
 * the catalog runs out of distinct chest/shoulder drills).
 *
 * `excludeIds` (ADR-0136) removes exercises already placed in another block
 * this session (e.g. Warmup, when this call is building Cool down) — a hard
 * exclusion, not a bias, so the same stretch can never open and close the
 * same workout.
 */
function pickFocusedMobility(
  pool: Exercise[],
  count: number,
  profileFocus: BodyArea[],
  dominantAreas: BodyArea[],
  fullAreas: BodyArea[],
  avoid: AvoidanceModel,
  swaps: string[],
  favorites: Set<string>,
  experience: ExperienceLevel,
  excludeIds: Set<string> = new Set(),
  /**
   * ADR-0137: a routine's own mobility exercises (e.g. a lat stretch
   * deliberately added to a "pull day") — guaranteed a slot here rather than
   * merely biased toward one, same as Main draws only from a routine's
   * matching-modality picks. Without this, any routine exercise whose
   * modality doesn't match Main's (mobility, when Main is strength/cardio)
   * would be silently dropped from the whole session. Still subject to the
   * same hard-safety/fatigue floor as every other pick.
   */
  priorityIds: string[] = [],
): Exercise[] {
  const chosenIds = new Set<string>(excludeIds);
  const usedPatterns = new Set<string>();
  const priority: Exercise[] = [];
  for (const id of priorityIds) {
    if (priority.length >= count) break;
    if (chosenIds.has(id)) continue;
    const exercise = pool.find((e) => e.id === id);
    if (!exercise) continue;
    if (anyAreaMatches(avoid.hardSafety, exercise) || anyAreaMatches(avoid.hardFatigue, exercise)) continue;
    priority.push(exercise);
    chosenIds.add(exercise.id);
    usedPatterns.add(exercise.movementPattern);
  }
  if (priority.length >= count) return priority;
  const dominant = pick(pool, 'mobility', count - priority.length, combineFocusAreas(profileFocus, dominantAreas), avoid, swaps, {
    requireDistinctPattern: false,
    favorites,
    experience,
    seedChosenIds: chosenIds,
    seedUsedPatterns: usedPatterns,
  });
  for (const e of dominant) { chosenIds.add(e.id); usedPatterns.add(e.movementPattern); }
  if (priority.length + dominant.length >= count) return [...priority, ...dominant];
  const more = pick(pool, 'mobility', count - priority.length - dominant.length, combineFocusAreas(profileFocus, fullAreas), avoid, swaps, {
    requireDistinctPattern: false,
    favorites,
    experience,
    seedChosenIds: chosenIds,
    seedUsedPatterns: usedPatterns,
  });
  return [...priority, ...dominant, ...more];
}

/** ADR-0104: primary groups already at/above this week's maximum-recoverable volume. */
function exerciseOverMrv(
  exercise: Exercise,
  weeklyVolume: Partial<Record<MuscleGroup, number>>,
  landmarks: { mev: number; mrv: number },
): MuscleGroup[] {
  return exercise.primaryAreas.filter((group) => volumeStatus(weeklyVolume[group] ?? 0, landmarks) === 'over');
}

// ADR-0114 v3: Yoga's stage order — an opening pose, muscle-agnostic work
// through the middle stages, closing on a restorative pose. The whole
// sequence repeats together (uniform round count, see buildStageFlow). Stretch
// doesn't use stage ordering at all (it's target-driven — see buildStretchFlow).
const YOGA_STAGE_ORDER: FlowStage[] = [
  'center',
  'warmup',
  'standing',
  'balance',
  'backbend',
  'seated',
  'cooldown',
];

// ADR-0404: Barre's stage order — a real class shape (open, warm up, thigh
// work at the barre, seat/glute work, core, arms, closing stretch), the same
// "one exercise per ordered stage" mechanism as Yoga, just with barre-specific
// middle stages instead of yoga's balance/backbend/seated.
const BARRE_STAGE_ORDER: FlowStage[] = [
  'center',
  'warmup',
  'thighs',
  'seat',
  'core',
  'arms',
  'cooldown',
];

// ADR-0407: Pilates' stage order — a mat-Pilates class shape (open, warm up,
// core-anchored control work, spinal articulation, standing integration,
// closing stretch). Reuses the existing stage vocabulary entirely (no new
// FlowStage values) — 'backbend' stands in for Pilates' spinal-articulation
// work (roll-ups, swimming, extension) and 'standing' for its
// standing/balance integration, rather than adding Pilates-specific stages
// before real content has been authored to justify them.
const PILATES_STAGE_ORDER: FlowStage[] = [
  'center',
  'warmup',
  'core',
  'backbend',
  'standing',
  'cooldown',
];

function stageOf(ex: Exercise): FlowStage {
  return ex.flowStage ?? 'standing';
}

interface StageFlow {
  exercises: PlannedExercise[];
  /** Number of times the whole sequence repeats (0 if no exercise was found). */
  rounds: number;
}

/**
 * Yoga/Barre (ADR-0114 v3, ADR-0404): one exercise per stage across the full
 * `stageOrder` (a real opening → flow → closing sequence, not picked
 * arbitrarily), with the WHOLE sequence repeated together for as many WHOLE
 * rounds as the time budget naturally allows. Every exercise gets the same
 * round count — no mismatched "the last one only gets 1 set while the rest
 * get 2" (a real bug report from yoga v2's opening/closing-stay-singular
 * design). Hold length is fixed within `holdSpec`'s safe range — round count
 * is the only lever, so the sequence's natural duration is never compressed
 * to hit a target time (a 30-min sequence run at a 30-min budget yields
 * exactly one round, not two fragmented halves). `avoid` fully applies
 * (including targeting overriding severe fatigue, Part 1); `emphasize`
 * deliberately does not bias selection — both Yoga and Barre stay
 * muscle-agnostic-by-stage by design (the stage itself is what targets a
 * region, not a per-athlete emphasis bias).
 */
function buildStageFlow(
  pool: Exercise[],
  stageOrder: FlowStage[],
  holdSpec: { hold: number; min: number; max: number },
  requestedMinutes: number | undefined,
  avoid: AvoidanceModel,
  swaps: string[],
  favorites: Set<string>,
  paceScale: number,
  routineExerciseIds?: string[],
): StageFlow {
  const holdSeconds = Math.max(holdSpec.min, Math.min(holdSpec.max, Math.round(holdSpec.hold * paceScale)));
  const perPoseSeconds = holdSeconds + MOBILITY_ACTIVITY_OVERHEAD_SEC;

  let sequence: Exercise[];
  if (routineExerciseIds) {
    // ADR-0137 v2: the one-per-stage pick below silently drops a routine
    // exercise whenever two of the athlete's own picks share a stage (e.g.
    // two cooldown poses) — the same "never silently drop a routine
    // exercise" rule Main and Stretch already follow means a routine's full
    // list is the sequence, ordered by stage (ties keep the athlete's own
    // order), not filtered down to one per stage. Skips an unsafe-today
    // exercise rather than substituting one outside the athlete's list.
    const stageIndex = (e: Exercise) => {
      const index = stageOrder.indexOf(stageOf(e));
      return index === -1 ? stageOrder.length : index;
    };
    const candidates = routineExerciseIds
      .map((id) => pool.find((e) => e.id === id))
      .filter((e): e is Exercise => {
        if (!e) return false;
        if (anyAreaMatches(avoid.hardSafety, e) || anyAreaMatches(avoid.hardFatigue, e)) {
          swaps.push(`skipped ${e.name} (no safe substitute)`);
          return false;
        }
        return true;
      });
    sequence = candidates
      .map((e, originalIndex) => ({ e, originalIndex }))
      .sort((a, b) => stageIndex(a.e) - stageIndex(b.e) || a.originalIndex - b.originalIndex)
      .map(({ e }) => e);
  } else {
    const usedIds = new Set<string>();
    const pickStage = (stage: FlowStage): Exercise | undefined => {
      const candidates = pool.filter((e) => stageOf(e) === stage && !usedIds.has(e.id));
      // 'any': the pool is already scoped to a single movementPattern (yoga_flow
      // or barre_flow) upstream — Barre mixes 'strength' (pulse/isometric) and
      // 'mobility' (warmup/cooldown) entries within that pattern, so filtering
      // again by a single modality here would silently drop real candidates.
      const picked = pick(candidates, 'any', 1, [], avoid, swaps, { requireDistinctPattern: false, favorites })[0];
      if (picked) usedIds.add(picked.id);
      return picked;
    };
    sequence = stageOrder.map(pickStage).filter((e): e is Exercise => e != null);
  }

  const naturalRoundSeconds = sequence.length * perPoseSeconds;
  // No requested duration (or one too tight for even a single round) still
  // yields exactly one natural pass — never a fragmented, compressed one.
  const requestedSeconds = requestedMinutes
    ? Math.max(60, Math.round(requestedMinutes * 60))
    : naturalRoundSeconds;
  const rounds = naturalRoundSeconds > 0 ? Math.max(1, Math.floor(requestedSeconds / naturalRoundSeconds)) : 0;

  const exercises = sequence.map((pose) =>
    toPlanned(pose, Array.from({ length: rounds }, () => ({ durationSec: holdSeconds }))),
  );

  return { exercises, rounds };
}

// Cap the rotation's membership — a deliberate handful of muscles, never a
// long unfocused list ("noise"). When nothing is explicitly targeted, this
// default set stands in as "the muscles targeted" so a stretch session is
// always built around specific muscles, never picked arbitrarily. Also
// doubles as the ceiling on total exercises once a second/third stretch per
// muscle gets added for variety (see MAX_SINGLE_STRETCH_SEC below).
const MAX_STRETCH_MUSCLES = 5;
const DEFAULT_STRETCH_MUSCLES: MuscleGroup[] = ['hamstrings', 'quads', 'chest', 'shoulders', 'lower_back'];
// Outer sanity ceiling on rounds — in practice MAX_SINGLE_STRETCH_SEC (a
// stretch should never accumulate more than ~3 min of hold time) bites first
// at any realistic hold length and keeps rounds well under this.
const MAX_STRETCH_ROUNDS = 5;
// Dynamic (reps-based) stretches don't have a "hold" to lengthen — a fixed,
// stretch-science rep count instead (10-15 reps).
const STRETCH_DYNAMIC_REPS = 12;
const STRETCH_DYNAMIC_ROUND_SEC = 30;

/**
 * Stretch (ADR-0114 v3): built around explicit targeting, not a stage-ordered
 * sequence — a capped set of targeted muscles (MAX_STRETCH_MUSCLES), each
 * represented by one exercise, **rotated together for multiple whole
 * rounds** rather than held once and stopped (v2's bug: a request for 20
 * minutes landed at ~3). Rounds are the primary lever, but once rotating
 * would push a single stretch's accumulated hold time past
 * MAX_SINGLE_STRETCH_SEC, the extra time budget buys another distinct
 * stretch on the same muscle instead of a longer hold or more rounds on the
 * one exercise — a hold has no added benefit past ~60s, and the catalog has
 * enough variety per muscle for this now. Dynamic (reps) stretches never
 * gain a hold — they rotate for the same round count at a fixed correct rep
 * range.
 */
function buildStretchFlow(
  pool: Exercise[],
  targetAreas: BodyArea[],
  avoid: AvoidanceModel,
  swaps: string[],
  favorites: Set<string>,
  paceScale: number,
  requestedMinutes: number | undefined,
  routineExerciseIds?: string[],
): PlannedExercise[] {
  const spec = MOBILITY_HOLD.stretch;
  const baseHold = Math.max(spec.min, Math.min(spec.max, Math.round(spec.hold * paceScale)));

  // 1) The rotation's membership: explicit targeting (capped), or a sensible
  // default set of major muscles when nothing is targeted.
  const explicitGroups = targetAreas.map((a) => a.group).filter((g): g is MuscleGroup => g != null);
  const groups = (explicitGroups.length ? explicitGroups : DEFAULT_STRETCH_MUSCLES).slice(0, MAX_STRETCH_MUSCLES);

  const usedIds = new Set<string>();
  let chosen: Exercise[];
  if (routineExerciseIds) {
    // ADR-0137 v2: a routine fixes WHICH stretches rotate — its own ordered
    // list becomes the rotation directly (not one-per-muscle-group), skipping
    // an unsafe-today pick rather than substituting one outside the athlete's
    // own list (mirrors the Main block's routine rule).
    chosen = routineExerciseIds
      .map((id) => pool.find((e) => e.id === id))
      .filter((e): e is Exercise => {
        if (!e) return false;
        if (anyAreaMatches(avoid.hardSafety, e) || anyAreaMatches(avoid.hardFatigue, e)) {
          swaps.push(`skipped ${e.name} (no safe substitute)`);
          return false;
        }
        return true;
      });
    chosen.forEach((e) => usedIds.add(e.id));
  } else {
    chosen = [];
    for (const group of groups) {
      const candidates = pool.filter((e) => !usedIds.has(e.id));
      // requireDistinctPattern=false: nearly all stretches share movementPattern
      // 'stretch' (ADR-0111's reasoning applies here too), so distinctness comes
      // from `usedIds` instead.
      const picked = pick(candidates, 'mobility', 1, [{ group }], avoid, swaps, { requireDistinctPattern: false, favorites })[0];
      if (picked) {
        chosen.push(picked);
        usedIds.add(picked.id);
      }
    }
  }
  if (!chosen.length) return [];

  // 2) Rounds first (rotate through the muscles), then fine-tune hold length
  // to actually land near the requested time — "rotations and longer holds."
  const roundSecondsAt = (list: Exercise[], hold: number) =>
    list.reduce(
      (sum, e) => sum + MOBILITY_ACTIVITY_OVERHEAD_SEC + (e.progression === 'reps' ? STRETCH_DYNAMIC_ROUND_SEC : hold),
      0,
    );
  const requestedSeconds = requestedMinutes
    ? Math.max(60, Math.round(requestedMinutes * 60))
    : roundSecondsAt(chosen, baseHold);

  // For a candidate rotation, what rounds/hold would this land on? Rounds is
  // solved first (at the paceScale-scaled baseHold, just to size the
  // rotation), then hold is fine-tuned against the ACTUAL rounds to land near
  // requestedSeconds — the same two-step "rotations and longer holds" plan as
  // before, just factored out so the cap check below can run it speculatively.
  const solveFor = (list: Exercise[]) => {
    const rounds = Math.max(1, Math.min(MAX_STRETCH_ROUNDS, Math.round(requestedSeconds / roundSecondsAt(list, baseHold))));
    const dynamicCount = list.filter((e) => e.progression === 'reps').length;
    const holdCount = list.length - dynamicCount;
    const overheadTotal = list.length * MOBILITY_ACTIVITY_OVERHEAD_SEC;
    const dynamicTotal = dynamicCount * STRETCH_DYNAMIC_ROUND_SEC;
    const idealHold = holdCount > 0 ? (requestedSeconds / rounds - overheadTotal - dynamicTotal) / holdCount : spec.hold;
    const hold = Math.max(spec.min, Math.min(spec.max, Math.round(idealHold)));
    return { rounds, hold };
  };

  let { rounds, hold } = solveFor(chosen);
  // Piling more rounds/hold onto the same handful of stretches to fill a big
  // time budget just means holding one stretch for minutes on end. Once the
  // naive fill would push a stretch past MAX_SINGLE_STRETCH_SEC, reach for
  // another distinct one targeting the same area instead — the EMPHASIS
  // scoring term dominates (selection-score.ts), so `pick` reliably stays
  // on-muscle when a second option exists, and the catalog has enough
  // variety per muscle for this now.
  while (!routineExerciseIds && rounds * hold > MAX_SINGLE_STRETCH_SEC && chosen.length < MAX_STRETCH_MUSCLES) {
    const group = groups[chosen.length % groups.length];
    const extra = pick(pool.filter((e) => !usedIds.has(e.id)), 'mobility', 1, [{ group }], avoid, swaps, {
      requireDistinctPattern: false,
      favorites,
    })[0];
    if (!extra) break;
    chosen.push(extra);
    usedIds.add(extra.id);
    ({ rounds, hold } = solveFor(chosen));
  }

  // Safety net: if the pool/ceiling ran out before the cap was satisfied,
  // trim hold rather than exceed it.
  const holdSeconds = Math.min(hold, Math.max(spec.min, Math.floor(MAX_SINGLE_STRETCH_SEC / rounds)));

  return chosen.map((e) => {
    const note = emphasizesArea(targetAreas, e) ? 'targets your emphasis' : undefined;
    if (e.progression === 'reps') {
      return toPlanned(e, Array.from({ length: rounds }, () => ({ reps: STRETCH_DYNAMIC_REPS })), note);
    }
    return toPlanned(e, Array.from({ length: rounds }, () => ({ durationSec: holdSeconds })), note);
  });
}

function joinNotes(notes: (string | null)[]): string | undefined {
  const kept = notes.filter((n): n is string => !!n);
  return kept.length ? kept.join('; ') : undefined;
}

// ---------------------------------------------------------------------------
// Prescription (ADR-0103/0104 refine these numbers later)
// ---------------------------------------------------------------------------

/** Baseline the duration lever scales against — the fixed defaults below were
 * tuned around a ~30 min session. 10-60 min UI range (ADR pending). */
const BASELINE_DURATION_MIN = 30;
const MIN_TARGET_DURATION_MIN = 10;
const MAX_TARGET_DURATION_MIN = 60;

/** How far the duration lever pushes prescription vs. count: counts move
 * (almost) linearly with duration, reps/sets move gently so a short session
 * still feels like real work, not just fewer, tinier sets. */
function durationScale(targetDurationMin?: number): number {
  if (!targetDurationMin) return 1;
  const clamped = Math.max(MIN_TARGET_DURATION_MIN, Math.min(MAX_TARGET_DURATION_MIN, targetDurationMin));
  return clamped / BASELINE_DURATION_MIN;
}

function prescriptionFor(exp: ExperienceLevel, targetDurationMin?: number): Prescription {
  // Strength work is scheduled in groups of 3-5 sets (methodology §3); the budget
  // balancer nudges within that band. Baseline sits at the low end so a lift
  // reads as a real set-block, not one or two token sets.
  const mainSets = exp === 'beginner' ? 3 : exp === 'intermediate' ? 3 : 4;
  const mainReps = 10;
  const cardioSeconds = 1200;
  // Reps/sets/cardio duration move mildly with the duration lever (0.7x-1.3x) —
  // exercise count (below) carries most of the adjustment.
  const scale = Math.min(1.3, Math.max(0.7, durationScale(targetDurationMin)));
  return {
    mainSets: Math.max(1, Math.round(mainSets * scale)),
    // ADR-0128: reps are NOT scaled by session length any more. They belong to
    // the training zone, so duration moves volume (exercises and sets) instead.
    // The old coupling was inverted — asking for a longer session made the work
    // lighter and higher-rep, and a 10-minute session was the only way to reach
    // a strength rep range at all.
    mainReps,
    mainRpe: exp === 'beginner' ? 6 : 7,
    coreSeconds: 30,
    cardioSeconds: Math.round(cardioSeconds * scale),
  };
}

// Exercise counts are an initial estimate; the real-time budget balancer
// (fitDurationToBudget) does the final sizing in whole set-blocks. Ceilings are
// deliberately sane — a long lifting session is ~5-6 lifts of 3-5 sets, not 8-9
// lifts of 2 (methodology §4).
function mainCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 3 : exp === 'intermediate' ? 4 : 5;
  return Math.max(2, Math.min(6, Math.round(base * durationScale(targetDurationMin))));
}

function bodybuildingCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 3 : exp === 'intermediate' ? 5 : 6;
  return Math.max(2, Math.min(7, Math.round(base * durationScale(targetDurationMin))));
}

// A full-body toning day needs enough distinct exercises to meaningfully span
// upper/lower/core (fullBodyRegionQuotas needs ≥3 to guarantee every region),
// so the floor is 3 — sized a step above bodybuildingCount since breadth, not
// per-lift volume, is the mechanism here (ADR-0124).
function sculptingCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 4 : exp === 'intermediate' ? 6 : 7;
  return Math.max(3, Math.min(8, Math.round(base * durationScale(targetDurationMin))));
}

/**
 * The minimum number of Main slots that must genuinely train an emphasized area
 * (ADR-0126). `balanced` reserves about half the block — enough that the day
 * unmistakably IS a shoulders day, while leaving room for the rest of the body.
 * `priority` is the explicit override and hands over the whole block.
 *
 * Returns 0 when there is nothing to emphasize, so sessions without an explicit
 * ask are completely unaffected.
 */
/**
 * Age-aware adjustments the engine makes (ADR-0127). All conservative, all
 * no-ops when `birthYear` is absent.
 */
const AGE = {
  /** Beyond this, warm-ups get a floor and max days get stricter. */
  OLDER_ATHLETE: 50,
  /** Minimum warm-up minutes for an older athlete — trainers lengthen these. */
  WARMUP_FLOOR_MIN: 8,
  /** Max-day cadence is stretched by this much for an older athlete. */
  MAX_DAY_CADENCE_FACTOR: 1.5,
} as const;

function isOlderAthlete(input: SessionContext): boolean {
  const age = ageYearsOf(input.athlete, input.plannedFor);
  return age != null && age >= AGE.OLDER_ATHLETE;
}

function emphasisQuotaFor(count: number, emphasize: BodyArea[], mode: EmphasisMode): number {
  if (!emphasize.length || count <= 0) return 0;
  if (mode === 'priority') return count;
  return Math.min(count, Math.max(2, Math.ceil(count / 2)));
}

/**
 * Turn the zone plan's test exercises into actual ramp + AMRAP sets (ADR-0128).
 *
 * Generalizes what `applyMaxDayRecommendation` did for strength-only max days.
 * That version was gated behind `athlete.maxDay`, which no screen ever sets, so
 * in practice it never fired; testing is now scheduled by the zone rotation and
 * the explicit config survives only as a tiebreak over *which* lift is chosen.
 *
 * A strength test ramps to a load above the working weight and asks for as many
 * clean reps as possible. An endurance test stays at the working (light) load
 * and asks the same question — which is why it also works on bodyweight
 * movements, where there is no load to ramp.
 */
function applyZoneTests(
  block: SessionBlock,
  input: SessionContext,
  zonePlan: Map<string, ZoneAssignment>,
): void {
  const unit = input.athlete.weightUnit ?? 'kg';

  for (const planned of block.exercises) {
    const assignment = zonePlan.get(planned.exerciseId);
    if (!assignment?.isTest) continue;
    const catalog = EXERCISES.find((exercise) => exercise.id === planned.exerciseId);
    if (!catalog) continue;
    const available = availableWeightsForExercise(catalog, input.equipment);
    const snap = (kg: number) => snapToSensibleWeight(Math.round(kg * 2) / 2, unit, available);
    const workingWeight = planned.sets.find((set) => set.weightKg != null)?.weightKg;

    if (assignment.zone === 'strength') {
      // A heavy attempt needs a known load to ramp from; without one there is
      // nothing to be heavy *relative to*.
      if (workingWeight == null || workingWeight <= 0) continue;
      const topWeight = snap(workingWeight * STRENGTH_TEST_LOAD_FACTOR);
      planned.sets = [
        { reps: 8, weightKg: snap(topWeight * 0.5), targetRpe: 4, isWarmup: true },
        { reps: 3, weightKg: snap(topWeight * 0.75), targetRpe: 6, isWarmup: true },
        { reps: ZONE_SPEC.strength.range.min, weightKg: topWeight, targetRpe: TEST_RPE, isCalibration: true },
        ...planned.sets,
      ];
      planned.note = joinNotes([
        planned.note ?? null,
        'strength test — after the warm-up sets, push for as many clean reps as you can. This sets your loads for the next few weeks',
      ]);
      continue;
    }

    // Endurance: the load is already light, so one easy ramp then rep out.
    const warmup: PlannedSet = workingWeight != null
      ? { reps: 10, weightKg: snap(workingWeight * 0.5), targetRpe: 3, isWarmup: true }
      : { reps: 10, targetRpe: 3, isWarmup: true };
    planned.sets = [
      warmup,
      {
        reps: ZONE_SPEC.endurance.range.min,
        ...(workingWeight != null ? { weightKg: workingWeight } : {}),
        targetRpe: TEST_RPE,
        isCalibration: true,
      },
      ...planned.sets.slice(1),
    ];
    planned.note = joinNotes([
      planned.note ?? null,
      'endurance test — light load, as many good reps as you can',
    ]);
  }
}

/**
 * Lifts the athlete explicitly scheduled for testing (`AthleteProfile.maxDay`)
 * and which are due. No screen currently writes that config, so this is
 * effectively inert today — kept so an explicit preference, once exposed, still
 * decides *which* lift gets tested rather than being silently ignored.
 */
function explicitlyDueTestIds(chosen: Exercise[], input: SessionContext): Set<string> {
  const due = new Set<string>();
  for (const exercise of chosen) {
    const cadenceDays = maxDayCadenceDays(exercise, input);
    if (cadenceDays == null) continue;
    if (!hasPriorWeightedWork(exercise.id, input.history)) continue;
    if (isMaxDayDue(exercise.id, cadenceDays, input.history, input.plannedFor)) due.add(exercise.id);
  }
  return due;
}

function maxDayCadenceDays(exercise: Exercise, input: SessionContext): number | undefined {
  const prefs = input.athlete.maxDay;
  const stretch = (days: number) =>
    isOlderAthlete(input) ? Math.round(days * AGE.MAX_DAY_CADENCE_FACTOR) : days;
  const byExercise = prefs?.byExercise?.[exercise.id];
  if (byExercise != null) return byExercise > 0 ? stretch(byExercise) : undefined;
  const byMuscle = exercise.primaryAreas
    .map((group) => prefs?.byMuscleGroup?.[group])
    .find((days): days is number => days != null);
  const base = byMuscle != null && byMuscle > 0 ? byMuscle : undefined;
  // ADR-0127: testing a rep max is a higher-stakes ask as you get older, so the
  // gap between attempts stretches.
  return base != null ? stretch(base) : undefined;
}

function hasPriorWeightedWork(exerciseId: string, history: SessionContext['history']): boolean {
  return history.some((record) => record.performed.some((exercise) =>
    exercise.exerciseId === exerciseId && exercise.sets.some((set) => set.completed && set.weightKg != null && set.weightKg > 0),
  ));
}

function isMaxDayDue(exerciseId: string, cadenceDays: number, history: SessionContext['history'], now: number): boolean {
  const last = history.flatMap((record) => record.performed
    .filter((exercise) => exercise.exerciseId === exerciseId && exercise.sets.some((set) => set.completed && set.isCalibration))
    .map(() => record.completedAt ?? record.plannedFor)).sort((a, b) => b - a)[0];
  return last == null || now - last >= cadenceDays * 86_400_000;
}

function isMaxDayReady(input: SessionContext, avoid: AvoidanceModel): boolean {
  if ((input.readiness.energy ?? 3) <= 2 || (input.readiness.sleepQuality ?? 3) <= 2 || (input.readiness.soreness ?? 1) >= 4) return false;
  // ADR-0127: an older athlete needs an unambiguously good day, not merely a
  // not-bad one, before being invited to test a max.
  if (isOlderAthlete(input)) {
    if ((input.readiness.energy ?? 3) < 3 || (input.readiness.sleepQuality ?? 3) < 3 || (input.readiness.soreness ?? 1) > 2) return false;
  }
  // Unaffected by targeting overriding hardFatigue elsewhere (pick()) — testing a
  // new max is a higher-stakes ask than a normal working set, so any hard
  // exclusion (safety OR severe fatigue) blocks a max-day attempt regardless.
  return avoid.hardSafety.length === 0 && avoid.hardFatigue.length === 0 && avoid.recovery.length === 0;
}

/** More exercises than the default single-cardio-item Main/Conditioning pick,
 * since a 'cardio' workoutType session is the whole workout, not one block of it. */
function cardioFocusCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 2 : exp === 'intermediate' ? 3 : 4;
  return Math.max(1, Math.min(6, Math.round(base * durationScale(targetDurationMin))));
}

/** An aerobics circuit rotates through several distinct stations at once
 * (ADR-0138) rather than repeating one exercise like base/interval cardio —
 * more stations than a single-exercise pick, capped so no station's turn
 * gets too short to be meaningful. */
function aerobicsStationCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 4 : exp === 'intermediate' ? 5 : 6;
  return Math.max(3, Math.min(6, Math.round(base * durationScale(targetDurationMin))));
}

/**
 * Interval Main can legitimately be a single repeated exercise (e.g. bike or
 * track sprints) — unlike a circuit, which is inherently multi-station — but
 * locking EVERY interval session to exactly one exercise regardless of
 * length or experience (ADR-0143) is what produced a single exercise
 * carrying the whole session's rounds. Scales the same way the other cardio
 * counts do; the floor of 1 keeps a short/beginner session's genuinely
 * single-movement interval structure legitimate.
 */
function intervalStationCount(exp: ExperienceLevel, targetDurationMin?: number): number {
  const base = exp === 'beginner' ? 1 : exp === 'intermediate' ? 2 : 3;
  return Math.max(1, Math.min(4, Math.round(base * durationScale(targetDurationMin))));
}

/** Modalities with no real "second station" to rotate to — a treadmill or a
 * bike IS the workout, so an interval session drawing only from these stays
 * a single repeated exercise regardless of `intervalStationCount`'s scaling. */
const SINGLE_FOCUS_CARDIO_MODALITIES = new Set<CardioModality>(['running_walking', 'machine_cardio']);

/** True only when EVERY candidate in the matched pool is single-focus — a
 * pool mixing running with, say, bodyweight interval work is not single-
 * focus, and keeps the normal scaled station count. */
function isSingleFocusCardioPool(pool: Exercise[]): boolean {
  return pool.length > 0 && pool.every((exercise) => exercise.cardioModality != null && SINGLE_FOCUS_CARDIO_MODALITIES.has(exercise.cardioModality));
}

/**
 * Effective rules for TIMED MOBILITY work (warmup drills, cool-down stretches,
 * yoga poses) — methodology §7. A hold is a short, sensible duration; you never
 * hold a single pose for 5 minutes. The number of activities is derived to fill
 * the block's time at that hold length, so a block is several short holds rather
 * than one endless one.
 */
const MOBILITY_HOLD = {
  warmup: { hold: 40, min: 20, max: 60 },
  cooldown: { hold: 45, min: 30, max: 75 },
  stretch: { hold: 45, min: 30, max: 60 },
  yoga: { hold: 55, min: 30, max: 90 },
  // ADR-0404: barre holds/pulses run at a brisker tempo than yoga's static
  // holds — shorter default, narrower range.
  barre: { hold: 40, min: 20, max: 60 },
  // ADR-0407: Pilates control work (roll-ups, leg circles, plank holds) sits
  // between barre's brisk pulses and yoga's long static holds.
  pilates: { hold: 45, min: 25, max: 70 },
} as const;

/**
 * No single stretch should ever accumulate more than this much total hold
 * time (rounds × hold) before the circuit moves to a different one — a
 * single hold has no added flexibility benefit past ~60s, so repeating it
 * back-to-back to fill a time budget is wasted rounds, not extra stretch. Once
 * a circuit would need more than this on one stretch, add another distinct
 * stretch instead (the catalog has enough variety per muscle for this now).
 * This is inherently a PER-SIDE cap: a `unilateral` stretch is prescribed and
 * logged per side, so its real both-sides time can run up to double this —
 * that's the "unless it's for 2 legs or 2 arms" exception, and it falls out
 * of the existing per-side convention (see `workSecondsFor` in timing.ts)
 * rather than needing special-casing here.
 */
const MAX_SINGLE_STRETCH_SEC = 180;
/** Ceiling on how many distinct stretches a warmup/cooldown circuit grows to
 * when filling a long time budget without breaching MAX_SINGLE_STRETCH_SEC —
 * matches MAX_STRETCH_MUSCLES's "a deliberate handful, never a long
 * unfocused list" reasoning for the dedicated Stretch flow. */
const MAX_MOBILITY_EXERCISES = 5;
// Approx wall-clock a timed mobility activity adds beyond its hold (transition in,
// brief reset) — used to translate a time budget into an activity count.
const MOBILITY_ACTIVITY_OVERHEAD_SEC = 25;

interface HoldPlan {
  count: number;
  hold: number;
}

interface RepeatedMobilityPlan {
  exerciseCount: number;
  setsPerExercise: number;
  totalSets: number;
  holdSeconds: number;
}

/**
 * Choose how many timed activities to schedule and how long to hold each, so the
 * holds land within [min, max] and roughly fill `totalSeconds`. `minCount` is a
 * floor (e.g. a user's configured activity count); `scale` folds in pace/
 * readiness. Used by Warmup/Cooldown's repeated-circuit planning below; Yoga
 * and Stretch derive their own structure directly (buildYogaFlow/buildStretchFlow).
 */
function planMobilityHolds(
  totalSeconds: number,
  minCount: number,
  spec: { hold: number; min: number; max: number },
  scale = 1,
): HoldPlan {
  const hold = Math.max(spec.min, Math.min(spec.max, Math.round(spec.hold * scale)));
  const derived = Math.round(totalSeconds / (hold + MOBILITY_ACTIVITY_OVERHEAD_SEC));
  return { count: Math.max(1, minCount, derived), hold };
}

const MOBILITY_TRANSITION_SEC = 10;
const MOBILITY_REST_SEC = 15;

/**
 * Turn a mobility time budget into a compact repeated circuit. The previous
 * activity math still informs total work, but it is distributed across fewer
 * movements so the athlete can settle into each drill or stretch — capped at
 * a compact 3 by default, but a long enough time budget grows past that
 * (up to MAX_MOBILITY_EXERCISES) rather than piling more sets onto the same
 * few stretches (see MAX_SINGLE_STRETCH_SEC on repeatedMobilityPlanFor).
 */
function planRepeatedMobility(
  totalSeconds: number,
  activityPreference: number,
  spec: { hold: number; min: number; max: number },
): RepeatedMobilityPlan {
  const equivalentActivities = planMobilityHolds(totalSeconds, 1, spec).count;
  let exerciseCount = Math.max(2, Math.min(3, Math.min(activityPreference || 2, Math.ceil(equivalentActivities / 2))));
  let setsPerExercise = Math.max(2, Math.min(4, Math.ceil(equivalentActivities / exerciseCount)));
  let raw = rawMobilityHold(totalSeconds, exerciseCount, setsPerExercise, spec);
  // Checked against the UNCAPPED hold — repeatedMobilityPlanFor's own safety
  // net would otherwise silently absorb the overage by trimming sets before
  // this loop ever saw a violation, leaving the time budget under-filled
  // instead of adding the extra stretch it was actually asking for.
  while (setsPerExercise * raw > MAX_SINGLE_STRETCH_SEC && exerciseCount < MAX_MOBILITY_EXERCISES) {
    exerciseCount += 1;
    setsPerExercise = Math.max(2, Math.min(4, Math.ceil(equivalentActivities / exerciseCount)));
    raw = rawMobilityHold(totalSeconds, exerciseCount, setsPerExercise, spec);
  }
  return repeatedMobilityPlanFor(totalSeconds, exerciseCount, setsPerExercise, spec);
}

/** Refit the circuit if limited equipment or avoidance leaves fewer movements. */
function repeatMobilityForSelection(
  totalSeconds: number,
  selectedExercises: number,
  plan: RepeatedMobilityPlan,
  spec: { hold: number; min: number; max: number },
): RepeatedMobilityPlan {
  const exerciseCount = Math.max(1, selectedExercises);
  const setsPerExercise = Math.max(2, Math.min(4, Math.ceil(plan.totalSets / exerciseCount)));
  return repeatedMobilityPlanFor(totalSeconds, exerciseCount, setsPerExercise, spec);
}

/** The hold length a circuit's numbers imply, before clamping to [min, max]. */
function rawMobilityHold(
  totalSeconds: number,
  exerciseCount: number,
  setsPerExercise: number,
  spec: { hold: number; min: number; max: number },
): number {
  const totalSets = exerciseCount * setsPerExercise;
  // Match the timing model: mobility transitions take 10 s, and each round has
  // a 15 s reset.
  const rawHold = (totalSeconds - exerciseCount * MOBILITY_TRANSITION_SEC) / totalSets - MOBILITY_REST_SEC;
  return Math.max(spec.min, Math.min(spec.max, Math.round(rawHold)));
}

function repeatedMobilityPlanFor(
  totalSeconds: number,
  exerciseCount: number,
  setsPerExercise: number,
  spec: { hold: number; min: number; max: number },
): RepeatedMobilityPlan {
  const holdSeconds = rawMobilityHold(totalSeconds, exerciseCount, setsPerExercise, spec);
  // Safety net: whatever the caller asked for (or couldn't grow past, e.g.
  // repeatMobilityForSelection when fewer exercises were actually available),
  // never let one stretch accumulate more than MAX_SINGLE_STRETCH_SEC of hold
  // time — trim sets rather than exceed it.
  const cappedSets = Math.max(1, Math.min(setsPerExercise, Math.floor(MAX_SINGLE_STRETCH_SEC / holdSeconds)));
  return { exerciseCount, setsPerExercise: cappedSets, totalSets: exerciseCount * cappedSets, holdSeconds };
}

/**
 * The rep band a lift progresses inside (ADR-0125), centred on the session's
 * existing rep target so today's prescriptions are unchanged in aggregate —
 * reps simply have somewhere to climb before the load steps. Deriving the band
 * from `goals.weights` instead (strength 4-6, hypertrophy 8-12, endurance 12-20)
 * is the natural next step and slots in here without touching progression.
 */
/** The nominal rep target of a band — what a flat prescription would have said. */
function rangeCentreOf(range: RepRange): number {
  return Math.round((range.min + range.max) / 2);
}

/** Used when an exercise somehow isn't in the zone plan (defensive only). */
const FALLBACK_ZONE_ASSIGNMENT: ZoneAssignment = {
  zone: 'hypertrophy',
  isTest: false,
  cascaded: false,
};

function strengthSets(
  ex: Exercise,
  rx: Prescription,
  volumeScale: number,
  deloaded: boolean,
  prescription: ExercisePrescription,
  range: RepRange,
  // Part 1: this exercise was selected only because explicit targeting
  // overrode severe fatigue (pushedThroughFatigue) — noticeably more
  // conservative than a normal de-load, not "sure, full send."
  heavyDeload = false,
): PlannedSet[] {
  // Recovery/systemic reductions primarily remove hard sets. They may shorten
  // the workout; unused time is not a mandate to recreate the fatigue.
  let sets = Math.max(1, Math.round(rx.mainSets * Math.min(1, volumeScale)));
  let rpe = rx.mainRpe;
  if (heavyDeload) {
    sets = Math.max(1, sets - 2);
    rpe = Math.max(4, rpe - 2);
  } else if (deloaded) {
    sets = Math.max(1, sets - 1);
    rpe = Math.max(5, rpe - 1);
  }

  const weightKg = prescription.weightKg;

  if (ex.progression === 'time') {
    // ADR-0125: a hold progresses by getting longer, so double progression owns
    // the base duration once there is history to go on; the time-budget default
    // still applies on the first exposure. Readiness scales it either way.
    const base = prescription.durationSec ?? rx.coreSeconds;
    const durationSec = Math.max(10, Math.round(base));
    // A loaded timed hold (farmer's carry, weighted plank) carries the same
    // recommended load as a weight-progression lift (ADR-0103) — dropped
    // otherwise, since `weightKg` here already comes from the prescription.
    return Array.from({ length: sets }, () => ({
      durationSec,
      targetRpe: rpe,
      ...(ex.loadsWeight && weightKg != null ? { weightKg } : {}),
    }));
  }
  // weight progression carries a recommended load (ADR-0103) when history exists;
  // reps progression (bodyweight) leaves weight undefined.
  const loaded = ex.progression === 'weight' || ex.loadsWeight === true;
  const scaled = Math.max(1, Math.round(prescription.reps ?? rx.mainReps));
  // Keep a readiness-trimmed ask inside the band for loaded work: a low-energy
  // day is a temporary trim, not a deliberate change of rep band, and letting it
  // fall outside the range would read as one next session and trigger a spurious
  // e1RM re-reconciliation of the load. The ceiling matches the headroom double
  // progression itself uses when no heavier weight is available, so the two
  // never disagree about what was asked. Unloaded work has no load axis, so its
  // reps are free to climb past the band — that IS its progression.
  const ceiling = Math.max(range.max, prescription.reps ?? range.max);
  const reps = loaded ? Math.max(range.min, Math.min(ceiling, scaled)) : scaled;
  return Array.from({ length: sets }, () => ({
    reps,
    targetRpe: rpe,
    ...(weightKg != null ? { weightKg } : {}),
  }));
}

/** Exercise-specific ramps for regular heavy compound work (tests add their own). */
function addCompoundRampSets(
  exercise: Exercise,
  working: PlannedSet[],
  zone: TrainingZone,
  unit: 'kg' | 'lb',
  available?: number[],
): PlannedSet[] {
  if ((zone !== 'strength' && zone !== 'power') || mechanicOf(exercise) !== 'compound') return working;
  if (working.some((set) => set.isCalibration || set.isWarmup)) return working;
  const load = working.find((set) => set.weightKg != null)?.weightKg;
  if (load == null || load <= 0) return working;
  const snap = (weight: number) => snapToSensibleWeight(weight, unit, available);
  return [
    { reps: 8, weightKg: snap(load * 0.5), targetRpe: 4, isWarmup: true },
    { reps: 3, weightKg: snap(load * 0.75), targetRpe: 5, isWarmup: true },
    ...working,
  ];
}

/** Keep the explanation aligned with the load the athlete is actually asked
 * to use after the final sensible-increment / owned-equipment constraint. */
function sensibleFinalizationNote(
  rawNote: string,
  baseWeightKg: number,
  finalWeightKg: number,
  unit: 'kg' | 'lb',
): string {
  const reason = rawNote.split(' — ')[1];
  if (!reason) return rawNote;
  const easedPct = Math.round((1 - finalWeightKg / baseWeightKg) * 100);
  return `eased ${easedPct}% to ${formatSuggestedWeight(finalWeightKg, unit)} — ${reason}`;
}

/**
 * Hard ceiling on any single cardio exercise's round/interval count
 * (ADR-0143) — independent of the exercise-count/pool fixes above, this caps
 * the STRUCTURE itself so one exercise can never carry an unbounded number of
 * sets. Applied to the BASE value, not just its progression-growth step:
 * `Math.min(8, x + 1)` only ever bounded growth, never the base `x` itself,
 * which is exactly what let a time-budget-derived base land around 22 rounds
 * (1200s / 1 station / 55s ≈ 22, with `stationCount` defaulting to 1
 * everywhere outside an explicit circuit).
 */
const MAX_CARDIO_ROUNDS = 8;
const MIN_CARDIO_ROUNDS = 2;
/** A steady-state cardio bout scaled down by a poor-readiness/recovery day
 * still has to be a real bout, not a token gesture. */
const MIN_CARDIO_DURATION_SEC = 180;

function clampRounds(rounds: number): number {
  return Math.max(MIN_CARDIO_ROUNDS, Math.min(MAX_CARDIO_ROUNDS, rounds));
}

/**
 * Which structural shape (ADR-0143) a cardio exercise's sets take — the
 * session's declared intent is authoritative, with exactly one named
 * exception: a routine (ADR-0137) already fixes which exercise runs, so its
 * own catalog shape is trusted outright rather than reconciled against the
 * session's cardioIntent toggle (which a routine session doesn't even
 * surface). Every other path — implicit cardio, explicit basic/circuit/
 * interval, Conditioning — is governed strictly by the declared intent; an
 * exercise's own movementPattern tag is never consulted outside this one case.
 */
function effectiveCardioIntent(ex: Exercise, sessionIntent: CardioIntent, isRoutinePick: boolean): CardioIntent {
  if (!isRoutinePick) return sessionIntent;
  if (ex.movementPattern === 'aerobics') return 'circuit';
  if (ex.movementPattern === 'interval') return 'interval';
  return 'basic';
}

export function cardioSets(
  ex: Exercise,
  rx: Prescription,
  intent: CardioIntent = 'basic',
  weightKg?: number,
  history: SessionContext['history'] = [],
  trainingIntent: SessionContext['trainingIntent'] = 'balanced',
  /** How many stations share this aerobics circuit's Main block (ADR-0138) —
   * unused outside the aerobics branch. Every station is called with the
   * same value so they land on identical round counts without a separate
   * equalize pass. */
  stationCount = 1,
  /** Readiness/trainingIntent/layoff/systemic volume multiplier (ADR-0143) —
   * same signal strengthSets() already uses. Downward-only, applied to the
   * capped BASE rounds/duration before any progression growth, so a poor-
   * readiness or recovery-intent day actually reduces cardio volume instead
   * of only blocking further growth. */
  volumeScale = 1,
  /** Dense-pacing lean (ADR-0145) — only affects the circuit branch's
   * transition/round-count math, matching the tighter transition
   * `annotateRest`/`estimateBlocksSeconds` will actually display. */
  densePacing = false,
): PlannedSet[] {
  const met = metForExercise(ex);
  const rpe = cardioWorkRpe(met);
  // Loaded conditioning (kettlebell/dumbbell intervals) carries a recommended
  // load on its work phases only — rest phases are unloaded by definition.
  const load = ex.loadsWeight && weightKg != null ? { weightKg } : {};
  const last = history
    .slice()
    .sort((a, b) => (b.completedAt ?? b.plannedFor) - (a.completedAt ?? a.plannedFor))
    .map((record) => record.performed.find((performed) => performed.exerciseId === ex.id))
    .find((performed) => performed != null);
  const priorWork = last?.sets.filter((set) => set.phase !== 'recovery' && !set.isWarmup) ?? [];
  const completedPrior = priorWork.filter((set) => set.completed && !set.skipped);
  const priorSuccessful =
    priorWork.length > 0 &&
    completedPrior.length === priorWork.length &&
    completedPrior.every((set) => set.quality !== 'pain' && set.quality !== 'form_breakdown' && (set.rpe ?? rpe) <= Math.max(8, set.prescribedRpe ?? rpe));
  const mayProgress = priorSuccessful && trainingIntent !== 'recovery';
  const successfulExposureCount = history.filter((record) => {
    const performed = record.performed.find((item) => item.exerciseId === ex.id);
    const work = performed?.sets.filter((set) => set.phase !== 'recovery' && !set.isWarmup) ?? [];
    return work.length > 0 && work.every((set) =>
      set.completed && !set.skipped && set.quality !== 'pain' && set.quality !== 'form_breakdown',
    );
  }).length;
  const progressionCycle = Math.max(0, successfulExposureCount - 1) % 4;
  if (intent === 'circuit') {
    // Continuous circuit, not max-effort work/rest — stations rotate on a
    // short, fixed transition (REST.AEROBICS_TRANSITION/REST.DENSE_AEROBICS_TRANSITION
    // for bodyweight stations, REST.LOADED_CIRCUIT_TRANSITION/
    // REST.DENSE_LOADED_CIRCUIT_TRANSITION for loaded-implement ones, both
    // applied by annotateRest()) rather than a per-round recovery set or a
    // progressable rest ratio, so aerobics only has 3 progression axes, not
    // intervals' 4. Rounds come from the time budget split across stations
    // (not this one exercise's own history, which drifts per-station) —
    // applyAerobicsCircuit trims every station to the shortest round count
    // afterward, the same safety-first equalize `supersets.ts` already uses
    // for real supersets.
    const totalStations = Math.max(1, stationCount);
    const priorWorkSec = priorWork[0]?.prescribedDurationSec ?? priorWork[0]?.durationSec;
    const baseWork = Math.max(20, priorWorkSec ?? 45);
    const aerobicsCycle = progressionCycle % 3;
    const work = mayProgress && aerobicsCycle === 1 ? baseWork + 5 : baseWork;
    // ADR-0143: capped at the source (not just the growth step below) and
    // scaled downward by today's readiness/intent before any progression
    // runs — this is exactly the arithmetic that used to reach ~22 rounds
    // (1200s / 1 station / 55s) whenever stationCount defaulted to 1.
    // ADR-0145: mirrors whichever transition annotateRest()/estimateBlocksSeconds
    // will actually display, so the round count stays internally consistent
    // with the real per-station rest rather than assuming the standard value.
    const transition = ex.loadsWeight
      ? (densePacing ? REST.DENSE_LOADED_CIRCUIT_TRANSITION : REST.LOADED_CIRCUIT_TRANSITION)
      : (densePacing ? REST.DENSE_AEROBICS_TRANSITION : REST.AEROBICS_TRANSITION);
    const priorRounds = clampRounds(Math.round(rx.cardioSeconds / totalStations / (work + transition)));
    const scaledRounds = Math.max(MIN_CARDIO_ROUNDS, Math.round(priorRounds * Math.min(1, volumeScale)));
    const rounds = mayProgress && aerobicsCycle === 0 ? clampRounds(scaledRounds + 1) : scaledRounds;
    const workRpe = mayProgress && aerobicsCycle === 2 ? Math.min(7, rpe + 1) : rpe;
    const progressionVariable: PlannedSet['progressionVariable'] | undefined = mayProgress
      ? (['rounds', 'duration', 'perceived_intensity'] as const)[aerobicsCycle]
      : undefined;
    return Array.from({ length: rounds }, () => ({
      durationSec: work,
      targetRpe: workRpe,
      phase: 'work' as const,
      progressionVariable,
      ...load,
    }));
  }
  if (intent === 'interval') {
    // ADR-0143: capped at the source and scaled by today's readiness/intent
    // before any progression runs — the uncapped, unscaled base
    // (`priorWork.length || 5`) is exactly what produced 5 rounds x
    // work+recovery = 10 sets on a single exercise's very first exposure.
    const priorRounds = clampRounds(priorWork.length || 5);
    const scaledRounds = Math.max(MIN_CARDIO_ROUNDS, Math.round(priorRounds * Math.min(1, volumeScale)));
    const rounds = mayProgress && progressionCycle === 0 ? clampRounds(scaledRounds + 1) : scaledRounds;
    const priorWorkSec = priorWork[0]?.prescribedDurationSec ?? priorWork[0]?.durationSec;
    const baseWork = Math.max(20, Math.round(priorWorkSec ?? rx.cardioSeconds / (rounds * 3)));
    const work = mayProgress && progressionCycle === 1 ? baseWork + 5 : baseWork;
    const restRatio = cardioRestRatio(met);
    const priorRecovery = last?.sets.find((set) => set.phase === 'recovery');
    const baseRecovery = priorRecovery?.prescribedDurationSec ?? priorRecovery?.durationSec ?? roundToNearest10(baseWork * restRatio);
    const recovery = mayProgress && progressionCycle === 2
      ? Math.max(10, roundToNearest10(baseRecovery * 0.9))
      : baseRecovery;
    const workRpe = mayProgress && progressionCycle === 3 ? Math.min(8, rpe + 1) : rpe;
    const progressionVariable: PlannedSet['progressionVariable'] | undefined = mayProgress
      ? (['rounds', 'duration', 'work_recovery_ratio', 'perceived_intensity'] as const)[progressionCycle]
      : undefined;
    return Array.from({ length: rounds }, () => [
      { durationSec: work, targetRpe: workRpe, phase: 'work' as const, progressionVariable, ...load },
      { durationSec: recovery, targetRpe: 3, phase: 'recovery' as const },
    ]).flat();
  }
  const priorDuration = priorWork[0]?.prescribedDurationSec ?? priorWork[0]?.durationSec;
  const priorDistance = priorWork[0]?.prescribedDistanceM ?? priorWork[0]?.distanceM;
  const distanceCapable = priorDistance != null && priorDistance > 0;
  const effectiveCycle = distanceCapable ? progressionCycle : progressionCycle === 3 ? 3 : 0;
  const rawDurationSec = mayProgress && effectiveCycle === 0 && priorDuration != null
    ? Math.min(priorDuration + 30, Math.round(priorDuration * 1.1))
    : priorDuration ?? rx.cardioSeconds;
  // ADR-0143: same downward-only readiness/intent scale strengthSets() and
  // the interval/circuit branches above already apply — steady-state cardio
  // had no equivalent, so a recovery day's bout stayed full-length.
  const durationSec = Math.max(MIN_CARDIO_DURATION_SEC, Math.round(rawDurationSec * Math.min(1, volumeScale)));
  const rawDistanceM = distanceCapable
    ? mayProgress && (effectiveCycle === 1 || effectiveCycle === 2)
      ? Math.round(priorDistance * (effectiveCycle === 1 ? 1.05 : 1.03))
      : priorDistance
    : undefined;
  const distanceM = rawDistanceM != null ? Math.round(rawDistanceM * Math.min(1, volumeScale)) : undefined;
  const targetRpe = mayProgress && effectiveCycle === 3 ? Math.min(8, rpe + 1) : rpe;
  const progressionVariable: PlannedSet['progressionVariable'] | undefined = mayProgress
    ? effectiveCycle === 0 ? 'duration' : effectiveCycle === 1 ? 'distance' : effectiveCycle === 2 ? 'pace' : 'perceived_intensity'
    : undefined;
  return [{ durationSec, ...(distanceM != null ? { distanceM } : {}), targetRpe, progressionVariable, phase: 'work', ...load }];
}

/** Same history-based load recommendation as the Main strength block
 * (recommendLoad + finalizeLoad + snapToSensibleWeight), reused for loaded
 * cardio conditioning intervals — no basis yet (fresh exercise) returns
 * undefined and the athlete logs the first weight themselves. */
function recommendedCardioWeightKg(ex: Exercise, input: SessionContext): number | undefined {
  if (!ex.loadsWeight) return undefined;
  const unit = input.athlete.weightUnit ?? 'kg';
  const available = availableWeightsForExercise(ex, input.equipment);
  const rec = recommendLoad(ex, input.history, 7, unit);
  // ADR-0144: no history yet — a real starting suggestion, not a blank.
  if (rec?.weightKg == null) return startingWeightKgFor(ex, available, unit);
  const final = finalizeLoad({
    baseWeightKg: rec.weightKg,
    exercise: ex,
    readiness: input.readiness,
    fatigue: input.fatigue,
    history: input.history,
    now: input.plannedFor,
  });
  const finalizedKg = final?.weightKg ?? rec.weightKg;
  return snapToSensibleWeight(finalizedKg, unit, available, barbellFloorKg(ex));
}

// ADR-0107 v2: graded volume multiplier — same per-signal bands as the load
// axis (readinessFactor, ADR-0122) via the shared helper, but a deeper max cut
// and steeper scale since reps/holds (not weight) are the primary "how do you
// feel today" lever (see strengthSets' comment on volumeScale). A single mild
// signal now trims a little (not the old flat 20%); several genuinely bad
// signals trim more than the old binary ever did. Never auto-increases.
const VOLUME_READINESS_MAX_CUT = 0.3;
const VOLUME_READINESS_SCALE = 2;
function readinessScale(r: SessionContext['readiness']): number {
  return readinessFactor(r, VOLUME_READINESS_MAX_CUT, VOLUME_READINESS_SCALE);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPlanned(ex: Exercise, sets: PlannedSet[], note?: string, emphasized?: boolean, deloaded?: boolean, zone?: TrainingZone): PlannedExercise {
  return {
    exerciseId: ex.id,
    name: ex.name,
    primaryAreas: ex.primaryAreas.map((g) => ({ group: g })),
    secondaryAreas: ex.secondaryAreas?.map((g) => ({ group: g })),
    sets,
    note,
    ...(emphasized ? { emphasized: true } : {}),
    ...(deloaded ? { deloaded: true } : {}),
    ...(zone ? { zone } : {}),
  };
}

function normalize(w: ModalityWeights): ModalityWeights {
  const total = w.strength + w.cardio + w.mobility + w.general || 1;
  return {
    strength: w.strength / total,
    cardio: w.cardio / total,
    mobility: w.mobility / total,
    general: w.general / total,
  };
}

// Tie-break order when two modalities carry equal weight (ties never occur in
// practice with real athlete weights, but argmax needs a deterministic pick).
const MODALITY_PRIORITY: Modality[] = ['cardio', 'mobility', 'general', 'strength'];

function dominantMainModality(w: ModalityWeights): Modality {
  const best = Math.max(w.strength, w.cardio, w.mobility, w.general);
  return MODALITY_PRIORITY.find((m) => w[m] === best) ?? 'strength';
}

interface CadenceOverride {
  modality: Modality;
  note?: string;
}

/**
 * ADR-0105 v2: if explicit weekly targets are set and the naive weight-based
 * pick has already met/exceeded its target for the week while another
 * targeted modality hasn't, switch to the most-behind one instead — "don't
 * over-stack a modality already hit this week." No targets set, or the naive
 * pick's target isn't met yet, or nothing else is behind → returns the naive
 * pick unchanged (byte-identical to v1 behavior).
 */
function applyCadenceOverride(
  naive: Modality,
  weeklyTargets: Partial<Record<Modality, number>> | undefined,
  history: SessionContext['history'],
  plannedFor: number,
): CadenceOverride {
  if (!weeklyTargets) return { modality: naive };
  const naiveTarget = weeklyTargets[naive];
  if (naiveTarget == null) return { modality: naive };

  const counts = weeklySessionCountsByModality(history, 0, plannedFor);
  if ((counts[naive] ?? 0) < naiveTarget) return { modality: naive };

  let behind: Modality | undefined;
  let behindDeficit = 0;
  for (const [modality, target] of Object.entries(weeklyTargets) as [Modality, number][]) {
    if (modality === naive || target == null) continue;
    const deficit = target - (counts[modality] ?? 0);
    if (deficit > behindDeficit) {
      behind = modality;
      behindDeficit = deficit;
    }
  }
  if (!behind) return { modality: naive };

  return {
    modality: behind,
    note: `Switching to ${behind} today — you've already hit your ${naive} target this week.`,
  };
}

function estimateDurationSeconds(blocks: SessionBlock[], densePacing = false): number {
  return estimateBlocksSeconds(blocks, resolveExercise, densePacing);
}

function estimateDuration(blocks: SessionBlock[], densePacing = false): number {
  return Math.round(estimateDurationSeconds(blocks, densePacing) / 60);
}

// A little rounding slack so the fit pass doesn't fight itself over a few seconds.
const DURATION_BUDGET_TOLERANCE = 1.05;
// Strength work is scheduled in groups of 3-5 sets (methodology §3). The budget
// balancer keeps each Main lift within this band, and prefers trimming whole
// exercises over dropping a lift below MIN_WORK_SETS — "fewer exercises, real
// set-blocks" instead of many exercises with one or two sets each.
const MIN_WORK_SETS = 3;
// First-pass floor when over budget: bring sets down toward a real 4-set block
// before ever dropping an exercise. MIN_WORK_SETS (3) is a true last resort,
// reached only once exercise count is already at MIN_MAIN_EXERCISES — otherwise
// an over-generous initial exercise count (e.g. 8 for a long session) bottoms
// every lift out at 3 sets instead of landing on fewer exercises at 4-5.
const SOFT_MIN_WORK_SETS = 4;
const MAX_WORK_SETS = 5;
/** Ceiling on working sets across the whole session (ADR-0128). */
const MAX_SESSION_WORK_SETS = 30;
// Never strip a Main block below this many exercises to hit a short budget — at
// that point we'd rather run a touch long than hand back a one-lift "session".
const MIN_MAIN_EXERCISES = 2;
// ADR-0124: a "Full Body" Main block (pickFullBodySpread) interleaves one pick
// per region (upper/lower/core) up front specifically so end-trimming can't
// erase a whole region — but only if the floor here actually protects that
// many exercises. Trimming below this would silently break the "spans the
// whole body" guarantee the athlete was told about in the rationale.
const MIN_MAIN_EXERCISES_FULL_BODY = 3;
// Timed holds (conditioning/flow) have a sensible floor — no 15-second fillers.
const MIN_HOLD_SEC = 20;
// Warmup/cool-down are configured anchor blocks — if they must be eased to fit,
// never below this (keeps them visible, never rounding to "0 min").
const MIN_ANCHOR_HOLD_SEC = 45;

/** True for a strength Main lift whose sets we may add/remove to fit the budget. */
function isTrimmableStrength(block: SessionBlock): boolean {
  return (block.modality === 'strength' || block.modality === 'general') && block.label === 'Main';
}

/** The trimmable strength exercise carrying the most work sets (for even paring). */
function largestStrengthExercise(blocks: SessionBlock[]): PlannedExercise | undefined {
  let best: PlannedExercise | undefined;
  for (const b of blocks) {
    if (!isTrimmableStrength(b)) continue;
    for (const ex of b.exercises) {
      const working = ex.sets.filter((s) => !s.isWarmup).length;
      if (working > (best?.sets.filter((s) => !s.isWarmup).length ?? 0)) best = ex;
    }
  }
  return best;
}

/**
 * Land the session on the athlete's requested time budget using the REAL time
 * model (docs/methodology §2-4). Unlike the old fitter, this never crushes a
 * timed hold to a filler value: it works in whole set-blocks and whole
 * exercises. Over budget → trim sets toward the soft 4-set floor first, then
 * drop a whole Main exercise (down to MIN_MAIN_EXERCISES), then — only once
 * exercise count is already minimal — trim further to the true MIN_WORK_SETS
 * floor, then gently compress timed holds toward MIN_HOLD_SEC as a last
 * resort. Under budget → add sets to Main lifts (up to MAX_WORK_SETS). Rep
 * counts / weights are never touched here — only structure.
 */
/** Working sets across every trimmable strength block — warm-up ramps excluded. */
function totalWorkSets(blocks: SessionBlock[]): number {
  return blocks
    .filter(isTrimmableStrength)
    .flatMap((block) => block.exercises)
    .reduce((sum, exercise) => sum + exercise.sets.filter((set) => !set.isWarmup).length, 0);
}

function fitDurationToBudget(
  blocks: SessionBlock[],
  requestedMinutes?: number,
  minMainExercises = MIN_MAIN_EXERCISES,
  /**
   * Per-muscle-group hard ceiling for the session (ADR-0134). When set, the
   * under-budget filler will not add a set to any exercise whose groups are
   * already at it — so leftover time simply goes unused and the session comes
   * back shorter than requested. That is the intended outcome: the duration
   * request is a ceiling on time, never a licence to exceed a volume limit.
   */
  groupCeiling?: number,
  /** ADR-0145: mirrors the real rest model so the budget the filler/trimmer
   * loops below chase matches what annotateRest will actually display. */
  densePacing = false,
): void {
  if (!requestedMinutes) return;
  const clamped = Math.max(MIN_TARGET_DURATION_MIN, Math.min(MAX_TARGET_DURATION_MIN, requestedMinutes));
  const targetSeconds = clamped * 60;

  // --- Over budget: shed structure, biggest lever first. ---
  for (let guard = 0; guard < 200; guard++) {
    if (estimateDurationSeconds(blocks, densePacing) <= targetSeconds * DURATION_BUDGET_TOLERANCE) break;

    const fullest = largestStrengthExercise(blocks);
    const fullestWorkSets = fullest?.sets.filter((s) => !s.isWarmup).length ?? 0;
    if (fullest && fullestWorkSets > SOFT_MIN_WORK_SETS) {
      // Remove one work set (keep warmup ramp sets intact).
      const idx = fullest.sets.map((s, i) => ({ s, i })).filter(({ s }) => !s.isWarmup).pop()!.i;
      fullest.sets.splice(idx, 1);
      continue;
    }

    const mainBlock = blocks.find((b) => isTrimmableStrength(b) && b.exercises.length > minMainExercises);
    if (mainBlock) {
      // ADR-0126: shed non-emphasized work first. Popping blindly from the end
      // could drop the very exercises the athlete asked for, leaving a plan
      // that promised a shoulders day and delivered someone else's.
      const lastFiller = mainBlock.exercises.map((e, i) => ({ e, i })).filter(({ e }) => !e.emphasized).pop();
      mainBlock.exercises.splice(lastFiller ? lastFiller.i : mainBlock.exercises.length - 1, 1);
      continue;
    }

    // Exercise count is already at its floor — only now dip below the soft
    // floor to the true MIN_WORK_SETS minimum, before touching timed holds.
    if (fullest && fullestWorkSets > MIN_WORK_SETS) {
      const idx = fullest.sets.map((s, i) => ({ s, i })).filter(({ s }) => !s.isWarmup).pop()!.i;
      fullest.sets.splice(idx, 1);
      continue;
    }

    // Last resort: compress timed holds — but the warmup/cool-down are anchor
    // blocks the athlete configured (ADR-0111/0116) and must NOT be gutted to fit
    // a Main-heavy or long-conditioning budget. Compress the big discretionary
    // holds first (conditioning bouts, flow holds) down to MIN_HOLD_SEC; only if
    // that's exhausted do we ease the warmup/cool-down, and never below
    // MIN_ANCHOR_HOLD_SEC so they stay visible (never round to "0 min").
    const holdsIn = (anchor: boolean, floor: number) =>
      blocks
        .filter((b) => (b.label === 'Warmup' || b.label === 'Cool down') === anchor)
        .flatMap((b) => b.exercises)
        .flatMap((e) => e.sets)
        .filter((s) => s.durationSec != null && (s.durationSec ?? 0) > floor);
    const discretionary = holdsIn(false, MIN_HOLD_SEC);
    const target = discretionary.length ? discretionary : holdsIn(true, MIN_ANCHOR_HOLD_SEC);
    if (!target.length) break;
    const floor = discretionary.length ? MIN_HOLD_SEC : MIN_ANCHOR_HOLD_SEC;
    for (const s of target) s.durationSec = Math.max(floor, Math.round((s.durationSec ?? 0) * 0.9));
  }

  // --- Under budget: fill with real set-blocks, not filler. ---
  for (let guard = 0; guard < 200; guard++) {
    if (estimateDurationSeconds(blocks, densePacing) >= targetSeconds / DURATION_BUDGET_TOLERANCE) break;
    // ADR-0128: duration buys volume, but not without limit. Now that reps no
    // longer inflate with session length, a long budget would otherwise keep
    // adding sets until the session sprawled.
    if (totalWorkSets(blocks) >= MAX_SESSION_WORK_SETS) break;
    // ADR-0134: recomputed each pass, because each added set changes it. The
    // `deloaded` guard below is not sufficient on its own — a ceiling-trimmed
    // push-up is marked de-loaded, but an *untrimmed* second chest exercise is
    // not, so without a group-level check the balancer would happily pad that
    // one and put chest back over the ceiling by another route.
    const tally = groupCeiling != null ? tallyOf(blocks, isTrimmableStrength) : undefined;
    // Add a work set to the strength lift with the fewest sets, keeping the band even.
    let leanest: PlannedExercise | undefined;
    for (const b of blocks) {
      if (!isTrimmableStrength(b)) continue;
      for (const ex of b.exercises) {
        // Never pad a deliberately de-loaded lift back up (ADR-0126). It has
        // the fewest sets precisely BECAUSE it was cut, so a naive "fewest
        // sets first" fill would target it every time and quietly undo the
        // safety decision that cut it.
        if (ex.deloaded) continue;
        if (tally && groupCeiling != null && tally.headroom(loadedGroupsOfPlanned(ex), 1, groupCeiling) < 1) continue;
        const working = ex.sets.filter((s) => !s.isWarmup).length;
        if (working < MAX_WORK_SETS && working < (leanest?.sets.filter((s) => !s.isWarmup).length ?? Infinity)) {
          leanest = ex;
        }
      }
    }
    if (!leanest) break;
    const template = leanest.sets.filter((s) => !s.isWarmup).slice(-1)[0];
    if (!template) break;
    leanest.sets.push({ ...template });
  }
}

/**
 * System-wide invariant: a superset/triset (`rotationGroup`) must have ≥2
 * members. Something upstream (today, only `fitDurationToBudget`'s exercise
 * drop) can leave a lone survivor after its partner(s) are removed — that's
 * not a superset anymore, so clear its group fields and let it render as a
 * normal straight set.
 */
function demoteOrphanedSupersets(blocks: SessionBlock[]): void {
  for (const block of blocks) {
    const counts = new Map<string, number>();
    for (const ex of block.exercises) {
      if (ex.rotationGroup) counts.set(ex.rotationGroup, (counts.get(ex.rotationGroup) ?? 0) + 1);
    }
    for (const ex of block.exercises) {
      if (ex.rotationGroup && (counts.get(ex.rotationGroup) ?? 0) < 2) {
        ex.rotationGroup = undefined;
        ex.group = undefined;
      }
    }
  }
}

/** Populate each set's `restSec` from the real rest model for the tracker's
 * per-set timer. The final set of an exercise gets no trailing rest.
 * `densePacing` (ADR-0145) mirrors the exact logic `estimateBlocksSeconds`
 * uses, so the displayed rest and the duration/budget estimate never diverge. */
function annotateRest(blocks: SessionBlock[], densePacing = false): void {
  for (const block of blocks) {
    for (const ex of block.exercises) {
      const catalog = resolveExercise(ex.exerciseId);
      if (!catalog) continue;
      // A circuit-grouped exercise (stamped by applyAerobicsCircuit) always
      // gets the short rotation transition regardless of movementPattern —
      // pacedRestSecondsFor's own aerobics check only covers the degenerate
      // single-exercise (ungrouped) case below it.
      const circuitRest = ex.group?.type === 'circuit'
        ? (catalog.loadsWeight
            ? (densePacing ? REST.DENSE_LOADED_CIRCUIT_TRANSITION : REST.LOADED_CIRCUIT_TRANSITION)
            : (densePacing ? REST.DENSE_AEROBICS_TRANSITION : REST.AEROBICS_TRANSITION))
        : undefined;
      ex.sets.forEach((set, i) => {
        set.restSec = i === ex.sets.length - 1 ? undefined : circuitRest ?? pacedRestSecondsFor(catalog, set, densePacing);
      });
    }
  }
}

/** Last step of session build: round every set's timed values to the nearest
 * 10s, whichever formula upstream produced them (strength rest, interval
 * work/recovery, mobility holds, ...) — a single seam so the tracker always
 * shows/counts down a glanceable number instead of chasing each source.
 * Circuit-grouped rest is exempt: `annotateRest` already writes its final,
 * intentional value from the `REST.*_TRANSITION` family — for the dense-
 * pacing (ADR-0145) 8s/16s variants specifically, `roundToNearest10` would
 * round them straight back up to the standard 10s/20s and silently erase the
 * discount. The standard 10s/20s transitions are already exact multiples of
 * 10, so this is a no-op for every non-dense circuit, matching Phase 2's
 * output exactly. */
function roundPlanTimes(blocks: SessionBlock[]): void {
  for (const block of blocks) {
    for (const ex of block.exercises) {
      const isCircuitRest = ex.group?.type === 'circuit';
      for (const set of ex.sets) {
        if (set.durationSec != null) set.durationSec = roundToNearest10(set.durationSec);
        if (set.restSec != null && !isCircuitRest) set.restSec = roundToNearest10(set.restSec);
      }
    }
  }
}

function describeArea(a: BodyArea): string {
  const base = a.group ?? a.region ?? a.joint ?? 'area';
  return a.side && a.side !== 'bilateral' ? `${a.side} ${base}` : base;
}

/** Areas can arrive from multiple sources (a standing constraint AND today's
 * flag for the same joint); describe each distinct area once. */
function describeAreasUnique(areas: BodyArea[]): string {
  return [...new Set(areas.map(describeArea))].join(', ');
}

function buildRationale(
  input: SessionContext,
  mainModality: Modality,
  emphasize: BodyArea[],
  avoid: AvoidanceModel,
  volumeScale: number,
  warmupPrefs: WarmupPreferences,
  cooldownPrefs: CooldownPreferences,
  intent: NonNullable<SessionContext['trainingIntent']>,
  workoutType?: WorkoutType,
  overMrvGroups: BodyArea[] = [],
  cadenceNote?: string,
  pushedThroughFatigueGroups: BodyArea[] = [],
  layoffNote?: string,
  emphasisShortfall = 0,
  systemicNote?: string,
  zoneNote?: string,
  /** ADR-0134: groups whose per-session ceiling bound today, and the ceiling. */
  dailyCapGroups: BodyArea[] = [],
  dailyCapCeiling = 0,
  dailyCapDroppedExercises = 0,
  /** ADR-0134: emphasized slots 'priority' mode left unfilled on purpose. */
  priorityBlockShortfall = 0,
  /** ADR-0145: whether this session was built under a dense-pacing lean. */
  densePacing = false,
): string {
  const parts: string[] = [];
  parts.push(`Today's focus: ${mainModality}.`);
  if (cadenceNote) parts.push(cadenceNote);
  // ADR-0125: say it plainly when the session has been eased for time off —
  // an unexplained lighter day reads as the app losing track, not looking after you.
  if (layoffNote) parts.push(`${layoffNote.charAt(0).toUpperCase()}${layoffNote.slice(1)}.`);
  if (workoutType === 'cardio') parts.push(`A full cardio-focused session.`);
  // ADR-0145: named explicitly (CLAUDE.md §7) since it's a real, measurable
  // change to displayed rest and circuit transitions, not just copy.
  if (densePacing) parts.push(`Kept rest and transitions tight to match your plan's fast pace.`);
  if (workoutType === 'bodyweight') parts.push(`Bodyweight-only today — no external equipment.`);
  if (workoutType === 'sculpting') parts.push(`A full-body sculpting session — toning across every major muscle group.`);
  const fullBody = isFullBodyTargeting(emphasize);
  if (fullBody) {
    parts.push(`Spreading work across your whole body today — upper body, lower body, and core — rather than concentrating on a couple of areas.`);
  } else if (emphasize.length) {
    parts.push(`Emphasizing ${describeAreasUnique(emphasize)}.`);
    // ADR-0126: never claim emphasis the block didn't actually deliver. If the
    // catalog, the equipment, or an avoidance flag stopped us filling the
    // quota, say so — a plan that silently under-delivers while announcing the
    // opposite is worse than one that admits the constraint.
    if (emphasisShortfall > 0) {
      // ADR-0134: name the real cause. This message blamed equipment and safety
      // unconditionally, which was actively misleading in the most common case —
      // the athlete's own exclusion list is usually what emptied the pool, and
      // telling them their equipment is at fault sends them looking for a
      // problem that isn't there.
      const blockedByExclusion = EXERCISES.some(
        (e) =>
          e.modality === mainModality &&
          input.excludedExerciseIds?.includes(e.id) &&
          equipmentSatisfied(e, input.equipment) &&
          emphasizesArea(emphasize, e),
      );
      const cause = blockedByExclusion
        ? "the exercises you've excluded left"
        : "your equipment and what's safe to train left";
      parts.push(
        `Only got part-way there today — ${cause} ${emphasisShortfall} fewer ${describeAreasUnique(emphasize)} exercise${emphasisShortfall > 1 ? 's' : ''} than planned.`,
      );
    }
  }
  // Areas pushed through via explicit targeting (Part 1) get their own callout
  // below rather than reading as untouched "working around" areas.
  const pushedGroups = new Set(pushedThroughFatigueGroups.map((a) => a.group).filter((g): g is MuscleGroup => g != null));
  const flagged = [...avoid.hardSafety, ...avoid.hardFatigue, ...avoid.limit].filter(
    (a) => !(a.group && pushedGroups.has(a.group)),
  );
  if (flagged.length) parts.push(`Working around ${describeAreasUnique(flagged)}.`);
  if (pushedThroughFatigueGroups.length)
    parts.push(`Targeting ${describeAreasUnique(pushedThroughFatigueGroups)} despite high fatigue — volume trimmed further.`);
  if (avoid.recovery.length)
    parts.push(`Easing off ${describeAreasUnique(avoid.recovery)} for recovery.`);
  if (overMrvGroups.length)
    parts.push(`Trimming volume on ${describeAreasUnique(overMrvGroups)} — already at this week's ceiling.`);
  // ADR-0134: the per-session ceiling is the one rule that can make a session
  // come back shorter than asked for, so when it does, it has to explain itself
  // — a trainer says that out loud rather than handing over a 30-minute session
  // after you asked for an hour.
  //
  // Deliberately silent when the ceiling merely shaped how sets were spread
  // without costing the athlete anything. Volume being distributed across a
  // block is just programming; announcing "capped chest, triceps, glutes, back,
  // quads and hamstrings" on a perfectly normal session is noise that trains
  // people to ignore the rationale.
  if (dailyCapGroups.length && dailyCapDroppedExercises > 0) {
    parts.push(
      `Capped ${describeAreasUnique(dailyCapGroups)} at ${dailyCapCeiling} sets — that's the most one session should carry for a muscle group, however much time you have.`,
    );
    parts.push(
      `That left ${dailyCapDroppedExercises} planned exercise${dailyCapDroppedExercises > 1 ? 's' : ''} out, so today runs shorter than you asked for.`,
    );
  }
  // Priority emphasis deliberately refuses to pad the session with muscle groups
  // you didn't ask for — the alternative was a "chest day" of mostly squats.
  if (priorityBlockShortfall > 0 && emphasize.length) {
    parts.push(
      `Kept the whole session on ${describeAreasUnique(emphasize)} rather than filling time with other muscle groups — so it's ${priorityBlockShortfall} exercise${priorityBlockShortfall > 1 ? 's' : ''} shorter than a full block.`,
    );
  }
  if (warmupPrefs.focus.length)
    parts.push(`Stretching focus: ${describeAreasUnique(warmupPrefs.focus)}.`);
  if (cooldownPrefs.focus.length)
    parts.push(`Cool-down focus: ${describeAreasUnique(cooldownPrefs.focus)}.`);
  if (zoneNote) parts.push(zoneNote);
  if (systemicNote) parts.push(`Easing off — ${systemicNote}.`);
  if (volumeScale < 1 && !systemicNote) parts.push(`Reduced volume today given your readiness.`);
  // ADR-0126: below a certain readiness a trainer stops trimming the session
  // and suggests a different *kind* of day. Offered, never imposed — the
  // athlete keeps the session they asked for.
  if (readinessSuggestsRecovery(input.readiness) && intent !== 'recovery') {
    parts.push(`Honestly, today reads like a recovery day — consider switching to stretch or an easy session if that lands right.`);
  }
  if (intent === 'recovery') parts.push(`Keeping the effort deliberately easy today.`);
  if (intent === 'challenge') parts.push(`Leaning into a higher-effort day.`);
  return parts.join(' ');
}

/** ADR-0128: a test day is worth announcing — the athlete has to know to push. */
function zoneTestNote(zonePlan: Map<string, ZoneAssignment>): string | undefined {
  const zones = [...zonePlan.values()].filter((a) => a.isTest).map((a) => a.zone);
  if (!zones.length) return undefined;
  const parts = zones.map((zone) =>
    zone === 'strength'
      ? 'a strength test — go heavy and see how many clean reps you have'
      : 'an endurance test — light load, as many good reps as you can',
  );
  return `Today includes ${parts.join(' and ')}.`;
}

function buildFlowRationale(
  workoutType: 'stretch' | 'yoga' | 'barre' | 'pilates',
  emphasize: BodyArea[],
  avoid: AvoidanceModel,
  volumeScale: number,
  hasExercises: boolean,
  stageRounds?: number,
): string {
  const label = workoutType === 'yoga' ? 'a yoga flow' : workoutType === 'barre' ? 'a barre flow' : workoutType === 'pilates' ? 'a pilates flow' : 'a stretch flow';
  if (!hasExercises) {
    const gearHint = workoutType === 'yoga' ? 'a yoga mat' : workoutType === 'barre' ? 'a barre (or a sturdy chair/counter)' : workoutType === 'pilates' ? 'a yoga/pilates mat' : 'the right equipment';
    return `Today's focus: ${label}, but nothing in the catalog matched your equipment — add ${gearHint} or adjust today's constraints.`;
  }
  const parts: string[] = [`Today's focus: ${label}.`];
  // Yoga, Barre, and Pilates are deliberately muscle-agnostic-by-stage
  // (targeting doesn't bias selection there — Part 3B), so only Stretch's
  // rationale claims targeting.
  if (workoutType === 'stretch' && emphasize.length) parts.push(`Targeting ${describeAreasUnique(emphasize)}.`);
  if ((workoutType === 'yoga' || workoutType === 'barre' || workoutType === 'pilates') && stageRounds && stageRounds > 1)
    parts.push(`Your flow repeats for ${stageRounds} rounds.`);
  const flagged = [...avoid.hardSafety, ...avoid.hardFatigue, ...avoid.limit];
  if (flagged.length) parts.push(`Working around ${describeAreasUnique(flagged)}.`);
  if (avoid.recovery.length)
    parts.push(`Easing off ${describeAreasUnique(avoid.recovery)} for recovery.`);
  if (volumeScale < 1) parts.push(`Shorter holds today given your readiness.`);
  return parts.join(' ');
}
