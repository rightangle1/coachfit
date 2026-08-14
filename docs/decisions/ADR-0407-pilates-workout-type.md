# ADR-0407 — Pilates workout type, WorkoutFamily, and the two-step session picker

- **Status:** Accepted
- **Date:** 2026-08-13
- **Phase:** 1

## Context

The user asked for a clearer top-level structure to the "Kind of session" picker
— Strength / Cardio / Mobility — with Pilates added as a fourth Mobility style
alongside Stretch/Yoga/Barre. Barre (ADR-0404) is the direct structural
precedent: a stage-ordered flow, added as a `WorkoutType` + `MovementPattern`
+ new catalog content, following the same mechanism as Yoga rather than
inventing one. This ADR follows that precedent for Pilates and adds the
`WorkoutFamily` grouping the picker needed to organize all four Mobility
styles (plus Strength's four and Cardio's one) into two steps instead of one
flat 9-tile grid.

## Decision

**`WorkoutFamily` (`'strength' | 'cardio' | 'mobility'`) is a new type in
`session.ts`, with a single source-of-truth mapping,
`WORKOUT_TYPE_FAMILY`/`familyOfWorkoutType()` in `app-lib/options.ts`.**
Every place that previously hardcoded `workoutType === 'stretch' ||
workoutType === 'yoga' || workoutType === 'barre'` (or the equivalent
per-type ternary chain) to mean "the mobility styles" now calls
`familyOfWorkoutType(...) === 'mobility'` instead — `toneForWorkoutType`,
`workoutTypeIcon`, `WorkoutTypeTile`'s icon, the Shape section's flow-length-
vs-session-length branch, the `workoutOptions` assembly's flow-vs-include
branch, and the mobility-sessions-this-week stat in `personalization.ts`. A
new mobility style is picked up by every one of these for free. Not every
`'yoga'/'barre'`-style check became family-based, though — a few are
narrower than "all of mobility" and needed Pilates added explicitly instead:
the Focus section's muscle-emphasis exclusion (Yoga/Barre/Pilates are
muscle-agnostic-by-stage like Barre's rationale already says; Stretch is not,
so it can't be swept into the family check), and the per-type flow-label
ternaries (`workoutOverview`, `buildFlowRationale`) which need Pilates' own
string, not a shared bucket.

**Pilates is added as three coordinated pieces, exactly Barre's structure:**
1. A new `WorkoutType`, `'pilates'` (`session.ts`).
2. A new `movementPattern`, `'pilates_flow'` (`exercise.ts`) — **zero new
   `FlowStage` values**, a deliberate deviation from Barre's precedent
   (Barre added 4 new stages; Pilates' `PILATES_STAGE_ORDER` reuses six
   already-existing ones: `center → warmup → core → backbend → standing →
   cooldown`. `'backbend'` stands in for Pilates' spinal-articulation work
   (roll-ups, swimming, extension holds) and `'standing'` for its
   standing/balance integration — close enough semantically that adding
   Pilates-specific stage names before real content justified them would
   just be premature vocabulary.
3. `buildStageFlow` (already generalized for Yoga/Barre) takes a third
   `stageOrder`/`holdSpec` pair unchanged — `MOBILITY_HOLD.pilates = { hold:
   45, min: 25, max: 70 }`, between Barre's brisk pulses and Yoga's long
   static holds.

**Second deliberate deviation from Barre: no new `EquipmentType`.** Pilates
reuses `'yoga_mat'` as its optional-with-fallback prop
(`equipmentSatisfied(e, input.equipment, ['yoga_mat'])`, same treatment Yoga
already gets) rather than a dedicated `'pilates_mat'` — a yoga mat and a
Pilates mat are the same object in practice. The existing "No yoga mat in
your equipment" hint in `index.tsx` just extends its condition to
`workoutType === 'yoga' || workoutType === 'pilates'`.

**18 new `pilates_flow` catalog exercises**
(`src/domain/catalog/exercises.ts`), covering all 6 stages: 1 center
(breath), 3 warmup, 6 core, 3 backbend, 3 standing, 2 cooldown. **The 7
existing `co-`-prefixed exercises with Pilates names** (The Hundred, Roll-up,
Single-leg/Double-leg stretch, Pilates swimming, Pilates saw, Teaser) **were
not retagged** — they stay `movementPattern: 'core'`, ordinary strength-
session core accessories, exactly as ADR-0404's own "don't retag" precedent
required for barre_flow. The new pilates_flow entries are separate ids
adapted from several of them (`pl-the-hundred-flow`, `pl-roll-up-flow`,
`pl-single-leg-stretch-flow`, `pl-double-leg-stretch-flow`,
`pl-swimming-flow`, `pl-saw-stretch`) for the dedicated flow, alongside new
material (centering breath, pelvic tilt, cat-cow, criss-cross, cobra prep,
superman hold, standing leg circle/balance/side-bend, child's pose) to fill
out stages the `co-` set didn't cover (warmup, backbend, standing, cooldown).

**Every other Barre touch-point got a mirrored Pilates case**, driven by
`tsc`'s exhaustiveness checking wherever the target type was an exhaustive
`Record`/`switch` (`MOVEMENT_PATTERN_LABELS`, `WORKOUT_TYPE_ART`,
`WORKOUT_HEADER_BACKGROUNDS`, `PATTERN_CONFIG`, `movementSlotFor`/
`jointsFor`, `HealthActivityType`/`ACTIVITY_TYPE_MAP`) plus a manual sweep
for the boolean-OR/switch-with-default sites `tsc` can't catch
(`workout-type-catalog.ts`, `NO_STRENGTH_TEST_STYLES`, `WORKOUT_STYLE_KEYS`,
the rules-engine dispatch branch itself). `WorkoutActivityType.pilates`
exists natively in `@kingstinct/react-native-healthkit` (same as `.barre`),
so HealthKit write-back gets the correct native activity type, not a
`'functional'` fallback.

**The "Kind of session" picker becomes two steps** (`index.tsx`, replacing
the single 9-tile grid): step A shows 3 `FamilyTile`s (Strength/Cardio/
Mobility); step B shows `WorkoutTypeTile`s filtered to
`familyOfWorkoutType(option.value) === selectedFamily` for Strength/Mobility,
or the `CARDIO_INTENTS` format chips directly for Cardio (moved out of the
Shape section, not duplicated — Cardio's family has exactly one
`WorkoutType` member, so picking the family already picked the style; only
the *format* still needs choosing). `WorkoutTypeTile` and the new
`FamilyTile` both delegate to a shared `SelectableHeroTile` presentational
component (extracted from `WorkoutTypeTile`'s existing JSX) rather than
duplicating the hero-art-plus-checkmark tile. `selectedFamily` is local state
initialized from `familyOfWorkoutType(workoutType)` and re-synced on an
external `workoutType` change (e.g. picking a routine) via the same
"adjust state when a prop changes" render-time pattern `ExerciseHero`
already uses, not a `useEffect`. Family art reuses existing hero images
(bodybuilding/cardio/yoga heroes) — no new assets (CLAUDE.md §11).

## Consequences

- **Balanced's tone changed, visibly.** `toneForWorkoutType(undefined)` used
  to return its own dedicated `'primary'` tone; deriving from
  `familyOfWorkoutType` (which resolves unset to `'strength'`) means Balanced
  now renders with the strength tone everywhere `toneForWorkoutType` feeds a
  tint — the Balanced tile, the workout overview/pre-start card, onboarding,
  workout-details. This is intentional: Balanced sitting in the Strength
  family with a different tone than its own siblings would read as
  inconsistent. Covered by a direct `toneForWorkoutType` test
  (`context-tone-test.ts`) asserting the new Balanced→strength resolution
  explicitly, so it reads as a decision, not a regression, if it's ever
  questioned later.
- **Fully additive and reversible**, same spirit as ADR-0404: no existing
  `WorkoutType`, `MovementPattern`, or `FlowStage` value changed meaning;
  `buildStageFlow`'s Yoga/Barre behavior is unchanged (existing Yoga/Barre
  tests, untouched, still pass); the guided-flow player (ADR-0405) needed
  zero new code for Pilates — its routing keys off `block.modality ===
  'mobility'`, which Pilates' flow block already gets via the same dispatch
  branch as Yoga/Barre/Stretch.
- No dedicated Pilates hero art yet — reuses Yoga's, same placeholder spirit
  as Barre reusing Yoga's and Sculpting reusing Bodybuilding's.
- This closes out the approved 3-stage guided-workflow plan (Mobility player
  → Cardio flow → Family picker + Pilates) in full.
