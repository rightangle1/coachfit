# ADR-0109 — Equipment model & recommendation logic

- **Status:** Accepted (v1)
- **Date:** 2026-07-21
- **Phase:** 1

## Context
The app tracks owned equipment and recommends "a couple of potential additional
items" tied to goals (CLAUDE.md). Needs to stay a small, deterministic, pure
function so it's testable and swappable like the rest of the engine.

## Decision
`recommendEquipment(goals, inventory): EquipmentRecommendation[]` (pure, in
`src/domain/engine/equipment-advisor.ts`) — a small ordered rule list, each rule
gated by a goal-weight threshold and "not already owned":
1. Strength weight ≥ 0.3, owns none of dumbbells/barbell/bands → **dumbbells**
   (most versatile entry point).
2. Strength weight ≥ 0.3, owns dumbbells, lacks bench → **bench** (unlocks
   bench/incline pressing).
3. Strength weight ≥ 0.3, owns dumbbells + bench, lacks pull_up_bar and bands →
   **pull-up bar** (unlocks a real pull pattern beyond rows).
4. Mobility weight ≥ 0.25, lacks yoga_mat → **yoga mat**.
5. Cardio weight ≥ 0.3, lacks cardio_machine → **cardio machine** (treadmill/
   bike/rower), framed as optional since bodyweight cardio already works.

Rules are evaluated in order; return **at most 2** recommendations, each with a
short plain-language reason. Equipment inventory itself is just
`EquipmentInventory` (ADR already defined in `domain/types/equipment.ts`),
persisted via the port under the single-user id (Phase 1 scope).

## Consequences
- Deterministic and explainable ("because your strength goal is high and you
  don't have a bench yet").
- Capped at 2 so it never feels like an upsell dump.
- Reversible/extensible: adding equipment types or rules doesn't change the
  function's contract.
