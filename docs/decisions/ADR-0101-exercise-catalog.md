# ADR-0101 — Exercise catalog schema

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 1

## Context
The rules engine selects exercises filtered by equipment, body-area targeting, and
avoidance flags. It needs a structured catalog to reason over. This schema is the
shared shape every exercise (seed + future) conforms to. Depends on ADR-0004
(body-area taxonomy) and the equipment vocabulary.

## Decision
An `Exercise` record (pure domain data, no IO) with:
- `id`, `name`, `modality` (strength/cardio/mobility/general).
- `primaryAreas` / `secondaryAreas` — `MuscleGroup[]` (ADR-0004). Secondary counts
  toward fatigue at reduced weight (ADR-0102).
- `jointLoad?` — free-form joint tags (e.g. `"knee"`, `"shoulder"`) so avoidance
  flags on joints can match and swap.
- `equipment` — `EquipmentType[]`, **all** of which must be available (an exercise
  can list `['bodyweight']` to mean "no equipment").
- `movementPattern` — e.g. `squat`, `hinge`, `push`, `pull`, `carry`, `core`,
  `steady_cardio`, `interval`, `stretch` — used to avoid redundant selection and to
  find swap substitutes within the same pattern.
- `progression` — how load advances: `weight`, `reps`, `time`, `hold` (drives
  ADR-0103 overload).
- `unilateral?`, `cues?` (short form notes), `contraindicatedAreas?`.
- `media?` — enriched stills/clips, added in ADR-0302 (Phase 3). Falls back to a
  generated placeholder illustration (ADR-0301) when unset.

The catalog ships as a typed in-code array (`src/domain/catalog/exercises.ts`) for
now; it can move to a data file / DB later without changing the `Exercise` type.

## Consequences
- Selection, substitution (same `movementPattern`), equipment filtering, and
  avoidance matching all have the fields they need.
- Seed catalog stays small but representative across all four modalities.
- Reversible: catalog storage can change; the `Exercise` shape is the contract.
