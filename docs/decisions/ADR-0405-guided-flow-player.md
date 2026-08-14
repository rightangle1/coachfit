# ADR-0405 — Guided flow player: route, toggle, and skip semantics

- **Status:** Accepted
- **Date:** 2026-08-13
- **Phase:** 1

## Context

`docs/methodology/guided-flow-sequencer.md` designed a touchless, auto-
advancing playback experience for timed flows — a yoga/stretch/barre pose
hold today, an aerobics circuit station or cardio interval later — but was
never reviewed or built; every timed hold was still tracked the same manual
way as a lifting set (tap to complete, tap back to the overview, tap into
the next exercise). That fights the entire point of a flow: the athlete's
hands are often not free mid-pose, and stopping to tap a screen breaks the
flow. The design doc left three questions explicitly open before a first
line of code could be written. This ADR reviews that doc and answers them,
covering the first (Mobility) slice of the sequencer — yoga, stretch, and
barre. Aerobics circuits and steady/interval cardio reuse the same
mechanism decided here; they are a follow-on, not part of this decision.

## Decision

**Where it renders (doc §3.3): a dedicated route, not a 4th `workout.tsx`
view state.** The tab bar's visibility is controlled per-route in
`src/app/_layout.tsx` — `workout` itself was never in the hidden-chrome
array, so a same-screen `'flow'` view would still show the tab bar, and
nothing in the app dynamically toggles `tabBarStyle` from component state.
`src/app/workout-flow.tsx` is a new route, added to `_layout.tsx`'s existing
hidden-tab-bar array (the same idiom `exercise`/`debrief`/`tour` already
use). It reads `plan`/`record` straight from `useWorkoutStore` (already
global) and is entered via `router.push('/workout-flow')`, exited via
`router.back()`.

**The flattener (doc §3.1, corrected): rounds outward, stage order inward.**
The doc's sketch took duration "from its sole (or first)" set, which
undersells `buildStageFlow` — it already produces multiple whole rounds,
every exercise's `sets.length === rounds`. `flattenStageFlow`
(`src/domain/engine/guided-flow.ts`) iterates round 0's full stage-ordered
sequence, then round 1's, etc. — pure, over already-generated plan data, no
change to `generateSession()`'s output shape.

**The on/off switch (doc §3.4): `WorkoutOptions.autoAdvance?: boolean`.**
Named distinctly from the existing `flow: { durationMin?, pace? }` field
(pacing knobs, unrelated) per the doc's own naming-collision warning. Unset
resolves via `defaultAutoAdvance(workoutType, cardioIntent)` — `true` for
yoga/stretch/barre (and, structurally, for `cardio`, once Stage 2 lands),
`false` otherwise — rather than this codebase's usual "unset = legacy
behavior" convention, since there is no prior guided-flow behavior to
preserve. An explicit `false` falls all the way through to today's manual
tracking with zero new code running, so a rough day can still be worked
through tap-at-your-pace without losing data. Surfaced as a "Touchless /
Manual" chip pair in the Today screen's Shape section, alongside the
existing Flow length/Pace chips.

**Skip semantics (doc §5): reuse `skipSet`/`PerformedSet.skipped`, not a new
field.** `skipSet(exerciseId, setIndex)` already existed in
`src/state/workout-store.ts` but was dead code — defined, never called
anywhere. `useGuidedFlowPlayer`'s `skipForward()` is its first live caller.
`skipBack()` is pure navigation, mirroring the existing Previous-round
button in the `'superset'` view — it doesn't un-skip or un-complete
anything.

**Timing and pause reuse existing mechanisms rather than inventing parallel
ones.** The countdown uses the same wall-clock algorithm `TimedSetControls`
already uses (`endAt = Date.now() + seconds*1000`, re-diffed on a 250ms
tick, self-correcting across backgrounding) — the algorithm, not the
component, since its ±5s/edit/play-pause chrome doesn't fit a touchless
full-screen surface. Pausing calls the same `toggleTimerPause()` store
action every other workout screen already uses — one shared pause switch
app-wide, which also resolves the doc's ADR-0401 Live Activity concern for
free (there is only ever one "what's paused" source of truth).

**Completion stays silent until the flow ends.** Popping a debrief sheet
after every hold would defeat the point of "touchless." Intermediate steps
write through `updateSet` silently; only the last step's completion routes
back to the normal overview. `needsExerciseDebrief` (`workout.tsx`) already
returns `false` whenever a block's `modality === 'mobility'` — yoga/stretch/
barre already skip the debrief sheet today — so this stage needed zero new
debrief logic.

## Consequences

- **Fully additive and reversible.** The `'overview'`/`'exercise'`/
  `'superset'` views in `workout.tsx` are untouched; `openExercise()` gains
  one new branch checked ahead of the existing `rotationGroup` check, and
  falls straight through to today's exact behavior whenever `autoAdvance`
  resolves false. No existing rules-engine test changed — `flattenStageFlow`
  only reads already-generated plan output.
- Yoga/stretch/barre now default to touchless playback for every athlete;
  the "Manual" chip is the escape hatch, not a separate build.
- `guided-flow-sequencer.md`'s status line should be updated to point here
  once this lands, rather than continuing to read "design only, nothing
  implemented."
- Aerobics circuits (reusing this same player, via a `flattenRotationGroup`
  over `rotationGroup` membership) and steady/interval cardio (a simpler
  phase-colored timer variant, no thumbnail strip — structurally there is
  only ever one cardio exercise for those intents) are follow-on work, not
  covered by this ADR.
