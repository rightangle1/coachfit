import { EXERCISES as SEED_EXERCISES } from './exercises';
import { EXERCISE_MEDIA } from './media';
import { implementFor, mechanicOf } from '../engine/mechanic';
import type {
  Exercise,
  ExerciseDifficulty,
  ImpactLevel,
  MovementSlot,
} from '../types';

export * from './media';

export type CatalogExercise = Exercise & Required<
  Pick<
    Exercise,
    | 'jointLoad'
    | 'difficulty'
    | 'impact'
    | 'prerequisites'
    | 'regressionIds'
    | 'progressionIds'
    | 'substitutionFamily'
    | 'variantFamily'
    | 'movementSlot'
  >
>;

function movementSlotFor(exercise: Exercise): MovementSlot {
  const text = `${exercise.id} ${exercise.name}`.toLowerCase();
  if (/jump|sprint|snatch|clean|push press|plyo|explosive/.test(text)) return 'power';
  switch (exercise.movementPattern) {
    case 'squat': return 'squat';
    case 'hinge': return 'hinge';
    case 'lunge': return 'lunge';
    case 'carry': return 'carry';
    case 'steady_cardio': return 'steady_cardio';
    case 'interval': return 'intervals';
    case 'aerobics': return 'aerobics';
    case 'stretch': return text.includes('balance') || exercise.flowStage === 'balance' ? 'balance' : 'mobility';
    case 'yoga_flow': return exercise.flowStage === 'balance' ? 'balance' : 'mobility';
    case 'barre_flow': return 'mobility';
    case 'pilates_flow': return exercise.flowStage === 'core' ? 'anti_extension' : 'mobility';
    case 'push':
      return /overhead|shoulder press|military|handstand|pike/.test(text) ? 'vertical_push' : 'horizontal_push';
    case 'pull':
      return /pull[- ]?up|chin[- ]?up|pulldown|lat pull|vertical/.test(text) ? 'vertical_pull' : 'horizontal_pull';
    case 'core':
      if (/pallof|anti.?rotation|wood.?chop|rotation/.test(text)) return 'anti_rotation';
      if (/side plank|lateral|suitcase/.test(text)) return 'lateral_core';
      if (/back extension|superman|bird dog/.test(text)) return 'trunk_extension';
      if (/crunch|sit.?up|leg raise|knee raise/.test(text)) return 'trunk_flexion';
      return 'anti_extension';
  }
}

function difficultyFor(exercise: Exercise): ExerciseDifficulty {
  const text = `${exercise.id} ${exercise.name}`.toLowerCase();
  if (/snatch|clean and jerk|muscle.?up|pistol|handstand|dragon flag|overhead squat/.test(text)) return 'advanced';
  if (/barbell|pull[- ]?up|chin[- ]?up|dip|bulgarian|single.?leg|renegade/.test(text)) return 'intermediate';
  return 'beginner';
}

function impactFor(exercise: Exercise): ImpactLevel {
  const text = `${exercise.id} ${exercise.name}`.toLowerCase();
  if (exercise.movementPattern === 'interval' || /jump|sprint|run|burpee|box jump/.test(text)) return 'high';
  if (exercise.movementPattern === 'squat' || exercise.movementPattern === 'lunge' || /jog|step.?up/.test(text)) return 'moderate';
  return 'low';
}

/**
 * "Same movement, done slightly differently" (ADR-0134) — the redundancy key,
 * deliberately narrower than `substitutionFamily`. Slot fixes the movement,
 * implement separates bodyweight variants from loaded ones, and mechanic keeps a
 * press apart from a fly. So all six push-up variants collapse to one family
 * while dumbbell bench press and dumbbell fly stay distinct from it and from
 * each other.
 */
function variantFamilyFor(exercise: Exercise, movementSlot: MovementSlot): string {
  return `${movementSlot}:${implementFor(exercise)}:${mechanicOf(exercise)}`;
}

function jointsFor(exercise: Exercise): string[] {
  if (exercise.jointLoad?.length) return exercise.jointLoad;
  switch (exercise.movementPattern) {
    case 'squat':
    case 'lunge': return ['knee', 'hip', 'ankle'];
    case 'hinge': return ['hip', 'low_back'];
    case 'push': return ['shoulder', 'elbow', 'wrist'];
    case 'pull': return ['shoulder', 'elbow'];
    case 'carry': return ['shoulder', 'wrist', 'spine'];
    case 'core': return ['spine'];
    case 'steady_cardio':
    case 'interval':
    case 'aerobics': return ['knee', 'hip', 'ankle'];
    case 'stretch':
    case 'yoga_flow': return ['spine', 'hip', 'shoulder'];
    case 'barre_flow': return ['knee', 'hip', 'ankle', 'spine'];
    case 'pilates_flow': return ['spine', 'hip'];
  }
}

/**
 * Seed catalog plus deterministic safety metadata. Central enrichment keeps
 * legacy seed rows readable while guaranteeing every selectable exercise has
 * the fields substitution and programming rules require.
 */
const ENRICHED_EXERCISES: CatalogExercise[] = SEED_EXERCISES.map((exercise) => {
  const media = EXERCISE_MEDIA[exercise.id];
  const movementSlot = exercise.movementSlot ?? movementSlotFor(exercise);
  return {
    ...exercise,
    ...(media ? { media } : {}),
    movementSlot,
    jointLoad: jointsFor(exercise),
    difficulty: exercise.difficulty ?? difficultyFor(exercise),
    impact: exercise.impact ?? impactFor(exercise),
    prerequisites: exercise.prerequisites ?? [],
    regressionIds: exercise.regressionIds ?? [],
    progressionIds: exercise.progressionIds ?? [],
    substitutionFamily:
      exercise.substitutionFamily ?? `${exercise.modality}:${movementSlot}:${exercise.primaryAreas[0] ?? 'general'}`,
    variantFamily: exercise.variantFamily ?? variantFamilyFor(exercise, movementSlot),
  };
});

const DIFFICULTY_RANK: Record<ExerciseDifficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Add graph relationships after every row has a family and difficulty. */
export const EXERCISES: CatalogExercise[] = ENRICHED_EXERCISES.map((exercise) => {
  const family = ENRICHED_EXERCISES.filter((candidate) =>
    candidate.id !== exercise.id && candidate.substitutionFamily === exercise.substitutionFamily,
  );
  const regressions = family
    .filter((candidate) => DIFFICULTY_RANK[candidate.difficulty] < DIFFICULTY_RANK[exercise.difficulty])
    .sort((a, b) => DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty]);
  const progressions = family
    .filter((candidate) => DIFFICULTY_RANK[candidate.difficulty] > DIFFICULTY_RANK[exercise.difficulty])
    .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]);
  const regressionIds = exercise.regressionIds.length ? exercise.regressionIds : regressions.slice(0, 2).map((candidate) => candidate.id);
  return {
    ...exercise,
    regressionIds,
    progressionIds: exercise.progressionIds.length ? exercise.progressionIds : progressions.slice(0, 2).map((candidate) => candidate.id),
    prerequisites:
      exercise.prerequisites.length || exercise.difficulty === 'beginner'
        ? exercise.prerequisites
        : regressionIds.slice(0, 1),
  };
});
