# ADR-0406 — Guided flow player: cardio (aerobics circuits + steady/interval phase timer)

- **Status:** Accepted
- **Date:** 2026-08-13
- **Phase:** 1

## Context

ADR-0405 built the touchless guided-flow player for the Mobility slice
(yoga/stretch/barre) and explicitly deferred cardio as follow-on work. This
ADR covers that follow-on: aerobics circuits reusing the same player, and a
phase-colored timer for steady/interval cardio.

The approved plan assumed two distinct cardio shapes needing two distinct
flatteners — a `flattenRotationGroup` for aerobics (mirroring the existing
`'superset'` round view's rotation-group logic) and a `flattenIntervalCardio`
for "steady/interval cardio (normally one exercise)". Re-tracing
`cardioSets()`/the Main-block dispatch in `rules-engine.ts` while implementing
surfaced a correction to that assumption, which this ADR resolves along with
the other two open calls (flattener design, debrief semantics).

## Decision

**Correction to the plan: base-intent cardio is not always a single
exercise.** `cardioIntent === 'base'` (the default) picks
`cardioFocusCount(experience, targetDurationMin)` exercises — 1 to 6, each a
single steady-state `PlannedSet` — not always one, as the plan's own
verification note assumed. Only `'intervals'` and `'benchmark'` are forced to
exactly one Main exercise. So there are really only two structural shapes to
handle, not three: a multi-exercise Main block (aerobics *or* base with
several picks) and a single-exercise Main block (benchmark, intervals, or
base when only one exercise was picked/available).

**No `flattenRotationGroup` — `flattenStageFlow` (ADR-0405) is reused
unchanged for both aerobics and multi-exercise base cardio.** Main is always
built as one `SessionBlock` containing exactly the circuit's stations or the
base picks, nothing else mixed in — the identical shape `buildStageFlow`
already produces for yoga/stretch/barre (round-robin over `block.exercises`
with equal `sets.length`). `flattenStageFlow` never inspected modality or
`rotationGroup` to begin with, so it flattens a cardio Main block exactly the
same way with zero new code. Adding a second, narrower function that filters
by `rotationGroupId` would only duplicate this. `src/domain/engine/guided-flow.ts`'s
JSDoc and a new test (`guided-flow-test.ts`) document this reuse explicitly
so it doesn't read as an oversight later.

**`flattenSingleExerciseCardio` (new) covers the single-exercise case.**
Benchmark and base-with-one-pick have a single work `PlannedSet`; intervals
alternates work/recovery pairs. One step per set; `round`/`roundCount` count
work phases only, so a work+recovery pair reads as one round. When there's no
recovery phase at all, `label` falls back to the exercise's name instead of
`'Work'` — there's nothing to announce a phase for.

**No `GuidedFlowPhaseTimer` component — `GuidedFlowTimer` (ADR-0405) gained
an optional `tone?: ContextTone` prop instead.** The plan sketched a
dedicated phase-timer component ("no thumbnail strip... large phase-colored
timer... Round X of Y counter"), but `GuidedFlowTimer` already renders the
round eyebrow (`{label} · ROUND {n} OF {count}`), and "no thumbnail strip" is
purely a composition choice in `workout-flow.tsx` (whether it also renders
`GuidedFlowThumbnailStrip` beneath it), not a property the timer itself
needs. The only genuinely new requirement was phase *coloring*. `tone`, when
set, tints the `Meter` fill and adds a small colored dot before the eyebrow;
the countdown digits stay `heroText` white regardless, since tone tokens
aren't tuned for legibility over arbitrary hero photography the way the
existing hero color system is. Work → `'endurance'` (cardio's own tone
elsewhere in the app), recovery → `'mobility'` (already documented in
`tokens.ts` as "calm lavender/moss for mobility/**recovery** contexts") — both
existing `ContextTone` tokens, no new hex values. Aerobics/base-multi steps
never carry a `phase` at all (`cardioSets` only sets `'work'`/`'recovery'` on
the single-exercise interval shape), so the same tone function's `work`
fallback colors those too — one function, one meaning, for both cardio
shapes.

**Routing (`workout.tsx openExercise()`): extends ADR-0405's gate rather than
adding a parallel one.** `block.modality === 'cardio' && plan.workoutType ===
'cardio'` joins the existing `block.modality === 'mobility'` check ahead of
the `rotationGroup` branch — aerobics stations carry a `rotationGroup`, so
this still has to win first, same reason the mobility check already had to.
The `workoutType === 'cardio'` guard is deliberately explicit rather than
relying on `defaultAutoAdvance` alone: a Conditioning block bolted onto a
Bodybuilding/Sculpting session is also `modality: 'cardio'`, and must never
auto-advance even though nothing about block modality alone rules it out.

**Debrief: exactly one, applied to every exercise the flow touched, not one
per station.** `needsExerciseDebrief` in `workout.tsx` returns `true` for any
cardio block (unlike mobility) — today's manual `'superset'` view pops one
debrief per station back-to-back since every station exhausts on the same
final round. `workout-flow.tsx` now owns a small inline debrief (a single RPE
`Stepper` in a `SheetModal`, shown after `onAllComplete` instead of
navigating back immediately) rather than reaching into `workout.tsx`'s debrief
state across the route boundary. The chosen RPE is written via
`setExerciseRpe` to every exercise in the block — a circuit is rated as one
effort, not per station, and cardio's progression logic
(`cardioSets`'s `mayProgress` check) reads each exercise's own logged `rpe`,
so every station needs a value written, not just the last one touched.

## Consequences

- **Fully additive and reversible**, same as ADR-0405: the manual `'exercise'`/`'superset'`
  views are untouched, `openExercise()` gains one widened condition, and
  turning `autoAdvance` off for a Cardio session falls straight through to
  exactly today's per-station/per-exercise manual behavior with zero new code
  running.
- Aerobics and base cardio (however many exercises it happened to pick) both
  default to the touchless thumbnail-strip player; benchmark, intervals, and
  a base session that only picked one exercise get the phase-colored timer
  instead, with no thumbnail strip since there's only one exercise to show.
- `guided-flow-sequencer.md`'s status line should note the Cardio slice is
  now built alongside Mobility, closing out doc §4's rollout order (reversed
  from its own "aerobics first" suggestion per the user's request — Mobility
  proved the mechanism first, Cardio second).
- Pilates and the two-step family picker (Stage 3 of the original plan)
  remain unbuilt, not covered by this ADR.
