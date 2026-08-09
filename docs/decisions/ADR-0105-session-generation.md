# ADR-0105 — Session generation algorithm

- **Status:** Accepted (v2 — cadence-aware)
- **Date:** 2026-07-21 (v2: 2026-07-22)
- **Phase:** 1

## Context
How the engine composes a day's session from goals, equipment, targeting,
avoidance, readiness, (and later) fatigue + volume landmarks. v1 establishes the
pipeline and produces genuinely responsive sessions; ADR-0102/0103/0104/0107 deepen
the numbers behind each step.

## Decision — v1 pipeline (pure, deterministic)
1. **Pick the day's modality mix** from normalized goal `weights`: choose a primary
   modality for the "Main" block, always include a short **Warmup** (mobility/general)
   and, when cardio/general weight is non-trivial, a **Conditioning** block.
2. **Candidate pool** = catalog exercises whose `equipment` is fully satisfied by the
   inventory and whose `modality` fits the chosen block.
3. **Apply avoidance/targeting** (ADR-0106): hard-exclude, substitute within
   `movementPattern`, de-load, and bias toward `emphasize` areas.
4. **Select** a small, non-redundant set per block (distinct `movementPattern`s),
   sized by experience (beginner fewer, advanced more).
5. **Prescribe sets/reps** by modality + experience (v1 fixed templates; ADR-0103
   progressive overload + ADR-0104 volume landmarks refine later). Readiness scales
   total volume/intensity (ADR-0107; v1 = simple multiplier).
6. **Rationale** — build a short templated explanation citing the emphasis and any
   swaps/de-loads, so the prebrief can show *why* (CLAUDE.md §6).

## Decision — v2 addendum (weekly modality cadence)
`weights` alone is an abstract blend — it doesn't stop the engine from picking
the same dominant modality every day even if the athlete asked for a specific
weekly split. `TrainingGoals.weeklyTargets` (optional, `src/domain/types/goals.ts`)
lets the athlete set explicit session-count targets per modality
(e.g. 4 strength / 2 cardio / 1 mobility per week). Inserted as **step 0.5**,
right after step 1's naive weight-based pick:

- Unset (default) → no change, byte-identical to v1.
- If set: compute this ISO week's completed-session counts per modality
  (`weeklySessionCountsByModality`, ADR-0104's shared weekly-aggregation
  module — a session's "modality" is the majority of its performed
  exercises' catalog modality, no plan lookup needed). If the naive pick's
  weekly target is already met/exceeded **and** another targeted modality
  isn't, switch today's Main modality to the most-behind one instead. If the
  naive pick hasn't met its target yet, or nothing else is behind, the naive
  pick stands.
- An explicit `workoutType` (cardio/bodyweight/stretch/yoga) still short-
  circuits this entirely, same as v1 — cadence targets only ever arbitrate
  the *naive* weight-based pick, never override an explicit user choice.
- The override is explained in the rationale (`"Switching to cardio today —
  you've already hit your strength target this week."`), so it's never a
  silent surprise.

## Consequences
- End-to-end adaptive output from real inputs, testable in Node and the browser.
- Clear insertion points for fatigue (skip recently-hammered groups), volume
  landmarks (set counts), and overload (load selection from history).
- v1 prescriptions are conservative fixed templates — safe until the smarter
  numeric ADRs land.
- v2: cadence targets are purely a modality-selection tie-breaker layered on
  top of step 1 — they never touch prescription (steps 4/5) or safety caps,
  and are fully inert (no behavior change) until the athlete opts in by
  setting a target.
