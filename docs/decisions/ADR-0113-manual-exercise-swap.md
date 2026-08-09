# ADR-0113 — Manual exercise swap during a session

- **Status:** Accepted (v1)
- **Date:** 2026-07-22
- **Phase:** 1

## Context
CLAUDE.md §9 asks the tracker to support swapping and adjusting an exercise
mid-session (weight/reps/set), not just the existing "too hard / too easy /
pain" nudges (ADR-0103-style live tweaks). A swap is a bigger change than a
per-set edit: the exercise's *identity* changes, so both the plan (what's
prescribed) and the in-progress record (what's been logged) need to agree
on a new `exerciseId`.

## Options considered
- **Bypass the engine; splice the catalog exercise into the plan from the UI.**
  Simple, but bypasses the `ProgrammingEngine` boundary (CLAUDE.md §5) and the
  decision log (§7) — a swap is exactly the kind of programming decision that
  boundary exists to own.
- **Add a `swap` `LiveSignal` kind handled by `RulesEngine.adjustDuringSession`.**
  Keeps the UI on the `ProgrammingEngine` interface; `services/programming.ts`
  logs it like any other adjustment for free. Chosen.

## Decision
- `LiveSignal` gained a `'swap'` kind plus `replacementExerciseId`
  (`src/domain/types/session.ts`). `RulesEngine.adjustDuringSession` resolves
  the replacement from the catalog and rebuilds that `PlannedExercise`,
  carrying the set count and target RPE forward but re-shaping fields for the
  replacement's `progression` type (e.g. a weight lift swapped for a hold
  drops `weightKg`, keeps `durationSec`).
- The workout store's `applySwap` mirrors this into the live `SessionRecord`:
  the performed entry's `exerciseId`/`name`/`primaryAreas` are replaced and its
  sets reset to the new prescription, uncompleted. Swapping only reshapes
  *unlogged* work, so the UI (`src/app/workout.tsx`) only allows a swap before
  any set on that exercise has been completed or skipped — otherwise "adjust"
  (already-existing too-hard/too-easy/pain) is the tool for the job.
- **Alternate picker shows every compatible exercise in the current modality**
  that matches owned equipment and is not excluded in preferences. The full
  muscle-group taxonomy (ADR-0004) is offered as optional chips so the user
  can narrow that list when they want a targeted swap.
- **Set count is a separate, non-engine concern.** Adding/removing a set is a
  live tracking decision like toggling a set complete — it only touches the
  `SessionRecord` (`addSet`/`removeSet` in `state/workout-store.ts`), the same
  way weight/reps edits already do. It doesn't go through the engine or the
  decision log, consistent with how per-set edits are already handled.

## Consequences
- Swaps are logged through the same decision-log path as every other engine
  call (CLAUDE.md §7) — a future eval can see what was swapped and why.
- The UI never constructs a `PlannedExercise` itself; the engine still owns
  every shape a plan can take, keeping the rules-vs-advisor boundary intact.
- Reversible: swapping the pick criteria (e.g. also excluding today's
  avoidance flags) only touches the alternates filter in `workout.tsx`, or
  could move server-side into `RulesEngine` later without changing the
  `LiveSignal` contract.
