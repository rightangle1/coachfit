import { EXERCISES } from '../catalog';
import type { Modality, MovementSlot, MuscleGroup, SessionContext } from '../types';
import { isoWeekStart } from '../metrics';
import { buildHistoryIndex } from './selection-score';
import { equipmentSatisfied } from './matching';

export interface WeeklySessionIntent {
  index: number;
  modality: Modality;
  movementSlots: MovementSlot[];
  priorityMuscles: MuscleGroup[];
  targetSetRange: { min: number; max: number };
  anchorExerciseIds: string[];
}

export interface WeeklyProgram {
  blockWeeks: 6;
  expectedSessions: number;
  sessions: WeeklySessionIntent[];
  today: WeeklySessionIntent;
}

const STRENGTH_SLOTS: MovementSlot[][] = [
  ['squat', 'horizontal_push', 'horizontal_pull', 'anti_extension'],
  ['hinge', 'vertical_push', 'vertical_pull', 'lunge'],
  ['squat', 'hinge', 'carry', 'anti_rotation'],
  ['lunge', 'horizontal_push', 'horizontal_pull', 'lateral_core'],
];

function modalitySchedule(context: SessionContext, count: number): Modality[] {
  const explicit = context.goals.weeklyTargets;
  if (explicit && Object.values(explicit).some((value) => (value ?? 0) > 0)) {
    return (Object.entries(explicit) as [Modality, number][])
      .flatMap(([modality, target]) => Array.from({ length: target }, () => modality))
      .slice(0, count);
  }
  const ranked = (Object.entries(context.goals.weights) as [Modality, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([modality]) => modality);
  return Array.from({ length: count }, (_, index) => ranked[index % ranked.length]);
}

function slotsFor(modality: Modality, index: number): MovementSlot[] {
  if (modality === 'strength') return [...STRENGTH_SLOTS[index % STRENGTH_SLOTS.length]];
  if (modality === 'cardio') return [index % 2 ? 'intervals' : 'steady_cardio'];
  if (modality === 'mobility') return ['mobility', 'balance'];
  return ['squat', 'horizontal_push', 'horizontal_pull', 'steady_cardio', 'anti_extension'];
}

/**
 * Lightweight 4–8 week program boundary. It assigns the week's intent without
 * moving missed work into the next session; daily generation may adapt inside
 * the current intent while the later entries remain intact.
 */
export function buildWeeklyProgram(context: SessionContext): WeeklyProgram {
  const explicitTotal = Object.values(context.goals.weeklyTargets ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  const expectedSessions = Math.max(1, Math.min(7, explicitTotal || 3));
  const schedule = modalitySchedule(context, expectedSessions);
  const { withProgressionBasis } = buildHistoryIndex(context.history);
  const available = EXERCISES.filter((exercise) =>
    equipmentSatisfied(exercise, context.equipment) &&
    !context.excludedExerciseIds?.includes(exercise.id),
  );
  const priorityMuscles = context.targeting.emphasize
    .map((area) => area.group)
    .filter((group): group is MuscleGroup => group != null);
  const setRange = context.athlete.experience === 'beginner'
    ? { min: 2, max: 3 }
    : context.athlete.experience === 'intermediate'
      ? { min: 3, max: 4 }
      : { min: 3, max: 5 };

  const sessions = schedule.map((modality, index): WeeklySessionIntent => {
    const movementSlots = slotsFor(modality, index);
    if (modality === 'strength' && context.goals.resistanceFocus === 'power') movementSlots[0] = 'power';
    const anchorExerciseIds = movementSlots.slice(0, 2).flatMap((slot) => {
      const candidates = available.filter((exercise) => exercise.modality === modality && exercise.movementSlot === slot);
      return [candidates.find((exercise) => withProgressionBasis.has(exercise.id)) ?? candidates[0]]
        .filter((exercise): exercise is (typeof available)[number] => exercise != null)
        .map((exercise) => exercise.id);
    });
    return { index, modality, movementSlots, priorityMuscles, targetSetRange: setRange, anchorExerciseIds };
  });

  const weekStart = isoWeekStart(context.plannedFor);
  const completedThisWeek = context.history.filter((record) =>
    record.completedAt != null && record.completedAt >= weekStart && record.completedAt <= context.plannedFor,
  ).length;
  return {
    blockWeeks: 6,
    expectedSessions,
    sessions,
    today: sessions[Math.min(completedThisWeek, sessions.length - 1)],
  };
}
