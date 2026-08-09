/**
 * Session plan + record persistence (ADR-0108). The workout tracker writes
 * through to storage on every set (crash-safety: never lose in-progress data).
 * `listHistory` / `currentFatigue` feed the engine's ADR-0102/0103 logic with
 * real performed data.
 */

import {
  savePlan as savePlanRow,
  getPlan as getPlanRow,
  saveSessionRecord as saveRecordRow,
  getSessionRecord as getRecordRow,
  listSessionRecords as listRecordRows,
  deleteSessionRecord as deleteRecordRow,
} from '../data/persistence';
import { deriveFatigueFromHistory } from '../domain/engine';
import { EXERCISES } from '../domain/catalog';
import type { FatigueState, SessionPlan, SessionRecord } from '../domain/types';
import { uid } from './id';

export function savePlan(plan: SessionPlan): void {
  savePlanRow({
    id: plan.id,
    plannedFor: plan.plannedFor,
    planJson: JSON.stringify(plan),
    createdAt: Date.now(),
  });
}

export function getPlan(id: string): SessionPlan | undefined {
  const row = getPlanRow(id);
  return row ? (JSON.parse(row.planJson) as SessionPlan) : undefined;
}

/** Create (and immediately persist) a fresh in-progress record for a plan. */
export function startSessionRecord(plan: SessionPlan): SessionRecord {
  const record: SessionRecord = {
    id: uid('sess'),
    planId: plan.id,
    plannedFor: plan.plannedFor,
    startedAt: Date.now(),
    plannedDurationMin: plan.estimatedDurationMin,
    workoutType: plan.workoutType,
    readiness: plan.readiness,
    performed: plan.blocks.flatMap((b) =>
      b.exercises.map((ex) => {
        const catalogExercise = EXERCISES.find((candidate) => candidate.id === ex.exerciseId);
        return {
          exerciseId: ex.exerciseId,
          name: ex.name,
          primaryAreas: ex.primaryAreas,
          secondaryAreas: catalogExercise?.secondaryAreas?.map((group) => ({ group })),
          sets: ex.sets.map((s) => ({
            reps: s.reps,
            weightKg: s.weightKg,
            durationSec: s.durationSec,
            distanceM: s.distanceM,
            rpe: s.targetRpe,
            completed: false,
            isCalibration: s.isCalibration,
            isWarmup: s.isWarmup,
            phase: s.phase,
            // ADR-0125: freeze what was ASKED. The logged fields above are
            // pre-filled from the plan and then edited in the tracker, so
            // without this the record cannot answer "did they do the work?" —
            // which is what double progression reads.
            prescribedReps: s.reps,
            prescribedWeightKg: s.weightKg,
            prescribedRpe: s.targetRpe,
            prescribedDurationSec: s.durationSec,
            prescribedDistanceM: s.distanceM,
            progressionVariable: s.progressionVariable,
            prescribedZone: ex.zone,
          })),
        };
      }),
    ),
  };
  saveSessionRecord(record);
  return record;
}

/** Write-through persistence — call after every set/debrief mutation. */
export function saveSessionRecord(record: SessionRecord): void {
  saveRecordRow({
    id: record.id,
    planId: record.planId,
    plannedFor: record.plannedFor,
    recordJson: JSON.stringify(record),
    updatedAt: Date.now(),
  });
}

export function getSessionRecord(id: string): SessionRecord | undefined {
  const row = getRecordRow(id);
  return row ? (JSON.parse(row.recordJson) as SessionRecord) : undefined;
}

/** Discards an in-progress record entirely — used when a workout is ended
 * early with nothing logged, so it leaves no trace (as if never started). */
export function deleteSessionRecord(id: string): void {
  deleteRecordRow(id);
}

/**
 * The in-progress record, if any (ADR-0108 resumability: a killed/reloaded app
 * can resume by re-loading the record — this is that re-load). At most one
 * should exist at a time in this single-user app.
 */
export function getActiveSessionRecord(): SessionRecord | undefined {
  const rows = listRecordRows(50);
  for (const row of rows) {
    const record = JSON.parse(row.recordJson) as SessionRecord;
    if (record.completedAt == null) return record;
  }
  return undefined;
}

/** Completed sessions only, most recent first — what the engine reasons over. */
export function listHistory(limit = 30): SessionRecord[] {
  return listRecordRows(limit)
    .map((row) => JSON.parse(row.recordJson) as SessionRecord)
    .filter((r) => r.completedAt != null);
}

/**
 * How much history `generateSession` reasons over (ADR-0125).
 *
 * The default 30 rows is a *row count*, not a time window: for someone training
 * five times a week that is barely six weeks, so an exercise not performed in
 * two months reads as "no history at all" — no load recommendation, and the
 * athlete re-enters a weight they have lifted for a year. That was tolerable
 * while selection repeated the same handful of lifts every session; once
 * exercises rotate (ADR-0126) it would quietly destroy progression continuity,
 * because the rotation itself pushes each lift further into the past.
 *
 * 200 rows is roughly nine months at five sessions a week, costs nothing at
 * this app's single-user scale, and matches what the Progress screen already
 * loads. A genuine date-windowed query is the eventual fix, but it needs a
 * storage-layer change and buys nothing until the history is far larger.
 */
export const ENGINE_HISTORY_LIMIT = 200;

/** The history slice the programming engine should reason over. */
export function listEngineHistory(): SessionRecord[] {
  return listHistory(ENGINE_HISTORY_LIMIT);
}

/** Real, history-derived fatigue (fulfills the deferred half of ADR-0102).
 * Age, when known, stretches recovery (ADR-0127). */
export function currentFatigue(ageYears?: number): FatigueState {
  return deriveFatigueFromHistory(listHistory(), Date.now(), { ageYears });
}
