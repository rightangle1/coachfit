# ADR-0404 — Barre equipment, workout type, and stage-ordered flow

- **Status:** Accepted
- **Date:** 2026-08-11
- **Phase:** 1

## Context

The user asked to add "Barre" to the catalog. The app has no concept of a
training "style" independent of equipment and the fixed four `Modality`
values (strength/cardio/mobility/general — ADR-0101). Barre isn't a new
modality: it's low-impact, high-rep pulse/isometric leg and seat work done at
a literal ballet barre (or a sturdy chair/countertop stand-in), mixed with
mat-based core work and a closing stretch — structurally the closest existing
precedent is Yoga (ADR-0114/0137), not a new physiological training category.

## Decision

Barre is added as three coordinated pieces, following two existing
precedents exactly rather than inventing new mechanisms:

1. **A new `EquipmentType`**, `'barre'` (`src/domain/types/equipment.ts`) —
   an unweighted prop, same treatment as `yoga_mat`/`foam_roller`. Not added
   to `WeightedEquipmentType`.
2. **A new `WorkoutType`**, `'barre'` (`src/domain/types/session.ts`) —
   its own explicit session style alongside `'yoga'`/`'stretch'`.
3. **A new `movementPattern`**, `'barre_flow'`, and four new `FlowStage`
   values — `'thighs'`, `'seat'`, `'core'`, `'arms'` — reusing `'center'`,
   `'warmup'`, `'cooldown'` from the existing stage vocabulary
   (`src/domain/types/exercise.ts`). `BARRE_STAGE_ORDER` in
   `rules-engine.ts` sequences a class the way a real one runs: center →
   warmup → thighs → seat → core → arms → cooldown.

`buildYogaFlow` (rules-engine.ts) was generalized into `buildStageFlow`,
parameterized by `pool`, `stageOrder`, and a `holdSpec` — the "one exercise
per ordered stage, whole sequence repeated for whole natural-time rounds"
mechanism is identical for Yoga and Barre, only the stage order and hold
timing (`MOBILITY_HOLD.barre = { hold: 40, min: 20, max: 60 }`, brisker than
yoga's static holds) differ. This avoided duplicating ~100 lines of
sequencing logic for a second flow-style workout type.

`'barre'` equipment is treated as **optional-with-fallback**, exactly like
`yoga_mat` for Yoga (`equipmentSatisfied(e, input.equipment, ['barre'])`) —
an athlete without a literal barre still gets the full flow (a chair or
countertop substitutes), rather than a pool gutted to the few exercises that
don't list it.

The catalog gained 17 `barre_flow` exercises (`src/domain/catalog/
exercises.ts`), covering all 7 stages, tagged `modality: 'strength'` for the
pulse/isometric leg, seat, and arm work and `modality: 'mobility'` for the
opening stance, warmup, and closing stretch — never a new fifth modality.

Every place that already exhaustively handled `EquipmentType`/`WorkoutType`/
`MovementPattern`/`FlowStage` (equipment picker options, workout-type picker,
`workout-type-catalog.ts`'s routine-eligibility mirror, `POSITIONING_EQUIPMENT`,
superset equipment-contention checks, movement illustrations, HealthKit
activity-type mapping via `WorkoutActivityType.barre`, achievements'
`WORKOUT_STYLE_KEYS`, context-tone, training-zone's no-strength-test styles)
was extended with a `'barre'` case, following each file's existing pattern
for `'yoga'`.

## Consequences

- **No dedicated hero art yet.** `WORKOUT_TYPE_ART`/`WORKOUT_HEADER_BACKGROUNDS`
  reuse the yoga hero image as a placeholder (CLAUDE.md §11: simple
  placeholders now, richer media later) — same spirit as Sculpting reusing
  Bodybuilding's hero.
- **Fully additive and reversible.** No existing `EquipmentType`, `WorkoutType`,
  `MovementPattern`, or `FlowStage` value changed meaning; `buildStageFlow`'s
  generalization is behavior-preserving for Yoga (verified by the existing
  Yoga test suite, unchanged, still passing).
- HealthKit write-back for a completed Barre session now maps to the native
  `WorkoutActivityType.barre` (available in `@kingstinct/react-native-healthkit`)
  rather than falling back to a generic type.
