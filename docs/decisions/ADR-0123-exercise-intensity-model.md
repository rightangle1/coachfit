# ADR-0123 — Per-exercise intensity model (MET + load demand)

- **Status:** Accepted (v1)
- **Date:** 2026-07-29
- **Phase:** 1 (engine revamp)

## Context
Conditioning/bodyweight exercises within the same category can be wildly
different in intensity (burpees vs. shadow boxing, both `interval`/`cardio`),
and strength exercises within the same category can differ in systemic demand
(a dumbbell bench press vs. a dumbbell fly, both `push`/`chest`). Three places
in the engine treated exercises within a category as interchangeable:

- `calories.ts`'s `MET_BY_TIER` — a flat 5-bucket lookup keyed on
  modality/pattern only (ADR-0201).
- `rules-engine.ts`'s `cardioSets()` — a hardcoded `targetRpe: 8` / `×2` rest
  ratio for every `interval` exercise.
- `timing.ts`'s `restSecondsFor()` — a binary heavy/light rest split by
  `mechanic` + rep range only (ADR-0120).
- `fatigue.ts`'s `FATIGUE.SET_LOAD` — a flat per-set fatigue impulse
  (ADR-0102), scaled only by reported RPE/reps, never by exercise identity.

## Options considered
- **One `intensity` number for every exercise, sourced from the Compendium of
  Physical Activities.** Rejected: the Compendium only has category-level
  resistance-training codes (e.g. one code covers "free weight, multiple
  exercises, vigorous effort" generically) — it cannot and does not
  distinguish a bench press from a fly. A per-exercise MET for strength work
  would be fabricated precision, not sourced data.
- **Two independent, honestly-sourced fields, one per training modality's
  actual literature.** Chosen — see Decision.
- **No catalog-level signal; derive everything from logged RPE/history only.**
  Rejected: doesn't help at prescription time, before any history exists for a
  never-before-performed exercise, and doesn't distinguish burpees from
  shadow boxing even after logging (both currently land at the same tier).

## Decision
Two optional `Exercise` fields, each following the existing
optional-field-with-heuristic-fallback shape `mechanic` already uses (ADR-0120)
— the catalog doesn't need to be hand-tagged all at once:

- **`metValue?: number`** — a genuine Compendium-of-Physical-Activities MET
  value. Meaningful chiefly for cardio/conditioning, where the Compendium has
  real per-exercise codes. Unset falls back to `MET_BY_TIER` (ADR-0201).
- **`loadDemand?: number`** — a relative systemic-load rating for strength
  work, on a fixed `0.7`–`1.4` scale. NOT Compendium-sourced — grounded in
  stimulus-to-fatigue-ratio (SFR) training literature instead (compound lifts
  cost more systemic fatigue than isolation lifts for comparable stimulus).
  Unset derives a default from fields the catalog already has: `mechanic`
  (compound/isolation), muscle mass recruited (`primaryAreas`/
  `secondaryAreas`), and `unilateral` stabilization demand
  (`defaultLoadDemand`, `domain/engine/intensity.ts`). Named `loadDemand`,
  not `fatigueCost`, to avoid colliding with the existing `FATIGUE` engine
  module / `SessionContext.fatigue` (the athlete's *accumulated* multi-day
  fatigue — a different concept this field feeds into, not replaces).

Both tracks collapse into the same fixed `[0.7, 1.4]` multiplier range
(`intensityMultiplierFor`, `domain/engine/intensity.ts`) so `fatigue.ts` can
scale consistently regardless of which track an exercise belongs to.

### Fixed anchors
`MET_LO = 3` (light) / `MET_HI = 12` (vigorous), ACSM-style intensity bands.
`LOAD_DEMAND_LO = 0.7` / `LOAD_DEMAND_HI = 1.4`. All four are **fixed
constants**, not derived from the catalog's own min/max — so tagging one new
extreme-MET or extreme-loadDemand exercise later can never silently shift
every other exercise's already-derived RPE, rest, or fatigue credit.

### Formulas
- **Calories** (`calories.ts`): `metFor()` checks `ex.metValue` before falling
  back to the tier lookup — a two-line change, no call-site impact (the
  "swap behind the same call site" upgrade path ADR-0201 already promised).
- **Cardio RPE/rest** (`rules-engine.ts`, `cardioSets()`):
  `t = clamp((met - MET_LO) / (MET_HI - MET_LO), 0, 1)`;
  `RPE_work = round(5 + t × 4)`; `restRatio = 1 + t × 2`. Replaces the flat
  `targetRpe: 8` / `×2`.
- **Strength rest** (`timing.ts`, `restSecondsFor()`): the existing tier value
  (`HEAVY_COMPOUND`/`HYPERTROPHY_COMPOUND`/`ISOLATION`) is multiplied by
  `restIntensityFactor`, bounded to `[0.85, 1.15]` (±15%) so it nudges within
  a tier rather than crossing into another — `HYPERTROPHY_COMPOUND × 1.15`
  (103.5s) stays below `HEAVY_COMPOUND × 0.85` (140.25s); tiers never invert.
  This automatically feeds `estimateBlocksSeconds` →
  `SessionPlan.estimatedDurationMin`, the sole source of total session time.
- **Fatigue impulse** (`fatigue.ts`): `FATIGUE.SET_LOAD` is multiplied by
  `intensityMultiplierFor(exercise)` in `deriveFatigueFromHistory`'s
  `credit()` closure. Unknown/synthetic exercise ids default to neutral
  `1.0` (no catalog entry → no signal to scale by).

### Prerequisite fix
`mechanicOf()`'s BIG_MOVERS heuristic (ADR-0120) already misclassified some
real isolation exercises as compound (any `push`/`pull` exercise whose
`primaryAreas` hits a big mover, regardless of actual joint count) — e.g.
dumbbell fly, dumbbell rear-delt fly, lateral/front raises, shrugs, pullover.
Since `loadDemand`'s default heuristic derives from `mechanic`, this bug was
audited and fixed catalog-wide (18 exercises tagged with an explicit
`mechanic` override) as a prerequisite, so the new signal inherits a clean
foundation rather than compounding a pre-existing bug.

## Consequences
- Every untagged exercise gets a heuristic-derived value immediately
  (catalog-wide, same as `mechanic`'s original rollout) — bounded and
  deliberately conservative, not a shock, since the ranges are tightly capped.
- Whole-catalog backfill of real `metValue`/`loadDemand` is a separate,
  incremental follow-up (tracked in
  `docs/methodology/exercise-intensity-tagging.md`), not required before this
  ships — the fallback heuristic is the correct behavior for an untagged
  exercise, not a placeholder to be embarrassed about.
- Reversible: both fields are optional data, and every formula's fallback
  path reproduces prior behavior exactly at the neutral midpoint
  (`LOAD_DEMAND_MID = 1.05` → `restIntensityFactor` = `1.0`).

## Safety
This is an informational/estimation signal (calorie accuracy, rest timing,
fatigue crediting) — not a safety cap, progression limit, or deload trigger.
CLAUDE.md's stricter "safety caps and deload triggers must have explicit
tests" bar does not apply; the general "programming logic is unit-tested" bar
does (see `intensity-test.ts`, plus additions to `timing-test.ts`,
`fatigue-test.ts`, `calories-test.ts`, `exercises-test.ts`).
