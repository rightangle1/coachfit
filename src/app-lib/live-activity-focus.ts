/**
 * Derives what the Live Activity should show right now from the plan/record
 * pair the workout store already holds — no new source of truth, just a view
 * over the existing session state.
 */

import type { SessionPlan, SessionRecord } from '@/domain/types';

export interface LiveWorkoutFocus {
  exerciseId: string;
  exerciseName: string;
  /** 1-based, for display ("Set 2 of 4"). */
  setIndex: number;
  totalSets: number;
  targetReps?: number;
  targetWeightKg?: number;
  targetDurationSec?: number;
  prevExerciseId?: string;
  nextExerciseId?: string;
  setsCompleted: number;
  setsRemaining: number;
}

/**
 * `manualFocusExerciseId` overrides the natural "first incomplete set overall"
 * focus — set by the Live Activity's prev/next buttons, which need to move the
 * displayed exercise without any set actually being logged.
 */
export function deriveLiveFocus(
  plan: SessionPlan | null,
  record: SessionRecord | null,
  manualFocusExerciseId: string | null = null,
): LiveWorkoutFocus | null {
  if (!plan || !record) return null;

  const plannedExercises = plan.blocks.flatMap((block) => block.exercises);
  const allSets = record.performed.flatMap((ex) => ex.sets);
  const setsCompleted = allSets.filter((s) => s.completed).length;
  const setsRemaining = allSets.filter((s) => !s.completed && !s.skipped).length;

  const focusExercise = manualFocusExerciseId
    ? record.performed.find((ex) => ex.exerciseId === manualFocusExerciseId)
    : record.performed.find((ex) => ex.sets.some((s) => !s.completed && !s.skipped));
  if (!focusExercise) return null;

  // Falls back to the last set when the focused exercise has none left to do —
  // reachable via a manual prev/next tap onto an already-finished exercise.
  const incompleteIndex = focusExercise.sets.findIndex((s) => !s.completed && !s.skipped);
  const setIndex = incompleteIndex >= 0 ? incompleteIndex : focusExercise.sets.length - 1;

  const plannedExercise = plannedExercises.find((ex) => ex.exerciseId === focusExercise.exerciseId);
  const plannedSet = plannedExercise?.sets[setIndex];

  const exerciseOrder = plannedExercises.map((ex) => ex.exerciseId);
  const orderIndex = exerciseOrder.indexOf(focusExercise.exerciseId);

  return {
    exerciseId: focusExercise.exerciseId,
    exerciseName: focusExercise.name,
    setIndex: setIndex + 1,
    totalSets: focusExercise.sets.length,
    targetReps: plannedSet?.reps,
    targetWeightKg: plannedSet?.weightKg,
    targetDurationSec: plannedSet?.durationSec,
    prevExerciseId: orderIndex > 0 ? exerciseOrder[orderIndex - 1] : undefined,
    nextExerciseId:
      orderIndex >= 0 && orderIndex < exerciseOrder.length - 1
        ? exerciseOrder[orderIndex + 1]
        : undefined,
    setsCompleted,
    setsRemaining,
  };
}
