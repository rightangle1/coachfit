# ADR-0139 — Cardio modality taxonomy

- **Status:** Accepted (v1)
- **Date:** 2026-08-13
- **Phase:** 1

## Context

Cardio's `movementPattern` (`'steady_cardio' | 'interval' | 'aerobics'`) is
the only categorical tag cardio exercises carry, and it's an
*intensity-structure* axis — continuous steady effort vs. work/recovery
intervals vs. circuit-cadence pacing (ADR-0138) — consumed by the engine via
`CardioIntent`. It was never meant to capture *modality*: what the athlete is
actually doing (running, machine work, shadow boxing, jump rope, dance-step
aerobics, bodyweight HIIT, loaded kettlebell/dumbbell work). That distinction
only existed as unstructured text in exercise names/descriptions, so the
explore UI's "Movement pattern" filter — which reuses `movementPattern` for
strength too — offered no real way to browse cardio by workout style. Users
described this gap directly: they think of cardio as equipment/workout style
first (running vs. machines vs. no-equipment moves like shadow boxing), then
intensity second (HIIT vs. steady vs. other) — and any of those intensities
can apply to any of those styles, so the two must stay orthogonal rather than
be collapsed into one enum, the way strength already separates movement
pattern from muscle target, equipment, and mechanic
(`src/domain/catalog/index.ts`).

## Options considered

- **A new orthogonal `cardioModality` field**, explicit-tagged per exercise.
  Chosen: additive (optional field, `undefined` for non-cardio), mirrors how
  strength already separates its own orthogonal axes, and unblocks a real
  "Cardio type" filter in the explore UI without touching intensity logic.
- **The same field, regex-derived** like `movementSlotFor`/`impactFor`
  (`src/domain/catalog/index.ts`). Rejected: those helpers work because 4-way
  buckets (squat/hinge/push/pull, low/moderate/high impact) have strong
  textual signal. 7 cardio-modality buckets over just 59 exercises is a
  weaker signal-to-bucket ratio — e.g. "Bodyweight interval circuit" could
  regex-match combat or plyo cues — and explicit tagging is self-documenting
  at this scale, with the coverage invariant test (below) as a safety net.
- **Repurpose `movementPattern` itself to carry modality**, moving
  intensity-structure to a new field instead. Rejected: much larger blast
  radius — `weekly-program.ts`'s `slotsFor()`, `cardio-circuit.ts`,
  `rules-engine.ts`'s cardio pool filtering, `timing.ts`, and `intensity.ts`
  all key off the current `movementPattern`/`CardioIntent` values; breaking
  that alignment for no functional gain over the additive option.

## Decision

Add `CardioModality` (`src/domain/types/exercise.ts`): `'running_walking' |
'machine_cardio' | 'combat' | 'jump_rope' | 'aerobics' | 'bodyweight' |
'loaded_cardio'`, and an optional `cardioModality?: CardioModality` field on
`Exercise`, populated only when `modality === 'cardio'`. All 59 existing
cardio catalog entries are hand-tagged. `movementPattern`/`CardioIntent` are
unchanged — they remain the intensity-structure axis.

The `aerobics` value intentionally reuses a word `MovementPattern` already
uses for a different concept (ADR-0138's circuit-cadence intensity value).
The two are independent axes — `cardioModality: 'aerobics'` means the
step-touch/dance movement family; `movementPattern: 'aerobics'` means
continuous circuit pacing — documented inline at both type definitions so a
reader doesn't mistake the overlap for a bug.

The `Exercise`/`CatalogExercise` type split is intentionally *not* tightened
to guarantee `cardioModality` present-for-cardio, absent-otherwise at compile
time — `CatalogExercise`'s `Required<Pick<...>>` pattern can't express a
conditionally-required field. Enforced instead via a catalog invariant test
(`src/domain/catalog/__tests__/exercises-test.ts`), the same treatment
`flowStage` already gets for its own conditionally-meaningful field.

Explore UI (`src/app/explore.tsx`): `movementPattern`'s cardio values
(`steady_cardio`/`interval`/`aerobics`) are dropped from the "Movement
pattern" filter chip row — intensity-structure isn't a useful per-exercise
filter for users, it's the engine's session-generation concern. A new "Cardio
type" chip row (the 7 `cardioModality` values) renders only when `modality
=== 'cardio'` is selected, and clears itself if the athlete switches away
from cardio.

## Consequences

- Additive and reversible: an optional field with zero engine coupling.
  Removing it means dropping the type, the 59 tags, the label map, and the
  explore-UI filter block — nothing downstream depends on it existing.
- Makes real cardio browsing possible in explore today (equipment/style
  first, matching how users actually think about it).
- Deliberately does not wire modality into session generation
  (`weekly-program.ts`, `rules-engine.ts`) — e.g. "give me a running-focused
  day" — that's inert metadata for now. A future ADR would cover surfacing a
  modality preference as a `SessionContext`/`WorkoutOptions` input and biasing
  selection with it, which is a crown-jewel-engine change deserving its own
  design and test coverage, not a side effect of a catalog-schema addition.
