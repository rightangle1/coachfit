# ADR-0144 — Barbell total-weight modeling & weighted-equipment starting floors

- **Status:** Accepted (v1)
- **Date:** 2026-08-14
- **Phase:** 1

## Context

Three gaps in how the engine suggests a weight, none of them hypothetical:

1. **Barbell has no concept of bar weight anywhere.** `barbell` is deliberately
   excluded from `WeightedEquipmentType` (ADR-0115: "plates combine freely, so
   any computed load is realizable"), which is still true for the *plate*
   math — but it also means nothing stops a computed load from landing below
   an empty bar's real weight (45 lb ≈ 20.41 kg). `docs/methodology/programming-engine.md`
   §15 has named this a known gap since the engine revamp: "a bar is treated
   as infinitely adjustable." The only `45` anywhere near `barbell` in the
   codebase is `timing.ts`'s `transitionSecondsFor()` — 45 **seconds** of
   rack-setup time budget, coincidentally the same number, unrelated.
2. **The manual add/replace-exercise fallback was equipment-blind.**
   `workout-editing.ts`'s `setsForProgression()` used a single flat
   `10 kg / 20 lb` default for every equipment type — a barbell squat and a
   dumbbell curl got the same number, and that number is itself below a real
   bar's weight.
3. **A fresh exercise's weight control read as confusing.** With no history,
   `recommendPrescription`/`recommendLoad` correctly leave `weightKg` unset
   (ADR-0103: "no history → no weight prescribed, honest"), but the tracker
   renders that as an em-dash (`controls.tsx`), which was reported as reading
   like "0" rather than "not yet known."

Audited directly before making any change: `snapToAvailableWeight` already
filters non-positive owned weights; `snapToSensibleWeight` already refuses to
round a positive value down to 0 (ADR-0115 v3 fixed this once already);
`lastTopSet` already ignores 0-weight logged sets as progression evidence; the
tracker's weight `Stepper` already floors at one increment so 0 can't be
typed/stepped to. So this ADR is narrowly about the three gaps above, not a
broader rewrite of a system that was already mostly careful about this.

## Options considered

- **A — Give barbell a discrete owned-weight list, like ADR-0115's dumbbells.**
  Rejected: plates genuinely do combine freely (ADR-0115's original reasoning
  stands); a discrete list would be a worse model, not a better one, and
  would require athletes to enumerate plate inventories for no real benefit.
- **B — A flat, unit-wide minimum weight for every athlete.** Rejected on
  explicit instruction: real athletes own 2-3 lb dumbbells, and a flat
  minimum around 20 lb would silently ignore them.
- **C (chosen) — Barbell gets a continuous floor at bar weight; dumbbell/
  kettlebell/band get a starting-weight helper that prefers the athlete's own
  lightest owned weight, falling back to a small generic floor only when
  nothing is on file.**

## Decision

**Barbell**: `BARBELL_BAR_WEIGHT_KG = 45 * KG_PER_LB` (≈20.41 kg), defined in
`progression.ts`. `weightKg` for a barbell exercise is now the **total** on
the bar (bar + plates), floored at this constant — "0 added weight" means the
bar, not nothing. The floor is threaded through every place a barbell weight
is computed: `snapToSensibleWeight` gained an optional `floorKg` parameter;
`recommendLoad`/`recommendPrescription` resolve the floor internally via the
new `barbellFloorKg(exercise)` helper (itself built on `implementFor`, moved
from `catalog/index.ts` to `engine/mechanic.ts` so `progression.ts` can use it
without a catalog dependency — a pure refactor, ADR-0003's leaf-module
convention); the two `rules-engine.ts` call sites that snap a weight *after*
`finalizeLoad`'s readiness/fatigue reductions (which can independently push a
light barbell weight below the bar) apply the same floor.

This is a **semantics change, not just a bugfix**: `weightKg` for barbell was
previously undocumented as either total or added-only; it is now explicitly
total. Every existing consumer that sums `weightKg` directly — tonnage trend
(`app-lib/presentation.ts`), 1RM estimate (`metrics/strength.ts`), tonnage
achievement tiers (`metrics/achievements.ts`), weekly load trend
(`metrics/volume.ts`) — becomes accurate automatically with zero code change,
since none of them did any bar-specific math before. This reconciles with,
rather than contradicts, ADR-0115: barbell still isn't a
`WeightedEquipmentType` (plates still combine freely), it just now also
carries a continuous floor, which ADR-0115 never addressed either way.

**Dumbbell/kettlebell/band**: a new `startingWeightKgFor(exercise, available,
unit)` in `progression.ts` — deliberately **not** folded into
`recommendLoad`/`recommendPrescription`'s own no-history branch, so ADR-0103's
"no history → undefined, the athlete logs it" contract is unchanged for those
two functions. It's a separate, explicit, opt-in fallback each caller invokes
when that returns nothing: prefers the athlete's lightest *owned* weight when
their inventory specifies one (a real 2-3 lb dumbbell is honored, never
overridden upward), otherwise the generic smallest-increment floor
(`defaultIncrementKg`, already 2.5 kg / 5 lb — reused rather than duplicated).
Wired into every place a weight previously went blank or used a flat guess:
the main strength block, cardio conditioning's loaded exercises
(`recommendedCardioWeightKg`), the live mid-workout swap/replacement path
(found during implementation to be a second, independently-blank path — it
never called `snapToSensibleWeight` at all), and `workout-editing.ts`'s
manual add/replace fallback.

**Explicitly not done**: no auto-substitution to a bodyweight exercise when a
suggested weight would be very light. The catalog already models bodyweight
variants as separate exercises; the fix here is guaranteeing the weight math
has a floor, not adding new cross-catalog substitution logic.

**A deliberate interaction with `addCompoundRampSets`**: the starting-weight
fallback is applied to `rules-engine.ts`'s main strength block *after* working
sets and any warm-up ramp sets are built, not before. Ramp sets are computed
as a fraction of an already-known load (50%/75%); feeding a made-up starting
guess into that pipeline would have produced silly fractional ramp sets (e.g.
a "1.25 kg" warm-up ramp toward a 2.5 kg guess) for a fresh compound lift in a
strength/power zone. `finalizedKg` (whether a *real* recommendation existed)
is checked before deciding whether to fill in the starting suggestion, so
ramping logic only ever sees a real load, never a guess.

## Consequences

| Before | After |
|---|---|
| A barbell deload/reconciliation could compute below bar weight (e.g. 17.5 kg) | Floored at ≈20.41 kg — never below the bar |
| Manual add: flat 10 kg / 20 lb for every equipment type | Equipment-aware: bar weight for barbell, lightest owned (or 2.5 kg / 5 lb) for dumbbell/kettlebell/band |
| Fresh loaded exercise: blank weight, rendered as a confusing em-dash | A real, sensible starting number the athlete can adjust from |
| `weightKg` semantics for barbell: undocumented | Explicitly total (bar + plates); tonnage/1RM/volume metrics become accurate with no extra code |

Reversible: `floorKg`/`startingWeightKgFor` are additive — omitting them
(as every pre-existing call site did until this change) is byte-identical to
prior behavior, confirmed by the full existing test suite passing unchanged.
`recommendLoad`/`recommendPrescription`'s own no-history contract (ADR-0103)
is untouched. Not yet modeled, by explicit choice: a configurable per-athlete
bar weight (women's 35 lb bar, technique bars) — one canonical constant only,
for now.
