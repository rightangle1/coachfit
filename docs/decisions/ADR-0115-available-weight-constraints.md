# ADR-0115 — Owned-weight constraints for dumbbells/kettlebells/bands

- **Status:** Accepted (v2)
- **Date:** 2026-07-23
- **Phase:** 1

## Context
The equipment model (ADR-0109) only tracked *whether* the athlete owns a piece
of equipment, not *what weights*. For a barbell that's fine — plates combine
freely, so any computed load is realizable. For dumbbells, kettlebells, and
resistance bands, though, a real trainer only ever hands you a weight you
actually have. Recommending 22 kg dumbbells to someone whose rack jumps
10 → 15 → 20 → 25 kg isn't a small rounding error — it's advice the athlete
can't follow, which undermines "think like a trainer, not a spreadsheet"
(CLAUDE.md §2.1).

## Options considered
- **A — Free-text note only (status quo).** `EquipmentItem.note` already
  exists for this. Zero schema change, but nothing in the engine can act on
  free text without an LLM — directly against CLAUDE.md's "rules act on
  structured inputs" principle (§6).
- **B — Structured discrete weight list per weighted-equipment type.** Add
  `availableWeightsKg?: number[]` to `EquipmentItem`, populated only for
  `dumbbells` / `kettlebell` / `resistance_bands`. The rules engine snaps any
  computed recommendation down to the nearest owned weight.
- **C — Full plate/attachment inventory (e.g. adjustable-dumbbell plate
  counts).** More realistic for adjustable sets but far more UI friction for
  "the author and a few friends" (CLAUDE.md §1 audience/stage) than the
  payoff justifies right now.

## Decision
**Option B.** `EquipmentItem.availableWeightsKg` (canonical kg, ascending) is
optional and only meaningful for `WeightedEquipmentType = 'dumbbells' |
'kettlebell' | 'resistance_bands'` (`src/domain/types/equipment.ts`).
Undefined/empty means "unconstrained" — identical to today's behavior, so
existing inventories and tests keep working with zero migration.

`availableWeightsForExercise(exercise, inventory)` (`domain/engine/matching.ts`)
resolves which owned-weight list (if any) governs a given exercise.
`snapToAvailableWeight(kg, available)` (`domain/engine/progression.ts`) is a
pure function that rounds a target *down* to the nearest owned weight, falling
back to the smallest owned weight only if everything owned exceeds the target.
Snapping only ever rounds down relative to the already-capped recommendation,
so it can never push a load past the ADR-0103 hard safety cap — the same
"when unsure, be conservative" posture as the rest of the engine.

The `RulesEngine` applies this at both places it computes a weight-progression
load: the main-block `recommendLoad` call and the bodybuilding max-day
calibration block. When snapping changes the number, the session note says so
explicitly (e.g. "nearest weight you own: 20 kg (recommended 22 kg)") — the
same explainability pattern as every other de-load/substitution note.

The equipment screen (`app/equipment.tsx`) gained an inline weight picker per
weighted-equipment type: preset chips (common retail increments) plus a
free-entry field for anything the presets miss. The workout tracker's weight
`Stepper` gained an optional `values` prop so, when owned weights are known,
+/- steps between them instead of a fixed kg/lb increment — you can't
accidentally log a weight you don't own.

## v2 — preset shape per equipment type
Real equipment isn't uniformly numeric:
- **Dumbbells** are sold/labeled in clean 5 lb jumps in the US. The v1 presets
  derived lb chips from a kg-native list, producing odd values (4, 9, 13, 18 lb
  …) that don't match what's printed on the weight. `dumbbellPresetWeightsKg(unit)`
  (`app-lib/options.ts`) now returns clean `5, 10, 15, … 100` when the athlete's
  display unit is `lb`, converted to canonical kg for storage; kg-unit athletes
  keep the metric-native preset list.
- **Kettlebells** keep their existing kg-native presets unchanged in both
  units — kettlebells genuinely are metric equipment, so their "odd" lb
  conversions (9, 13, 18 lb, …) are the real numbers on a US-market bell, not
  an artifact to fix.
- **Resistance bands** don't have a meaningful numeric "weight" at all — real
  band sets are sold and color-coded by qualitative resistance level. The
  picker now shows four fixed levels (`RESISTANCE_BAND_LEVELS`: Easy / Medium /
  Medium hard / Hard) instead of numeric chips, with no free-entry field.
  Each level still maps to a fixed canonical kg value under the hood, so it
  slots into the exact same `availableWeightsKg` storage and
  `snapToAvailableWeight` machinery as dumbbells/kettlebells with zero extra
  plumbing — today a no-op in practice, since every band exercise in the
  catalog progresses by reps/time, not weight, but the mapping is there if a
  future band exercise ever progresses by weight.

## Consequences
- Deterministic and explainable, no LLM involved — nuance still comes from a
  structured input (CLAUDE.md §6), just a new one.
- Fully backward compatible: any inventory without `availableWeightsKg` behaves
  exactly as before.
- Reversible: dropping the field or the snap step is a no-op for every other
  part of the engine — nothing else depends on it existing.
- Doesn't yet model *adjustable* dumbbells' plate combinations short of the
  dial settings the athlete lists explicitly — acceptable for v1; can be
  revisited if it proves too tedious to enter in practice.

## v3 — sensible default increments
When no structured owned-weight list is supplied, automatic recommendations
now snap down to a practical display increment: 2.5 kg for metric athletes and
5 lb for imperial athletes. A specified `availableWeightsKg` list remains the
explicit exception and is respected exactly. Snapping down preserves the
existing safety-cap guarantee. A positive legacy load smaller than one increment
is retained rather than rounded to 0, and completed zero-weight sets are ignored
as progressive-overload evidence.
