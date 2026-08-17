/**
 * Two-level goal taxonomy for onboarding — 5 primary goals, each with 2-4
 * subtypes (~14 total). Picking a (primary, subtype) pair is a *preset* that
 * resolves to the engine inputs the app already understands: `weights`,
 * `resistanceFocus`, `preferredWorkoutType`, `weeklyTargets`.
 *
 * Deliberately a capture-layer concept, separate from `Modality` (which stays
 * exactly 4 values — it's also the exercise catalog's tag) and separate from
 * `GOAL_STORIES` (which stays keyed on `Modality` for GoalHero surfaces on
 * Progress/Today/equipment, untouched by this taxonomy).
 */

import type { ImageSourcePropType } from 'react-native';
import type { ContextTone, IconName } from '@/design';
import type { AthleteProfile, CardioIntent, Modality, ModalityWeights, ResistanceFocus, RestPacing, WorkoutType } from '@/domain/types';

export type PrimaryGoalId = 'build_strength' | 'improve_cardio' | 'move_better' | 'lose_weight' | 'general_fitness';

export interface GoalPresetResolution {
  weights: ModalityWeights;
  resistanceFocus?: ResistanceFocus;
  preferredWorkoutType?: WorkoutType;
  /** Standing cardio-format lean (ADR-0143-adjacent) — only set on presets
   * whose whole identity is a cardio-format claim; left unset elsewhere so
   * the athlete's day-to-day rotation stays fully varied by default. */
  preferredCardioIntent?: CardioIntent;
  weeklyTargets?: Partial<Record<Modality, number>>;
  /**
   * Today-builder duration-picker pre-fill only (e.g. General Fitness/Fat
   * Loss subtypes suggest 30, Build Muscle suggests 50) — never read by the
   * engine, and never overrides an athlete's own explicit duration choice
   * once they've made one.
   */
  suggestedDurationMin?: number;
  /** Standing rest/pacing lean (ADR-0145) — only set on presets whose whole
   * identity is a fast-paced/dense claim. */
  restPacing?: RestPacing;
}

export interface GoalPreset {
  /** e.g. 'build_strength.max_strength' — persisted as TrainingGoals.presetId */
  id: string;
  primaryGoalId: PrimaryGoalId;
  label: string;
  description: string;
  resolve: GoalPresetResolution;
  /** Optional art for the onboarding subtype grid tile; unset falls back to
   * the plain text `ChoiceTile` look (see `SubtypeChoiceCard`). */
  cardImage?: ImageSourcePropType;
}

export interface PrimaryGoalOption {
  id: PrimaryGoalId;
  label: string;
  promise: string;
  cardImage: ImageSourcePropType;
  icon: IconName;
  tone: ContextTone;
  /** e.g. "WHAT'S THE FOCUS?" — heading shown above the subtype tiles. */
  subtypePrompt: string;
}

export const PRIMARY_GOAL_OPTIONS: PrimaryGoalOption[] = [
  {
    id: 'build_strength',
    label: 'Build strength',
    promise: 'Lift heavier, build muscle, or get stronger for everyday life.',
    cardImage: require('../../assets/images/goals/strength-card.webp'),
    icon: 'goalStrength',
    tone: 'strength',
    subtypePrompt: "WHAT'S THE FOCUS?",
  },
  {
    id: 'improve_cardio',
    label: 'Improve cardio & endurance',
    promise: 'Go farther, recover faster, and build a bigger engine.',
    cardImage: require('../../assets/images/goals/endurance-card.webp'),
    icon: 'goalCardio',
    tone: 'endurance',
    subtypePrompt: "WHAT'S THE FOCUS?",
  },
  {
    id: 'move_better',
    label: 'Move & feel better',
    promise: 'More range, less stiffness, and a calmer relationship with your body.',
    cardImage: require('../../assets/images/goals/mobility-card.webp'),
    icon: 'goalMobility',
    tone: 'mobility',
    subtypePrompt: "WHAT'S THE FOCUS?",
  },
  {
    id: 'lose_weight',
    label: 'Lose weight / burn fat',
    promise: 'A calorie-burning plan built around real strength and cardio work.',
    cardImage: require('../../assets/images/goals/fat-burn-card.webp'),
    icon: 'goalBurn',
    tone: 'primary',
    subtypePrompt: 'HOW DO YOU WANT TO GET THERE?',
  },
  {
    id: 'general_fitness',
    label: 'General fitness / stay active',
    promise: 'A well-rounded, low-commitment plan that keeps you consistent.',
    cardImage: require('../../assets/images/editorial/explore-general-v1.webp'),
    icon: 'target',
    tone: 'accent',
    subtypePrompt: 'YOUR PLAN',
  },
];

export const GOAL_PRESETS: GoalPreset[] = [
  // --- Build Strength (dominant: strength) ---
  {
    id: 'build_strength.max_strength',
    primaryGoalId: 'build_strength',
    label: 'Max Strength',
    description: 'A singular, peaking-block-style focus on lifting the heaviest weight you can.',
    cardImage: require('../../assets/images/editorial/explore-deadlift-v1.webp'),
    resolve: {
      weights: { strength: 0.75, cardio: 0.11, mobility: 0.07, general: 0.07 },
      resistanceFocus: 'max_strength',
      suggestedDurationMin: 50,
    },
  },
  {
    id: 'build_strength.hypertrophy',
    primaryGoalId: 'build_strength',
    label: 'Build Muscle',
    description: 'Bodybuilding-style training for visible size — moderate loads, higher volume.',
    cardImage: require('../../assets/images/editorial/explore-strength-v1.webp'),
    resolve: {
      weights: { strength: 0.65, cardio: 0.10, mobility: 0.10, general: 0.15 },
      resistanceFocus: 'hypertrophy',
      preferredWorkoutType: 'bodybuilding',
      suggestedDurationMin: 50,
    },
  },
  {
    id: 'build_strength.tone_sculpt',
    primaryGoalId: 'build_strength',
    label: 'Tone & Sculpt',
    description: 'Full-body toning across every major muscle group with lighter, higher-rep work.',
    cardImage: require('../../assets/images/editorial/today-strength-v1.webp'),
    resolve: {
      weights: { strength: 0.55, cardio: 0.15, mobility: 0.15, general: 0.15 },
      resistanceFocus: 'muscular_endurance',
      preferredWorkoutType: 'sculpting',
      suggestedDurationMin: 40,
    },
  },
  {
    id: 'build_strength.functional_strength',
    primaryGoalId: 'build_strength',
    label: 'Functional Strength',
    description: 'Bodyweight-first strength that carries over to everyday movement, no equipment required.',
    cardImage: require('../../assets/images/goals/subtypes/functional-strength-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.60, cardio: 0.15, mobility: 0.15, general: 0.10 },
      resistanceFocus: 'general',
      preferredWorkoutType: 'bodyweight',
      suggestedDurationMin: 40,
    },
  },

  // --- Improve Cardio & Endurance (dominant: cardio) ---
  {
    id: 'improve_cardio.build_endurance',
    primaryGoalId: 'improve_cardio',
    label: 'Build Endurance',
    description: 'Steady conditioning work to grow your aerobic base over time.',
    cardImage: require('../../assets/images/editorial/endurance-run-v1.webp'),
    resolve: {
      weights: { strength: 0.15, cardio: 0.65, mobility: 0.10, general: 0.10 },
      preferredWorkoutType: 'cardio',
      preferredCardioIntent: 'basic',
      suggestedDurationMin: 40,
    },
  },
  {
    id: 'improve_cardio.get_fitter_fast',
    primaryGoalId: 'improve_cardio',
    label: 'Get Fitter Fast',
    description: 'Higher-effort cardio sessions for a faster return on conditioning.',
    cardImage: require('../../assets/images/goals/subtypes/cardio-interval-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.15, cardio: 0.65, mobility: 0.10, general: 0.10 },
      preferredWorkoutType: 'cardio',
      preferredCardioIntent: 'interval',
      suggestedDurationMin: 30,
    },
  },
  {
    id: 'improve_cardio.sport_conditioning',
    primaryGoalId: 'improve_cardio',
    label: 'Sport & Functional Conditioning',
    description: 'Cardio built to support performance in sport or other physical activities.',
    cardImage: require('../../assets/images/goals/subtypes/sport-conditioning-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.20, cardio: 0.55, mobility: 0.15, general: 0.10 },
      preferredWorkoutType: 'cardio',
      preferredCardioIntent: 'circuit',
      suggestedDurationMin: 40,
    },
  },

  // --- Move & Feel Better (dominant: mobility) ---
  {
    id: 'move_better.flexibility',
    primaryGoalId: 'move_better',
    label: 'Increase Flexibility & Range of Motion',
    description: 'Purposeful mobility work to open up tight areas and move more freely.',
    cardImage: require('../../assets/images/editorial/explore-mobility-v1.webp'),
    resolve: {
      weights: { strength: 0.15, cardio: 0.15, mobility: 0.60, general: 0.10 },
      suggestedDurationMin: 30,
    },
  },
  {
    id: 'move_better.active_recovery',
    primaryGoalId: 'move_better',
    label: 'Active Recovery',
    description: 'Gentle movement between harder sessions to help you recover and stay consistent.',
    cardImage: require('../../assets/images/editorial/recovery-stretch-v1.webp'),
    resolve: {
      weights: { strength: 0.10, cardio: 0.15, mobility: 0.55, general: 0.20 },
      suggestedDurationMin: 20,
    },
  },
  {
    id: 'move_better.stress_relief',
    primaryGoalId: 'move_better',
    label: 'Stress Relief & Mind-Body Connection',
    description: 'Slower, breath-led sessions focused on feeling calmer and more centered.',
    cardImage: require('../../assets/images/goals/subtypes/stress-relief-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.10, cardio: 0.10, mobility: 0.65, general: 0.15 },
      suggestedDurationMin: 30,
    },
  },

  // --- Lose Weight / Burn Fat (dominant: general) ---
  {
    id: 'lose_weight.with_strength',
    primaryGoalId: 'lose_weight',
    label: 'Fat Loss with Strength',
    description: 'A calorie-burning plan anchored in resistance training to protect muscle while you lean out.',
    cardImage: require('../../assets/images/goals/subtypes/fat-loss-strength-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.35, cardio: 0.20, mobility: 0.05, general: 0.40 },
      resistanceFocus: 'general',
      weeklyTargets: { strength: 3, cardio: 2, mobility: 1 },
      suggestedDurationMin: 40,
      restPacing: 'dense',
    },
  },
  {
    id: 'lose_weight.with_cardio',
    primaryGoalId: 'lose_weight',
    label: 'Fat Loss with Cardio',
    description: 'A calorie-burning plan led by cardio, with strength work to round things out.',
    cardImage: require('../../assets/images/goals/subtypes/fat-loss-cardio-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.20, cardio: 0.35, mobility: 0.05, general: 0.40 },
      weeklyTargets: { cardio: 3, strength: 2, mobility: 1 },
      suggestedDurationMin: 30,
      restPacing: 'dense',
    },
  },
  {
    id: 'lose_weight.metabolic_conditioning',
    primaryGoalId: 'lose_weight',
    label: 'Metabolic Conditioning / Circuit Training',
    description: 'Fast-paced, blended sessions designed to keep your heart rate up throughout.',
    cardImage: require('../../assets/images/goals/subtypes/metabolic-conditioning-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.15, cardio: 0.50, mobility: 0.05, general: 0.30 },
      preferredWorkoutType: 'cardio',
      preferredCardioIntent: 'circuit',
      suggestedDurationMin: 30,
      restPacing: 'dense',
    },
  },

  // --- General Fitness / Stay Active (dominant: general) ---
  {
    id: 'general_fitness.balanced',
    primaryGoalId: 'general_fitness',
    label: 'Balanced',
    description: 'A well-rounded mix of strength, cardio, and mobility to stay active and consistent.',
    cardImage: require('../../assets/images/goals/subtypes/balanced-thumbnail.webp'),
    resolve: {
      weights: { strength: 0.20, cardio: 0.20, mobility: 0.20, general: 0.40 },
      suggestedDurationMin: 30,
    },
  },
];

export const GOAL_PRESETS_BY_ID: Record<string, GoalPreset> = Object.fromEntries(
  GOAL_PRESETS.map((preset) => [preset.id, preset]),
);

export const PRIMARY_GOAL_OPTIONS_BY_ID: Record<PrimaryGoalId, PrimaryGoalOption> = Object.fromEntries(
  PRIMARY_GOAL_OPTIONS.map((option) => [option.id, option]),
) as Record<PrimaryGoalId, PrimaryGoalOption>;

export function subtypesFor(id: PrimaryGoalId): GoalPreset[] {
  return GOAL_PRESETS.filter((preset) => preset.primaryGoalId === id);
}

export function defaultSubtypeFor(id: PrimaryGoalId): GoalPreset {
  return subtypesFor(id)[0];
}

const MODALITIES: Modality[] = ['strength', 'cardio', 'mobility', 'general'];

const DOMINANT_MODALITY_TO_GROUP: Record<Modality, PrimaryGoalId> = {
  strength: 'build_strength',
  cardio: 'improve_cardio',
  mobility: 'move_better',
  // A 'general'-dominant profile falls back to General Fitness, not Lose
  // Weight — the safer of two ambiguous guesses when reverse-inferring from
  // raw weights alone (no presetId to disambiguate).
  general: 'general_fitness',
};

/** Best-effort subtype match for a pre-existing profile with no `presetId` —
 * scores each subtype in the group by how many of its distinguishing fields
 * agree with the athlete's current settings, favoring specificity. */
function bestSubtypeMatch(
  group: PrimaryGoalId,
  resistanceFocus: ResistanceFocus | undefined,
  preferredWorkoutType: WorkoutType | undefined,
): GoalPreset {
  const candidates = subtypesFor(group);
  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = 0;
    if (candidate.resolve.resistanceFocus && candidate.resolve.resistanceFocus === resistanceFocus) score += 2;
    if (candidate.resolve.preferredWorkoutType && candidate.resolve.preferredWorkoutType === preferredWorkoutType) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Seeds the onboarding picker's initial (primary, subtype) selection.
 * Prefers the athlete's stored `presetId` when present; otherwise infers a
 * best-effort match from raw weights/resistanceFocus/preferredWorkoutType for
 * profiles created before this taxonomy existed.
 */
export function resolveInitialGoalSelection(
  existing?: AthleteProfile,
): { primaryGoalId: PrimaryGoalId; subtypePresetId: string } {
  const known = existing?.goals.presetId ? GOAL_PRESETS_BY_ID[existing.goals.presetId] : undefined;
  if (known) return { primaryGoalId: known.primaryGoalId, subtypePresetId: known.id };

  if (!existing) {
    return { primaryGoalId: 'general_fitness', subtypePresetId: defaultSubtypeFor('general_fitness').id };
  }

  const weights = existing.goals.weights;
  const dominant = MODALITIES.reduce(
    (best, modality) => ((weights[modality] ?? 0) > (weights[best] ?? 0) ? modality : best),
    MODALITIES[0],
  );
  const primaryGoalId = DOMINANT_MODALITY_TO_GROUP[dominant];
  const subtype = bestSubtypeMatch(primaryGoalId, existing.goals.resistanceFocus, existing.preferredWorkoutType);
  return { primaryGoalId, subtypePresetId: subtype.id };
}
