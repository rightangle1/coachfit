/**
 * Active-workout store (ADR-0002: Zustand for ephemeral UI state). The database
 * (via services/sessions) remains the source of truth — every mutation here
 * writes through immediately so an in-progress workout survives a crash or
 * backgrounding (ADR-0108 offline guarantee).
 */

import { create } from 'zustand';
import type { EndedEarlyReason, PerformedSet, SessionPlan, SessionRecord } from '@/domain/types';
import { savePlan, saveSessionRecord, startSessionRecord, listHistory, deleteSessionRecord } from '@/services/sessions';
import { EXERCISES } from '@/domain/catalog';
import { bestE1rmSnapshot, evaluateAchievements } from '@/domain/metrics';
import { normalizeSupersets, updateSetWithCascade } from '@/app-lib/workout-editing';
import { deriveLiveFocus, type LiveWorkoutFocus } from '@/app-lib/live-activity-focus';
import { writeWorkoutToHealth } from '@/services/health-writeback';

interface WorkoutState {
  plan: SessionPlan | null;
  record: SessionRecord | null;
  /** A workout the athlete has built on Today but not yet started — lets the
   * Workout tab preload it (ADR-0130 "start from either tab") instead of
   * showing "no workout in progress" until `start` is called. */
  builtPlan: SessionPlan | null;
  setBuiltPlan: (plan: SessionPlan | null) => void;
  /** Best-ever e1RM per exercise as of workout start — the baseline a live
   * in-session PR is compared against (see `bestE1rmSnapshot`). */
  preSessionBestE1rm: Record<string, number>;
  /** Achievement ids already unlocked before this session started — the
   * debrief screen diffs against this to find what THIS session unlocked. */
  preSessionAchievementIds: Set<string>;
  /** Achievement ids already celebrated live (big burst) during this session,
   * so the debrief recap doesn't re-trigger the same celebration twice. */
  liveCelebratedIds: Set<string>;
  recordLiveCelebration: (id: string) => void;
  /** What the iOS Live Activity should currently show — derived, not a
   * separate source of truth. Null on Android/web (nothing consumes it). */
  liveFocus: LiveWorkoutFocus | null;
  /** Epoch ms the current rest window ends, or null when not resting. Can
   * only be computed imperatively at the moment a set completes — there is no
   * per-set completion timestamp to derive it from after the fact. */
  restEndsAt: number | null;
  /** Manual override from the Live Activity's prev/next buttons — lets the
   * displayed exercise move without any set being logged. Sticky until
   * changed again or the session restarts. */
  manualFocusExerciseId: string | null;
  setManualFocus: (exerciseId: string | null) => void;
  toggleTimerPause: () => void;
  start: (plan: SessionPlan) => void;
  /** Rehydrate an already-persisted in-progress session (ADR-0108 resumability)
   * without creating a new record or writing anything. */
  hydrate: (plan: SessionPlan, record: SessionRecord) => void;
  updateSet: (exerciseId: string, setIndex: number, patch: Partial<PerformedSet>) => void;
  toggleComplete: (exerciseId: string, setIndex: number) => void;
  skipSet: (exerciseId: string, setIndex: number) => void;
  /** How the top set of this exercise felt — applied to all its sets at once. */
  setExerciseRpe: (exerciseId: string, rpe: number) => void;
  /** Applies an engine adjustment to the plan and refreshes unfinished set targets. */
  applyAdjustedPlan: (plan: SessionPlan, exerciseId: string) => void;
  /** Applies a manual exercise swap: replaces the performed entry's identity and
   * resets its sets to the new exercise's prescription (ADR-0113). */
  applySwap: (plan: SessionPlan, previousExerciseId: string, newExerciseId: string) => void;
  /** Applies an overview edit (order, grouping, add, remove, or replace) and
   * keeps every matching performed exercise intact. */
  applyPlanEdit: (plan: SessionPlan) => void;
  /** Appends a set to an exercise, cloned from its last set (untouched by the plan). */
  addSet: (exerciseId: string) => void;
  /** Removes the last set of an exercise, unless it's the only one or already logged. */
  removeSet: (exerciseId: string) => void;
  finish: () => SessionRecord | null;
  /** Ends the workout before all sets are logged: marks any still-unlogged sets
   * skipped (an honest record, not a fabricated completion) and flags `endedEarly`.
   * If nothing was actually logged, discards the record entirely instead —
   * ending early with zero progress leaves no trace in history, as if the
   * workout was never started. Returns null in that no-op case. */
  endEarly: (reason?: EndedEarlyReason) => SessionRecord | null;
  clear: () => void;
}

/** Precomputed once at start/hydrate — `listHistory()` already filters to
 * `completedAt != null`, so the in-progress session's own write-through
 * record never contaminates its own baseline. */
function preSessionSnapshots(plan: SessionPlan) {
  const exerciseIds = plan.blocks.flatMap((b) => b.exercises).map((e) => e.exerciseId);
  const history = listHistory(500);
  return {
    preSessionBestE1rm: bestE1rmSnapshot(history, exerciseIds),
    preSessionAchievementIds: new Set(evaluateAchievements(history).unlocked.map((a) => a.id)),
  };
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  plan: null,
  record: null,
  builtPlan: null,
  preSessionBestE1rm: {},
  preSessionAchievementIds: new Set(),
  liveCelebratedIds: new Set(),
  liveFocus: null,
  restEndsAt: null,
  manualFocusExerciseId: null,

  setBuiltPlan: (plan) => set({ builtPlan: plan }),

  recordLiveCelebration: (id) => {
    set((state) => ({ liveCelebratedIds: new Set(state.liveCelebratedIds).add(id) }));
  },

  setManualFocus: (exerciseId) => {
    const { plan, record } = get();
    set({ manualFocusExerciseId: exerciseId, liveFocus: deriveLiveFocus(plan, record, exerciseId) });
  },

  toggleTimerPause: () => {
    const { record } = get();
    if (!record?.startedAt) return;
    const now = Date.now();
    const next: SessionRecord = record.pausedAt
      ? {
          ...record,
          pausedAt: undefined,
          pausedDurationMs: (record.pausedDurationMs ?? 0) + now - record.pausedAt,
        }
      : { ...record, pausedAt: now };
    saveSessionRecord(next);
    set({ record: next });
  },

  start: (plan) => {
    const record = startSessionRecord(plan);
    set({
      plan,
      record,
      builtPlan: null,
      liveCelebratedIds: new Set(),
      manualFocusExerciseId: null,
      restEndsAt: null,
      liveFocus: deriveLiveFocus(plan, record, null),
      ...preSessionSnapshots(plan),
    });
  },

  hydrate: (plan, record) =>
    set({
      plan,
      record,
      liveCelebratedIds: new Set(),
      manualFocusExerciseId: null,
      restEndsAt: null,
      liveFocus: deriveLiveFocus(plan, record, null),
      ...preSessionSnapshots(plan),
    }),

  updateSet: (exerciseId, setIndex, patch) => {
    const { record, plan, manualFocusExerciseId } = get();
    if (!record) return;
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((ex) =>
        ex.exerciseId !== exerciseId
          ? ex
          : { ...ex, sets: updateSetWithCascade(ex.sets, setIndex, patch) },
      ),
    };
    saveSessionRecord(next);

    let restEndsAt = get().restEndsAt;
    if (patch.completed !== undefined) {
      const exercise = next.performed.find((ex) => ex.exerciseId === exerciseId);
      const hasRemaining = exercise?.sets.some((s) => !s.completed && !s.skipped) ?? false;
      const plannedSet = plan?.blocks
        .flatMap((block) => block.exercises)
        .find((ex) => ex.exerciseId === exerciseId)?.sets[setIndex];
      restEndsAt =
        patch.completed && hasRemaining && plannedSet?.restSec != null
          ? Date.now() + plannedSet.restSec * 1000
          : null;
    }

    set({ record: next, restEndsAt, liveFocus: deriveLiveFocus(plan, next, manualFocusExerciseId) });
  },

  toggleComplete: (exerciseId, setIndex) => {
    const { record } = get();
    if (!record) return;
    const ex = record.performed.find((e) => e.exerciseId === exerciseId);
    const current = ex?.sets[setIndex]?.completed ?? false;
    get().updateSet(exerciseId, setIndex, { completed: !current, skipped: false });
  },

  skipSet: (exerciseId, setIndex) => {
    get().updateSet(exerciseId, setIndex, { completed: false, skipped: true });
  },

  setExerciseRpe: (exerciseId, rpe) => {
    const { record } = get();
    if (!record) return;
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((ex) =>
        ex.exerciseId !== exerciseId
          ? ex
          : { ...ex, sets: ex.sets.map((s) => ({ ...s, rpe })) },
      ),
    };
    saveSessionRecord(next);
    set({ record: next });
  },

  applyAdjustedPlan: (plan, exerciseId) => {
    const { record, manualFocusExerciseId } = get();
    savePlan(plan);
    if (!record) {
      set({ plan });
      return;
    }
    const planned = plan.blocks.flatMap((block) => block.exercises).find((ex) => ex.exerciseId === exerciseId);
    if (!planned) {
      set({ plan });
      return;
    }
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((exercise) =>
        exercise.exerciseId !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, index) => {
                const target = planned.sets[index];
                if (set.completed || set.skipped || !target) return set;
                return {
                  ...set,
                  reps: target.reps ?? set.reps,
                  weightKg: target.weightKg ?? set.weightKg,
                  durationSec: target.durationSec ?? set.durationSec,
                  distanceM: target.distanceM ?? set.distanceM,
                  phase: target.phase ?? set.phase,
                  rpe: target.targetRpe ?? set.rpe,
                  // An edited plan is a new ask (ADR-0125) — keep the frozen
                  // prescription in step with it for sets not yet logged.
                  prescribedReps: target.reps ?? set.prescribedReps,
                  prescribedRpe: target.targetRpe ?? set.prescribedRpe,
                  prescribedDurationSec: target.durationSec ?? set.prescribedDurationSec,
                  prescribedZone: planned.zone ?? set.prescribedZone,
                  isWarmup: target.isWarmup ?? set.isWarmup,
                };
              }),
            },
      ),
    };
    saveSessionRecord(next);
    set({ plan, record: next, liveFocus: deriveLiveFocus(plan, next, manualFocusExerciseId) });
  },

  applySwap: (plan, previousExerciseId, newExerciseId) => {
    const { record, manualFocusExerciseId } = get();
    savePlan(plan);
    if (!record) {
      set({ plan });
      return;
    }
    const planned = plan.blocks
      .flatMap((block) => block.exercises)
      .find((ex) => ex.exerciseId === newExerciseId);
    if (!planned) {
      set({ plan });
      return;
    }
    const catalogExercise = EXERCISES.find((exercise) => exercise.id === newExerciseId);
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((exercise) =>
        exercise.exerciseId !== previousExerciseId
          ? exercise
          : {
              exerciseId: planned.exerciseId,
              name: planned.name,
              primaryAreas: planned.primaryAreas,
              secondaryAreas: catalogExercise?.secondaryAreas?.map((group) => ({ group })),
              sets: planned.sets.map((s) => ({
                reps: s.reps,
                weightKg: s.weightKg,
                durationSec: s.durationSec,
                distanceM: s.distanceM,
                rpe: s.targetRpe,
                completed: false,
                isCalibration: s.isCalibration,
                isWarmup: s.isWarmup,
                phase: s.phase,
                prescribedReps: s.reps,
                prescribedRpe: s.targetRpe,
                prescribedDurationSec: s.durationSec,
                prescribedZone: planned.zone,
              })),
            },
      ),
    };
    saveSessionRecord(next);
    set({ plan, record: next, liveFocus: deriveLiveFocus(plan, next, manualFocusExerciseId) });
  },

  applyPlanEdit: (plan) => {
    const { record, manualFocusExerciseId } = get();
    const normalizedPlan: SessionPlan = {
      ...plan,
      blocks: plan.blocks.map((block) => ({
        ...block,
        exercises: normalizeSupersets(block.exercises),
      })),
    };
    savePlan(normalizedPlan);
    if (!record) {
      set({ plan: normalizedPlan });
      return;
    }

    const existing = new Map(record.performed.map((exercise) => [exercise.exerciseId, exercise]));
    const next: SessionRecord = {
      ...record,
      performed: normalizedPlan.blocks.flatMap((block) => block.exercises).map((planned) => {
        const prior = existing.get(planned.exerciseId);
        const catalogExercise = EXERCISES.find((exercise) => exercise.id === planned.exerciseId);
        if (prior) {
          return {
            ...prior,
            name: planned.name,
            primaryAreas: planned.primaryAreas,
            secondaryAreas: catalogExercise?.secondaryAreas?.map((group) => ({ group })),
            // A plan edit changes every not-yet-logged target, while a logged
            // set remains the athlete's actual history. This also lets the
            // overview add or remove unlogged working sets safely.
            sets: planned.sets.map((set, index) => {
              const priorSet = prior.sets[index];
              if (priorSet?.completed || priorSet?.skipped) return priorSet;
              return {
                reps: set.reps,
                weightKg: set.weightKg,
                durationSec: set.durationSec,
                distanceM: set.distanceM,
                rpe: set.targetRpe,
                completed: false,
                isCalibration: set.isCalibration,
                phase: set.phase,
              };
            }),
          };
        }
        return {
          exerciseId: planned.exerciseId,
          name: planned.name,
          primaryAreas: planned.primaryAreas,
          secondaryAreas: catalogExercise?.secondaryAreas?.map((group) => ({ group })),
          sets: planned.sets.map((set) => ({
            reps: set.reps,
            weightKg: set.weightKg,
            durationSec: set.durationSec,
            distanceM: set.distanceM,
            rpe: set.targetRpe,
            completed: false,
            isCalibration: set.isCalibration,
            phase: set.phase,
          })),
        };
      }),
    };
    saveSessionRecord(next);
    set({ plan: normalizedPlan, record: next, liveFocus: deriveLiveFocus(normalizedPlan, next, manualFocusExerciseId) });
  },

  addSet: (exerciseId) => {
    const { record, plan, manualFocusExerciseId } = get();
    if (!record) return;
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              reps: last?.reps,
              weightKg: last?.weightKg,
              durationSec: last?.durationSec,
              distanceM: last?.distanceM,
              rpe: last?.rpe,
              completed: false,
            },
          ],
        };
      }),
    };
    saveSessionRecord(next);
    set({ record: next, liveFocus: deriveLiveFocus(plan, next, manualFocusExerciseId) });
  },

  removeSet: (exerciseId) => {
    const { record, plan, manualFocusExerciseId } = get();
    if (!record) return;
    const next: SessionRecord = {
      ...record,
      performed: record.performed.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const last = ex.sets[ex.sets.length - 1];
        if (ex.sets.length <= 1 || last?.completed) return ex;
        return { ...ex, sets: ex.sets.slice(0, -1) };
      }),
    };
    saveSessionRecord(next);
    set({ record: next, liveFocus: deriveLiveFocus(plan, next, manualFocusExerciseId) });
  },

  finish: () => {
    const { record } = get();
    if (!record) return null;
    const completedAt = Date.now();
    const finished: SessionRecord = {
      ...record,
      completedAt,
      pausedAt: undefined,
      pausedDurationMs: (record.pausedDurationMs ?? 0) + (record.pausedAt ? completedAt - record.pausedAt : 0),
    };
    saveSessionRecord(finished);
    set({ record: finished, liveFocus: null, restEndsAt: null });
    writeWorkoutToHealth(finished);
    return finished;
  },

  endEarly: (reason?: EndedEarlyReason) => {
    const { record } = get();
    if (!record) return null;
    const hasLoggedProgress = record.performed.some((ex) => ex.sets.some((s) => s.completed));
    if (!hasLoggedProgress) {
      deleteSessionRecord(record.id);
      set({
        plan: null,
        record: null,
        builtPlan: null,
        preSessionBestE1rm: {},
        preSessionAchievementIds: new Set(),
        liveCelebratedIds: new Set(),
        liveFocus: null,
        restEndsAt: null,
        manualFocusExerciseId: null,
      });
      return null;
    }
    const completedAt = Date.now();
    const finished: SessionRecord = {
      ...record,
      completedAt,
      pausedAt: undefined,
      pausedDurationMs: (record.pausedDurationMs ?? 0) + (record.pausedAt ? completedAt - record.pausedAt : 0),
      endedEarly: true,
      // ADR-0126: WHY matters. Running out of time is at least as common as
      // running out of gas, and only the latter says anything about the
      // prescription being too much.
      ...(reason ? { endedEarlyReason: reason } : {}),
      performed: record.performed.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => (s.completed || s.skipped ? s : { ...s, skipped: true })),
      })),
    };
    saveSessionRecord(finished);
    set({ record: finished, liveFocus: null, restEndsAt: null });
    writeWorkoutToHealth(finished);
    return finished;
  },

  clear: () =>
    set({
      plan: null,
      record: null,
      builtPlan: null,
      preSessionBestE1rm: {},
      preSessionAchievementIds: new Set(),
      liveCelebratedIds: new Set(),
      liveFocus: null,
      restEndsAt: null,
      manualFocusExerciseId: null,
    }),
}));
