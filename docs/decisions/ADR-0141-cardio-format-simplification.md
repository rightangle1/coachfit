# ADR-0141 — Cardio format simplification, visual type cards, target-area

- **Status:** Accepted (v1)
- **Date:** 2026-08-13
- **Phase:** 1

## Context

Two rounds of direct feedback on the shipped ADR-0139/ADR-0140 work:

1. **The naming collision ADR-0139 flagged and accepted turned out to be
   genuinely confusing in practice.** "Aerobics" appeared as both a
   `CardioModality` (type: the step/dance movement family) and a
   `CardioIntent` (format: the rotating-circuit session structure) in the
   same screen, and a user hitting both pickers reasonably asked "didn't I
   just pick this?" ADR-0139 deliberately kept `MovementPattern`'s
   `'aerobics'` value untouched (renaming it would ripple through
   `weekly-program.ts`, `rules-engine.ts`, `timing.ts`, `intensity.ts`) — but
   `CardioIntent` is a narrower, self-contained enum, so it was always the
   cheaper side to rename.
2. **Direct restructuring requests**: collapse `CardioIntent` from 4 values
   to 3 (Basic/Circuit/Interval); relocate the format picker from "Kind of
   session" into "Shape" (mirroring Mobility's existing PACE sub-picker);
   rename "Kind of session" → "Workout Focus" and upgrade the cardio-type
   picker to the same big visual tiles Strength/Mobility already use; rename
   "Focus" → "Target area" and re-enable it for cardio, gated to the types
   where muscle-group variety actually exists, using a simplified 4-region
   set instead of strength's full muscle-group picker.

### What "Benchmark" actually did

Investigated rather than assumed: Benchmark and Base pulled from the
identical exercise pool. The only two differences were (a) Benchmark always
picked exactly 1 Main exercise vs. Base's 2-6 scaled by experience/duration,
and (b) Benchmark hard-pinned RPE to a fixed 7 regardless of the exercise's
MET value, vs. Base's MET-derived RPE. No metrics/progress code anywhere
treated a benchmark session as a distinct tracked entity — no PR storage, no
comparison logic referenced it at all. It was a thin prescription-shape
variant of Base, not a load-bearing feature.

## Options considered

- **Fold Benchmark into Basic, drop the RPE-7 pin entirely.** Chosen: Basic
  always behaves like the old Base (MET-derived RPE, `cardioFocusCount()`
  exercises). Matches the explicit "3 types" framing and removes a feature
  that was never actually tracked as distinct.
- **Keep Benchmark's behavior as a toggle on Basic** ("repeatable effort").
  Rejected: preserves a control for a distinction nothing downstream ever
  used — added UI surface for no measurable benefit.
- **Rename the type axis's `'aerobics'` instead of the format axis's.**
  Rejected, same reasoning as ADR-0139: the type axis's word choice was
  already deliberate and re-litigating it doesn't reduce total renaming
  work, since the format axis is strictly cheaper to touch (self-contained
  `CardioIntent`, no `MovementPattern`/`MovementSlot` ripple).

## Decision

**`CardioIntent` shrinks to `'basic' | 'circuit' | 'interval'`**
(`src/domain/types/session.ts`). `'aerobics'` → `'circuit'` (resolves the
naming collision); `'intervals'` → `'interval'` (consistency with
`MovementPattern`'s existing singular `'interval'`); `'base'` and
`'benchmark'` both → `'basic'`. A new `normalizeCardioIntent()` helper
(`session.ts`) maps any stale pre-ADR-0141 string — including from
previously-persisted `WorkoutOptions` this repo has no migration framework
for — to a valid new value, defaulting unrecognized input to `'basic'` (the
safest, most conservative structure). Called at the engine's default-
resolution choke point (`rules-engine.ts`) and at the UI's schedule-
hydration site (`index.tsx`), so a stale scheduled workout both generates
correctly and shows a valid selected chip.

**UI restructuring** (`src/app/index.tsx`):
- The format picker (STRUCTURE, 3 chips) moves out of "Kind of session" and
  into "Shape," rendered only for `workoutType === 'cardio'`, between
  SESSION LENGTH and INCLUDE — mirroring Mobility's PACE sub-picker.
- "Kind of session" → "Workout Focus." Its cardio-type picker upgrades from
  small text chips to a 2-column grid of `ChoiceTile`
  (`src/design/components/controls.tsx`) — an existing, previously-unused
  component whose own doc comment names this exact use case ("such as the
  workout type in the builder"). It needs zero new photographic assets
  (unlike `WorkoutTypeTile`, which requires one): `ChoiceTile` takes an
  `icon?: ReactNode` and its selected-state rendering already works
  correctly with several tiles selected simultaneously, with no changes.
  Seven new icons were added to `icon.tsx`'s `ICONS` map (SF Symbols'
  `figure.*` activity family on iOS; approximate Material Symbols on
  Android/web, since several have no exact match).
- "Focus" → "Target area," re-enabled for cardio only when every selected
  cardio type is one of Aerobics/Bodyweight/Loaded (the types with any real
  muscle-group variety — Running/Machines/Combat/Jump rope don't), using a
  new simplified `CARDIO_TARGET_AREA_OPTIONS` (Upper body / Lower body /
  Core, region-keyed, plus the existing region-keyed "Full body" option) in
  place of strength's group-keyed `EMPHASIS_OPTIONS`. Confirmed
  `matchStrength` (`src/domain/engine/matching.ts`) already has a real,
  non-sentinel region-matching branch, so this reuses existing engine code.
- **Found during investigation, fixed as a required companion change**:
  `emphasizeAreas`/`selectedEmphasisLabels` only ever looked up matches in
  `EMPHASIS_OPTIONS`. Without a fix, a cardio target-area chip would toggle
  on visually with zero engine effect — the selection would never reach
  `generateSession`. Both now look up against a combined
  `[...EMPHASIS_OPTIONS, ...CARDIO_TARGET_AREA_OPTIONS]` list; no key
  collisions are possible since `areaKey()` encodes `group`/`region` in
  separate slots.

## Consequences

- Reversible: the type rename, the relocated picker, the `ChoiceTile` swap,
  and the target-area gating are all independently revertable without
  touching unrelated code.
- Closes the specific naming-collision gap ADR-0139 flagged and left open —
  "Aerobics" now means exactly one thing in the cardio builder UI.
- **Known, accepted limitation, not silently shipped**: within the three
  eligible types (aerobics 12, bodyweight 19, loaded 5 exercises), 24/36 are
  pure lower-body-primary and 0/36 are pure upper-body-primary — the only
  upper-dominant cardio exercises (arm bike, rowing, shadow boxing) live in
  `machine_cardio`/`combat`, excluded from this picker by design. So "Lower
  body" is close to a no-op (~35/36 match) and "Upper body" only ever biases
  toward mixed-primary compound movements (burpees, KB snatch/thruster, star
  jumps, bear crawl, mountain climbers) rather than filtering to something
  purely upper-focused. This is a soft ranking nudge — cardio's Main
  selection has none of strength's quota/backfill scaffolding
  (`emphasisQuotaFor`, priority-mode pool restriction,
  `rules-engine.ts:533-614`), and this change doesn't add it, to keep scope
  bounded. If Target area needs to feel authoritative rather than a gentle
  bias for cardio, that quota work is a real, separate follow-up.
