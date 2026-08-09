# ADR-0108 — Workout tracking model & offline guarantees

- **Status:** Accepted (v1)
- **Date:** 2026-07-21
- **Phase:** 1

## Context
The tracker is used mid-workout — sweaty, tired, one thumb — and must never lose
data (CLAUDE.md §9: "log persists immediately, survives app backgrounding").

## Decision
- **Model:** a `SessionRecord` is created (in-progress) the moment a workout
  starts, scaffolded 1:1 from the `SessionPlan` (`services/sessions.ts:
  startSessionRecord`). Each `PerformedExercise`/`PerformedSet` starts
  `completed: false` with the planned reps/weight/duration pre-filled as a
  default the user adjusts rather than retypes.
- **Write-through, not write-on-exit:** every set update (`Stepper` change,
  complete toggle) calls `saveSessionRecord` immediately via the persistence
  port — there is no "save" step. Zustand (`state/workout-store.ts`, ADR-0002)
  holds the in-memory copy for fast re-renders; the store's actions themselves
  perform the persistence write, so UI and durability can't drift apart.
- **Resumability:** because the record is persisted from the first set, a killed
  app/backgrounded session can be resumed by re-loading the record by id — no
  separate "draft" concept needed.
- **Completion:** `completedAt` is set only when the user finishes, which is what
  distinguishes "history" the engine reasons over (ADR-0102/0103 only consume
  completed records) from an abandoned/in-progress one.

## Consequences
- Satisfies the "never lose data" UX principle without extra machinery — the
  write-through IS the autosave.
- Engine history queries are simple: filter by `completedAt != null`.
- Slightly more writes than "save at the end," but each write is a small JSON
  blob — cheap on both SQLite and localStorage.
- Reversible: batching writes (e.g. debounce) can be added later inside the store
  without changing the `SessionRecord` contract.
