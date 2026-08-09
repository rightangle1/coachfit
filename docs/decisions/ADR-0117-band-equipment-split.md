# ADR-0117 — Split resistance bands into tube and loop equipment types

- **Status:** Accepted (v1)
- **Date:** 2026-08-08
- **Phase:** 1

## Context
The equipment model (ADR-0109) has a single `resistance_bands` type covering
every kind of elastic band, with one generic qualitative weight-level list
(`RESISTANCE_BAND_LEVELS`: Easy/Medium/Medium hard/Hard, ADR-0115 v2). In
practice there are two meaningfully different implements sold as "resistance
bands":

- **Tube/handled bands** — long tubes with handles, anchored underfoot or to a
  door, used for presses, rows, pull-aparts, deadlifts, etc.
- **Loop/mini bands** — continuous fabric or rubber loops worn around limbs
  (ankles, knees, wrists), used mostly for glute/hip activation and
  positional-resistance work (lateral walks, clamshells, banded squats).

Collapsing both into one equipment type meant an athlete who owns only loop
bands would be offered tube-band exercises (and vice versa) as if they were
interchangeable, which they aren't — you can't do a banded deadlift with a
mini loop, and a lateral band walk needs a loop, not handles. Expanding the
catalog with a real loop-band exercise set (this change) made the gap
concrete enough to fix.

An early draft of this ADR modeled band levels with color names
(Yellow/Red/Green/Blue/Black, etc.) sourced from a common manufacturer's
chart. That was dropped: color-to-resistance mapping is **not standardized
across brands** — a "red" band from one manufacturer can be lighter than a
"yellow" from another — so baking specific colors into the data model would
mislabel real bands the athlete owns. Generic tier names avoid that trap
entirely, same spirit as today's Easy/Medium/Medium hard/Hard.

## Decision
Split `resistance_bands` into two `EquipmentType` values
(`src/domain/types/equipment.ts`): `resistance_bands_tube` and
`resistance_bands_loop`. Both remain `WeightedEquipmentType`s (ADR-0115), each
with its own **generic, manufacturer-agnostic** five-tier level list
(`TUBE_BAND_LEVELS` / `LOOP_BAND_LEVELS`, `src/app-lib/options.ts`): Extra
Light, Light, Medium, Heavy, Extra Heavy. The two tables use different
underlying canonical-kg values per tier (loop bands scale up to a higher kg
than tube bands at the "Extra Heavy" end) because the two implements cover
genuinely different real-world force ranges at full stretch — the tier
*names* are shared for a consistent UI vocabulary, but the numbers behind them
aren't. As before, only the tier label is ever shown to the athlete; the kg
number exists solely to drive `snapToAvailableWeight` (`domain/engine/
matching.ts`, `progression.ts`), same machinery as dumbbells/kettlebells.

`src/features/equipment-form.tsx` replaced its single `isBands` boolean +
hardcoded `RESISTANCE_BAND_LEVELS` reference with a `BAND_LEVELS_BY_TYPE`
lookup (`app-lib/options.ts`) keyed by `WeightedEquipmentType`, so tube and
loop each render their own heading, level chips, and stay open to a future
third band style without another bespoke branch.

`domain/engine/equipment-advisor.ts`'s two "do they already have some
resistance implement" gates now check both new types
(`!has('resistance_bands_tube') && !has('resistance_bands_loop')`) — owning
either style still suppresses the dumbbell/pull-up-bar recommendation.

The exercise catalog (`domain/catalog/exercises.ts`) was re-tagged: of the 32
pre-existing `resistance_bands` exercises, 31 are genuinely tube/handled work
(anchored underfoot or gripped by handles) and moved to
`resistance_bands_tube`; one (`hi-band-hip-thrust`, band looped above the
knees) is genuinely loop-style and moved to `resistance_bands_loop`. A new
loop-band exercise set was added alongside it (banded lateral walks,
clamshells, glute bridges, hip abduction work, etc.) — see the catalog for the
full list.

## Consequences
- **No migration path provided.** Any locally-saved `EquipmentInventory` with
  an old `{ type: 'resistance_bands' }` entry silently stops matching either
  new type — the athlete would need to re-check their band ownership in
  Settings once. Acceptable: this is pre-launch, local-only data for "the
  author and a few friends" (CLAUDE.md §1), not worth a migration shim for a
  handful of users who can just re-tap a checkbox.
- `implementFor`/`variantFamilyFor` (`domain/catalog/index.ts`) derive their
  substitution/variant family key from the exercise's resolved equipment type
  generically — no code change was needed there. The practical effect: tube-
  and loop-band exercises now form separate substitution families instead of
  collapsing into one, which is correct — they're different implements a swap
  shouldn't casually cross.
- Fully reversible: nothing outside the six touched files (`equipment.ts`,
  `options.ts`, `equipment-form.tsx`, `equipment-advisor.ts`, the exercise
  catalog's `equipment` tags, and one test fixture) encodes the old single
  `resistance_bands` string.
