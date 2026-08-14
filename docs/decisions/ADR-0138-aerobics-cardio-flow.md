# ADR-0138 — Aerobics as a third cardio flow

- **Status:** Accepted (v1)
- **Date:** 2026-08-11
- **Phase:** 1

## Context

Cardio had two flows: steady-state (`CardioIntent: 'base' | 'benchmark'`, one
continuous exercise, mostly machines — treadmill/bike/rower) and interval
(`'intervals'`, one exercise alternating max-effort work/recovery phases,
mostly bodyweight plyo). There was no non-machine, continuous, moderate-
intensity option — the classic "aerobics class" shape: several distinct
low/moderate-impact moves rotating through a circuit at a steady pace. The
ask was to grow cardio beyond machines with a first-class aerobics flow.

ADR-0137 §Extensibility already anticipated this, naming "Aerobic as another
cardio-shaped case" as the expected shape for exactly this kind of addition:
one that only restricts Main's candidate pool, not one that needs its own
session-block structure the way Stretch/Yoga do.

## Options considered

- **A new `WorkoutType: 'aerobics'`**, mirroring how yoga/barre/stretch are
  separate `WorkoutType`s despite all being `modality: 'mobility'`. Rejected:
  those three got separate types because they're a different screen paradigm
  entirely (`buildYogaFlow`-style stage-ordered single flow block). Aerobics
  shares cardio's ordinary Main/exercise/set screen — it only needs a
  different *selection and grouping* rule inside the existing `cardio` path,
  which is exactly the "restricts Main's pool" case ADR-0137 called out.
- **A fourth `CardioIntent` value (`'aerobics'`) plus a third `MovementPattern`
  value**, at the same level `'base'`/`'intervals'`/`'benchmark'` and
  `'steady_cardio'`/`'interval'` already sit. Chosen: additive to every enum
  it touches (`CardioIntent`, `MovementPattern`, `MovementSlot`,
  `CardioCategory` on the metrics side), no migration, and consistent with
  where the steady/interval split already lives one level below `WorkoutType`.
- **A bespoke circuit-grouping mechanism**, purpose-built for aerobics.
  Rejected in favor of reusing `PlannedExercise.rotationGroup` +
  `SupersetGroup` (adding `'circuit'` to `SupersetType`) — the tracker's
  round-based "Round X of Y" view (built for supersets) already renders any
  `rotationGroup` generically. No UI code switches on `SupersetGroup.type`
  today, confirmed by inspection, so the new enum value is safe and free.

## Decision

`MovementPattern`/`MovementSlot` gain `'aerobics'`; `CardioIntent` gains
`'aerobics'`; `SupersetType` gains `'circuit'`; `CardioCategory` (endurance
metrics) gains `'aerobics'`. `WorkoutType` is unchanged.

Selecting `cardioIntent: 'aerobics'` (only reachable when `workoutType ===
'cardio'`, same as the existing three intents) picks several distinct
aerobics-pattern exercises (`aerobicsStationCount`, ~3-6 scaled by
experience/duration — a sibling to the existing `cardioFocusCount`) instead
of one repeated exercise. Each station gets `rounds` of a single short
work-only `PlannedSet` (`cardioSets()`'s new branch) sized from the session's
time budget split across stations; a new `applyAerobicsCircuit()`
(`src/domain/engine/cardio-circuit.ts`, a smaller sibling to
`supersets.ts` — no antagonist/mechanic classification needed since every
station belongs together by construction) then assigns one shared
`rotationGroup`/`group: { type: 'circuit' }` across the whole Main block, and
trims every station to the shortest round count first — mirroring
`supersets.ts`'s `equalizeSetCounts` — so the tracker's index-based round
navigation never desyncs across stations. `restSecondsFor()` gets one new
case (`REST.AEROBICS_TRANSITION = 10s`) ahead of the `modality === 'cardio'`
catch-all (which returns 0, "rest is intrinsic to the bout") — a circuit
keeps moving between stations, it isn't zero-rest like a single steady bout.

Catalog: ~16 new exercises across low-impact/bodyweight circuit moves, step
aerobics (reusing the existing `bench` equipment type), and cardio
kickboxing combos. Dance-inspired cardio was deliberately excluded — it's
hard to specify as discrete, choreography-free steps/illustrations without
music or video (CLAUDE.md §11's offline, self-made-illustration approach).

`moderateEquivalentMinutes()` (the WHO/ACSM weekly-minutes index) weights
aerobics at the same 1x as steady, not interval's 2x vigorous-equivalence —
it's continuous, moderate-RPE work, the conservative read absent a measured
intensity signal.

## Consequences

- Reversible: removing aerobics means dropping the enum values, the
  `cardioSets()` branch, and `cardio-circuit.ts` — nothing else in the
  pipeline depends on it existing, matching ADR-0137's own reversibility bar.
- Every timed flow in the app (yoga/stretch/barre pose holds, and now
  aerobics circuit stations) is still tracked by tapping through one
  hold/round at a time — no flow auto-advances. Generalizing that into a
  single auto-advance sequencer usable by all of them was scoped explicitly
  as a later, supplemental phase; see
  [../methodology/guided-flow-sequencer.md](../methodology/guided-flow-sequencer.md)
  for the design.
- `aerobicsStationCount` and the per-station work/transition seconds
  (45s/10s defaults) are tuning constants, not verified against real user
  sessions yet — expect these to move once aerobics has real usage data,
  the same way other prescription constants in this file already do.
