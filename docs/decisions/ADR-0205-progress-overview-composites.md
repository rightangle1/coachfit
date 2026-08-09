# ADR-0205 — Progress overview composites (Overall Strength / Overall Endurance)

- **Status:** Accepted (v1)
- **Date:** 2026-07-30
- **Phase:** 2

## Context

ADR-0202 v2 deliberately replaced a single composite strength score with two
honest numbers (a per-muscle-group relative-%-of-personal-best index, and a
real anchor-lift e1RM) specifically to avoid "a fabricated score" — no
weighting, regression, or model, just an honest reframing of numbers the app
already computes (CLAUDE.md §2, "rules, not a fabricated score").

The Progress screen's Strength and Endurance tabs still lacked a single
"how am I doing, overall, right now" headline the way individual lifts get
one, and a reference app's clean "Overall Strength: 47 + Push/Pull/Leg
breakdown" screen showed how valuable that glance can be. This ADR decides
whether adding an "Overall Strength" and "Overall Endurance" number reverses
ADR-0202 v2's stance, and if not, how to build it so it doesn't.

## Options considered

- **A — New weighted/regression composite score.** Matches the reference
  app's apparent sophistication most closely, but reintroduces exactly the
  "fabricated score" ADR-0202 v2 rejected — a made-up formula with no
  principled basis, no better than a single number pulled from nowhere.
- **B — Skip the overall number, only add category bars.** Honest, but drops
  the single glanceable headline the user specifically asked for and the
  reference app leads with.
- **C — Plain mean of already-computed, already-displayed relative indices.**
  No new weighting or model at any level — an average of numbers the screen
  already shows elsewhere.

## Decision

**Option C.** `overallStrengthIndex(history)` (`src/domain/metrics/strength.ts`)
is a plain mean of up to four movement-category indices — Push, Pull, Legs
(squat+hinge+lunge), Core (core+carry), derived from the catalog's existing
typed `movementPattern` field. Each category index is itself
`movementCategoryStrengthIndex()`, computed by the exact same
self-relative-%-of-best formula ADR-0202 v2 already uses for muscle groups
(latest e1RM ÷ that exercise's own best-ever e1RM, averaged across
qualifying exercises, ≥2 sessions required) — generalized from
`muscleGroupStrengthIndex`'s body into a shared `relativeStrengthIndexForExercises`
helper so both rollups share one implementation.

`overallEnduranceIndex(history)` (`src/domain/metrics/endurance.ts`) mirrors
this exactly for endurance: a plain mean of `cardioCategoryEnduranceIndex()`
for the Steady/Interval categories (`movementPattern` again — the only
complete, typed axis available; see Consequences), each itself a mean of
(latest session minutes ÷ that exercise's own best-ever minutes) across
qualifying cardio exercises. The core ratio math (`relativeRatioPoints`) is
shared between both files rather than duplicated.

No weighting, regression, or model is introduced at any level in either
metric — every number at every level of the "overall → category → exercise"
hierarchy is a plain mean of a self-relative-%-of-best ratio that was already
honest at the level below it. This is why the change is additive rather than
a reversal of ADR-0202 v2: it doesn't replace the two honest numbers that ADR
introduced, it adds one more honest average on top of them.

## Consequences

- No new persistence, no new instrumentation — both composites are pure
  derivations from data the tracker already captures.
- A cardio breakdown by machine type (Treadmill/Bike/Row), closer to the
  reference app's 3-category strength breakdown, was investigated and
  rejected: `EquipmentType` has one flat `'cardio_machine'` value for all
  machine exercises (no `treadmill`/`bike`/`rower` distinction), and roughly a
  third of the cardio catalog is bodyweight-only with no machine at all — a
  machine-type bucket would leave a third of the catalog in a fabricated
  "Other" category, which is the exact failure mode this ADR exists to avoid.
  `movementPattern` (steady vs. interval) is the only complete, typed axis
  without new catalog tagging. A future `cardioType` catalog field could
  revisit this.
- Movement-pattern strength categories are a new rollup of an existing field
  (`movementPattern` was previously only used for catalog filtering/labels
  and calorie-tier lookup) — reversible the same way ADR-0202 v2's group
  rollup was: if this categorization turns out not to be useful, only the
  new `movementCategoryStrengthIndex`/`overallStrengthIndex` functions and
  their one UI card need to change, nothing else in the engine depends on them.
- Both composites use the same UI vocabulary (`Meter` proportional bars, the
  existing `trendColor`/`trendArrow` delta language) as the metrics they
  average, so a user who reads one correctly reads the other correctly too.
