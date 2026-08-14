/**
 * Routine CRUD + derived helpers (ADR-0137). Mirrors
 * `services/equipment-profiles.ts`'s shape — a named, user-managed list
 * entity — minus an "active" pointer, since a routine is chosen per-session
 * rather than globally active.
 */

import {
  listRoutines as listRows,
  getRoutine as getRow,
  saveRoutine as saveRow,
  deleteRoutineRow as deleteRow,
} from '../data/persistence';
import type { RoutineRow } from '../data/persistence-types';
import { recommendRoutine as recommendRoutinePure, type RoutineRecommendationContext } from '../domain/engine';
import type { Routine, SessionRecord } from '../domain/types';
import { uid } from './id';
import { getPlan, listHistory } from './sessions';

function rowToRoutine(row: RoutineRow): Routine {
  return JSON.parse(row.routineJson) as Routine;
}

function routineToRow(routine: Routine): RoutineRow {
  return {
    id: routine.id,
    name: routine.name,
    routineJson: JSON.stringify(routine),
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  };
}

export function listRoutines(): Routine[] {
  return listRows().map(rowToRoutine);
}

export function getRoutine(id: string): Routine | undefined {
  const row = getRow(id);
  return row ? rowToRoutine(row) : undefined;
}

export interface CreateRoutineInput {
  name: string;
  exerciseIds: string[];
  workoutType?: Routine['workoutType'];
  recurrenceDaysOfWeek?: number[];
  createdFromSessionId?: string;
}

export function createRoutine(input: CreateRoutineInput): Routine {
  const now = Date.now();
  const routine: Routine = {
    id: uid('routine'),
    name: input.name.trim(),
    exerciseIds: input.exerciseIds,
    workoutType: input.workoutType,
    recurrenceDaysOfWeek: input.recurrenceDaysOfWeek,
    createdFromSessionId: input.createdFromSessionId,
    createdAt: now,
    updatedAt: now,
  };
  saveRow(routineToRow(routine));
  return routine;
}

export function renameRoutine(id: string, name: string): Routine | undefined {
  const routine = getRoutine(id);
  if (!routine) return undefined;
  const next: Routine = { ...routine, name: name.trim(), updatedAt: Date.now() };
  saveRow(routineToRow(next));
  return next;
}

export function updateRoutineExercises(id: string, exerciseIds: string[]): Routine | undefined {
  const routine = getRoutine(id);
  if (!routine) return undefined;
  const next: Routine = { ...routine, exerciseIds, updatedAt: Date.now() };
  saveRow(routineToRow(next));
  return next;
}

export function updateRoutineRecurrence(id: string, recurrenceDaysOfWeek: number[] | undefined): Routine | undefined {
  const routine = getRoutine(id);
  if (!routine) return undefined;
  const next: Routine = { ...routine, recurrenceDaysOfWeek, updatedAt: Date.now() };
  saveRow(routineToRow(next));
  return next;
}

export function deleteRoutine(id: string): void {
  deleteRow(id);
}

/** Bumps usage stats — call once a plan built from this routine is actually started. */
export function markRoutineUsed(id: string): Routine | undefined {
  const routine = getRoutine(id);
  if (!routine) return undefined;
  const next: Routine = { ...routine, lastUsedAt: Date.now(), useCount: (routine.useCount ?? 0) + 1 };
  saveRow(routineToRow(next));
  return next;
}

/** Completed sessions that were run from this routine (ADR-0137) — the
 * history slice routine-level progress views read (volume trend, indices). */
export function routineHistory(routineId: string) {
  return listHistory(200).filter((record) => record.routineId === routineId);
}

/**
 * Builds a routine from a completed workout: the plan's ordered, distinct
 * exercise ids, minus Warmup/Cool down (auto-selected filler, not what the
 * athlete deliberately chose to train).
 */
export function createRoutineFromSession(record: SessionRecord, name: string): Routine | undefined {
  const plan = getPlan(record.planId);
  if (!plan) return undefined;
  const seen = new Set<string>();
  const exerciseIds: string[] = [];
  for (const block of plan.blocks) {
    if (/warm|cool/i.test(block.label)) continue;
    for (const exercise of block.exercises) {
      if (seen.has(exercise.exerciseId)) continue;
      seen.add(exercise.exerciseId);
      exerciseIds.push(exercise.exerciseId);
    }
  }
  return createRoutine({
    name,
    exerciseIds,
    workoutType: plan.workoutType,
    createdFromSessionId: record.id,
  });
}

/** Wraps the pure engine-level scorer with real reads — "have the system
 * pick from my custom routines." */
export function recommendRoutine(context: RoutineRecommendationContext): Routine | undefined {
  return recommendRoutinePure(listRoutines(), context);
}
