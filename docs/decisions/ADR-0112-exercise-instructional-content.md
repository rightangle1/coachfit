# ADR-0112 — Robust per-exercise instructional content + catalog expansion

- **Status:** Accepted
- **Date:** 2026-07-22
- **Phase:** 1

## Context
The Phase 1 seed catalog (ADR-0101) shipped 24 exercises, each with a single
short `cues` line (e.g. "Chest up, knees track over toes."). That's enough for
a glance-able reminder mid-set, but not enough for someone learning a movement
for the first time — there's no explanation of what the exercise is for or how
to actually set up and execute it. The catalog was also far too small to give
the rules engine meaningful substitution/variety headroom across equipment and
movement patterns (ADR-0106 leans on having same-pattern alternatives).

## Decision
1. **Schema (`Exercise`, ADR-0101):** add two required fields —
   - `description: string` — one sentence on what the movement is and what it's
     good for. Shown above the fold, always.
   - `steps: string[]` — ordered setup + execution instructions, written to
     stand alone (a user opening "How to" mid-workout shouldn't need the cue
     line for basic execution).

   `cues?: string` is kept as-is: the short, arm's-length-readable reminder
   surfaced directly under the exercise name during a set (CLAUDE.md §9). It is
   not replaced by `description`/`steps` — those live behind a disclosure so
   they don't clutter the primary tracking view.

2. **Catalog size:** expand `src/domain/catalog/exercises.ts` from 24 to
   ~300 exercises, covering every `MovementPattern` and every `EquipmentType`
   already in the v0 vocabulary (ADR-0109) — no new equipment types introduced,
   to avoid touching onboarding/equipment-advisor UI in the same change.
   Continues the ADR-0101 practice of multiple exercises intentionally sharing
   a `movementPattern` so the engine can substitute within it.

3. **UI:** the workout tracker (`src/app/workout.tsx`) gains a collapsed-by-
   default "How to" disclosure showing `description` + numbered `steps`,
   directly under the existing cue line. Collapsed by default to protect the
   fatigued-user UX principles (§9) — the primary view stays uncluttered; the
   fuller instructions are one tap away for anyone who needs them.

## Consequences
- Every exercise record grew (description + steps array); the catalog file is
  larger but still a plain in-code array — no change to how it's stored
  (ADR-0101's "typed in-code data for now" stands).
- `cues` remains optional (a few warmup/mobility entries still lean on
  `description`/`steps` alone), but `description`/`steps` are required on every
  entry going forward.
- No engine changes: selection, substitution, and avoidance matching are
  unaffected — they never read `description`/`steps`/`cues`.
