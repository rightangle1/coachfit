/**
 * Curated UI vocabulary shared by onboarding, prebrief (Today), and debrief
 * screens — a friendly subset of the full body-area taxonomy (ADR-0004) for
 * chip pickers. Not domain logic; purely which options we surface as chips.
 */

import type {
  BodyArea,
  EquipmentType,
  ExperienceLevel,
  Modality,
  MovementPattern,
  MuscleGroup,
  WeightedEquipmentType,
  WeightUnit,
  WorkoutType,
} from '@/domain/types';
import { lbToKg } from './units';

export const EMPHASIS_OPTIONS: { label: string; area: BodyArea }[] = [
  { label: 'Back', area: { group: 'back' } },
  { label: 'Chest', area: { group: 'chest' } },
  { label: 'Legs', area: { group: 'quads' } },
  { label: 'Shoulders', area: { group: 'shoulders' } },
  { label: 'Arms', area: { group: 'biceps' } },
  { label: 'Core', area: { group: 'abs' } },
];

/** Mutually exclusive with EMPHASIS_OPTIONS's muscle-group chips (ADR-0124) —
 * selecting it means "spread across the whole body" rather than any specific
 * group(s). Resolves to the previously-unused `region: 'full_body'`. */
export const FULL_BODY_EMPHASIS_OPTION: { label: string; area: BodyArea } = {
  label: 'Full Body',
  area: { region: 'full_body' },
};

export const WORKOUT_TYPE_OPTIONS: { label: string; value: WorkoutType | undefined; caption?: string }[] = [
  { label: 'Balanced', value: undefined },
  { label: 'Bodybuilding', value: 'bodybuilding', caption: 'Hypertrophy-focused work with optional exercise rotations' },
  { label: 'Sculpting', value: 'sculpting', caption: 'Full-body toning across every major muscle group' },
  { label: 'Stretch', value: 'stretch', caption: 'A full mobility flow, nothing else' },
  { label: 'Yoga', value: 'yoga', caption: 'A held-pose yoga flow' },
  { label: 'Bodyweight', value: 'bodyweight', caption: 'No equipment, anywhere' },
  { label: 'Cardio', value: 'cardio', caption: 'A full cardio-focused session' },
];

/**
 * Stretch/warmup focus areas (ADR-0111). Deliberately muscle-group level (not
 * joint tags) — the engine's emphasis bias only counts primary-tier group/region
 * matches, so joint-tag areas here wouldn't actually influence selection.
 */
export const STRETCH_FOCUS_OPTIONS: { label: string; area: BodyArea }[] = [
  { label: 'Hips', area: { group: 'glutes' } },
  { label: 'Hamstrings', area: { group: 'hamstrings' } },
  { label: 'Shoulders', area: { group: 'shoulders' } },
  { label: 'Upper back', area: { group: 'back' } },
  { label: 'Neck', area: { group: 'neck' } },
  { label: 'Ankles', area: { group: 'calves' } },
];

/** Areas commonly flagged for avoidance, either as a one-off or a standing constraint. */
export const CONCERN_OPTIONS: { label: string; area: BodyArea }[] = [
  { label: 'Knee', area: { joint: 'knee' } },
  { label: 'Hip', area: { joint: 'hip' } },
  { label: 'Shoulder', area: { joint: 'shoulder' } },
  { label: 'Elbow', area: { joint: 'elbow' } },
  { label: 'Lower back', area: { group: 'lower_back' } },
  { label: 'Wrist', area: { joint: 'wrist' } },
  { label: 'Ankle', area: { joint: 'ankle' } },
];

export const EXPERIENCE_OPTIONS: { label: string; value: ExperienceLevel }[] = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

export const EQUIPMENT_OPTIONS: { label: string; value: EquipmentType }[] = [
  { label: 'Bodyweight', value: 'bodyweight' },
  { label: 'Dumbbells', value: 'dumbbells' },
  { label: 'Barbell', value: 'barbell' },
  { label: 'Kettlebell', value: 'kettlebell' },
  { label: 'Resistance bands (tube/handle)', value: 'resistance_bands_tube' },
  { label: 'Resistance bands (loop)', value: 'resistance_bands_loop' },
  { label: 'Pull-up bar', value: 'pull_up_bar' },
  { label: 'Bench', value: 'bench' },
  { label: 'Squat rack', value: 'squat_rack' },
  { label: 'Cable machine', value: 'cable_machine' },
  { label: 'Treadmill', value: 'treadmill' },
  { label: 'Bike', value: 'bike' },
  { label: 'Elliptical', value: 'elliptical' },
  { label: 'Stair climber', value: 'stair_climber' },
  { label: 'Rowing machine', value: 'rowing_machine' },
  { label: 'Other cardio machine', value: 'cardio_machine' },
  { label: 'Yoga mat', value: 'yoga_mat' },
  { label: 'Foam roller', value: 'foam_roller' },
  { label: 'Suspension cables (TRX)', value: 'suspension_trainer' },
];

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}

/** Dumbbells are actually sold/labeled in clean 5 lb jumps in the US (ADR-0115
 * v2) — unlike kettlebells, which are metric-native equipment even where sold
 * in lb-speaking markets, so their "odd" lb conversions below are the real
 * numbers printed on the bell. */
const DUMBBELL_PRESET_LB = range(5, 100, 5);
const DUMBBELL_PRESET_KG = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 35, 40, 45, 50];

/**
 * Preset weight chips for the equipment screen's dumbbell picker (ADR-0115),
 * canonical kg, unit-aware so lb athletes see the round numbers dumbbells
 * actually come in rather than odd kg-conversion artifacts. The athlete can
 * still add any custom value the presets miss.
 */
export function dumbbellPresetWeightsKg(unit: WeightUnit): number[] {
  if (unit === 'lb') return DUMBBELL_PRESET_LB.map((lb) => Math.round(lbToKg(lb) * 1000) / 1000);
  return DUMBBELL_PRESET_KG;
}

/** Kettlebell presets (ADR-0115), canonical kg — unaffected by display unit
 * since kettlebells are manufactured/labeled in kg regardless of market. */
export const KETTLEBELL_PRESET_WEIGHTS_KG = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48];

/**
 * Resistance bands don't have a meaningful numeric "weight" the way dumbbells
 * do — real band sets are sold by qualitative resistance level, not a printed
 * weight. Color-to-resistance mapping isn't standardized across manufacturers
 * (ADR-0117), so levels are generic tiers, never color names. Tube and loop
 * bands get separate tables since the two styles cover different real-world
 * force ranges — loop bands run heavier at full stretch than handled tube
 * bands. Fixed canonical kg equivalents drive the same engine snapping
 * machinery as dumbbells/kettlebells; the UI only ever shows the label.
 */
export const TUBE_BAND_LEVELS: { label: string; kg: number }[] = [
  { label: 'Extra Light', kg: 3 },
  { label: 'Light', kg: 6 },
  { label: 'Medium', kg: 10 },
  { label: 'Heavy', kg: 15 },
  { label: 'Extra Heavy', kg: 20 },
];

export const LOOP_BAND_LEVELS: { label: string; kg: number }[] = [
  { label: 'Extra Light', kg: 3 },
  { label: 'Light', kg: 7 },
  { label: 'Medium', kg: 14 },
  { label: 'Heavy', kg: 24 },
  { label: 'Extra Heavy', kg: 36 },
];

/** Per-type qualitative level list for weighted equipment that isn't
 * numerically presetable — only bands, currently (ADR-0117). Types absent
 * here (dumbbells, kettlebell) use numeric preset lists instead. */
export const BAND_LEVELS_BY_TYPE: Partial<Record<WeightedEquipmentType, { label: string; kg: number }[]>> = {
  resistance_bands_tube: TUBE_BAND_LEVELS,
  resistance_bands_loop: LOOP_BAND_LEVELS,
};

export const WEIGHTED_EQUIPMENT_LABELS: Record<WeightedEquipmentType, string> = {
  dumbbells: 'dumbbell',
  kettlebell: 'kettlebell',
  resistance_bands_tube: 'tube band',
  resistance_bands_loop: 'loop band',
};

/** Friendly display labels for the full muscle-group taxonomy (ADR-0004) — used
 * by the in-workout swap picker's "more muscle groups" chips. */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_back: 'Lower back',
  neck: 'Neck',
};

/** Friendly display labels for the training-goal modalities — used by the
 * exercise catalog browser's category filter (settings). */
export const MODALITY_LABELS: Record<Modality, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  mobility: 'Mobility',
  general: 'General',
};

/** Friendly display labels for the full movement-pattern taxonomy (ADR-0101) —
 * used by the exercise catalog browser's category filter (settings). */
export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  push: 'Push',
  pull: 'Pull',
  carry: 'Carry',
  core: 'Core',
  steady_cardio: 'Steady cardio',
  interval: 'Intervals',
  stretch: 'Stretch',
  yoga_flow: 'Yoga flow',
};

/** Friendly display labels for derived exercise intensity (ADR-0123) — used by
 * the catalog browser and workout-details rows via `intensityLabel()`.
 * Deliberately distinct wording per track so the label itself signals which
 * methodology produced it (real MET vs. mechanics-derived load demand), not
 * just a shared 3-tier scale. */
export const INTENSITY_LABELS = {
  cardioLight: 'Light effort',
  cardioModerate: 'Moderate effort',
  cardioVigorous: 'Vigorous effort',
  strengthLighter: 'Lighter load',
  strengthStandard: 'Standard load',
  strengthDemanding: 'Higher load demand',
} as const;

export type GoalLevel = 'low' | 'medium' | 'high';

export const GOAL_LEVEL_WEIGHT: Record<GoalLevel, number> = {
  low: 0.15,
  medium: 0.35,
  high: 0.65,
};

export function areaKey(area: BodyArea): string {
  return `${area.group ?? ''}|${area.region ?? ''}|${area.joint ?? ''}`;
}

/** Reverse-map a raw goal weight back to its nearest level bucket, for editing. */
export function nearestGoalLevel(weight: number): GoalLevel {
  const entries = Object.entries(GOAL_LEVEL_WEIGHT) as [GoalLevel, number][];
  return entries.reduce<GoalLevel>(
    (best, [level, w]) =>
      Math.abs(w - weight) < Math.abs(GOAL_LEVEL_WEIGHT[best] - weight) ? level : best,
    'medium',
  );
}
