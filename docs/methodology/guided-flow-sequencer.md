# Guided Flow Sequencer — design doc

**Status: Mobility and Cardio slices built.** [ADR-0405](../decisions/ADR-0405-guided-flow-player.md)
reviewed this doc and closed out its three open questions (§3.3-§5) for
yoga/stretch/barre; [ADR-0406](../decisions/ADR-0406-guided-flow-cardio.md)
extended it to aerobics circuits and steady/interval cardio (§4's second
phase, built second per the user's request rather than this doc's own
"aerobics first" suggestion) — see `src/domain/engine/guided-flow.ts`,
`src/features/guided-flow-player.tsx`, and `src/app/workout-flow.tsx`.
Pilates (a later, separate workout type) is not part of this sequencer work.
Companion to [programming-engine.md](./programming-engine.md) (engine side),
[ADR-0138](../decisions/ADR-0138-aerobics-cardio-flow.md) (the decision that
deferred this to its own phase), [ADR-0405](../decisions/ADR-0405-guided-flow-player.md)
(the Mobility build), and [ADR-0406](../decisions/ADR-0406-guided-flow-cardio.md)
(the Cardio build).

---

## 1. Problem

Every timed flow in the app today — a yoga pose hold, a stretch hold, a barre
sequence, and now an aerobics circuit station — is tracked the same manual
way: `TimedSetControls` (`src/features/exercise-detail.tsx`) counts one
hold/interval down to zero, and the athlete has to act to move on — back out
to the workout overview and into the next exercise, or, for a
`rotationGroup`'d circuit/superset, tap Next in the round view
(`src/app/workout.tsx`, `view === 'superset'`).

That's the right default for lifting — you decide when you're ready for the
next set. It works against the entire point of a flow. Yoga, stretch, and an
aerobics circuit are all meant to move at a set pace: the athlete's hands are
often not free (mid-pose, mid-punch-combo), and stopping to tap a screen
breaks the thing that makes a flow a flow. No auto-advancing playback exists
anywhere in the app today.

## 2. What already exists to build on

Nothing here needs a new plan shape — `SessionBlock`/`PlannedExercise` stay
the source of truth. The sequencer's job is to *read* an ordering that
already exists per flow type and drive playback over it:

| Flow | Ordering source today | Shape |
|---|---|---|
| Yoga / Stretch / Barre | `FlowStage` (`src/domain/types/exercise.ts`) — `buildYogaFlow`/`buildStretchFlow` in `rules-engine.ts` sequence exercises by stage (center → warmup → standing → balance → backbend/seated → cooldown, or barre's thighs/seat/core/arms) | One `SessionBlock`, exercises in stage order, no `rotationGroup` |
| Aerobics circuit (ADR-0138) | `rotationGroup` — every station shares one id, `applyAerobicsCircuit()` | One `SessionBlock`, N exercises sharing a `rotationGroup`, each with the same round count |
| Superset/triset (not a flow — included for contrast) | `rotationGroup`, `applySupersets()` | Same shape as aerobics, but manual by design — a lifter chooses their own pace between paired exercises |

Two different orderings (flow-stage sequence vs. rotation-group circuit) both
need to become the same flat step list for playback. That flattening is the
sequencer's first job, not a new field on the plan.

Other existing pieces the design should reuse rather than duplicate:

- **`TimedSetControls`** (`exercise-detail.tsx`) — the countdown primitive
  (editable duration, ±5s adjust, play/pause, haptic + optional sound on
  zero). The sequencer wraps this, it doesn't replace it: same visual
  countdown, plus auto-advance instead of stopping at zero.
- **`SessionRecord.pausedAt` / `pausedDurationMs`** (`src/domain/types/session.ts`)
  — the existing mechanism that keeps the workout's elapsed clock honest
  across app backgrounding/reloads. A guided flow's own countdown needs the
  same treatment (survive backgrounding without drifting), not a parallel one.
- **`WorkoutOptions.flow: { durationMin?, pace? }`** (session.ts) — today
  yoga/stretch-only pacing knobs, *not* a sequencer toggle. Naming collision
  to watch: this document's "guided flow" is a different concept from this
  existing field. Whatever on/off switch gets added (§4) needs a name that
  doesn't read as the same thing.
- **ADR-0401 (iOS Live Activity)** — if a guided flow is running during a
  session that also has a Live Activity, the two must not fight over what's
  "current." The Live Activity's own advance-set buttons and the sequencer's
  auto-advance need one source of truth for "what step are we on."

## 3. Proposed architecture

### 3.1 Flatten to one step list

```ts
interface GuidedFlowStep {
  exerciseId: string;
  label: string;              // exercise name, or a per-round label ("Round 2 · Step-touch")
  durationSec: number;
  pattern: MovementPattern;   // drives MovementIllustration during playback
}
```

Two flatteners, one per ordering source, both producing `GuidedFlowStep[]`:

- **Flow-stage flatten** (yoga/stretch/barre): the block's exercises are
  already in stage order — one step per exercise, `durationSec` from its sole
  (or first) `PlannedSet.durationSec`.
- **Rotation-group flatten** (aerobics, and optionally superset/triset if a
  lifter opts into guided mode for a circuit-style superset): iterate rounds
  outward, stations inward — round 1's N stations, then round 2's N stations,
  etc. — matching the round semantics `workout.tsx`'s existing superset view
  already computes via `group[0].sets.findIndex(...)`.

Both flatteners are pure functions over already-generated plan data — no
change to `generateSession()`'s output shape.

### 3.2 Playback engine

A hook, e.g. `useGuidedFlowPlayer(steps: GuidedFlowStep[])`, owning:

- current step index
- countdown (ticking down from the current step's `durationSec`)
- auto-advance to the next step at zero, with the same haptic/sound cue
  `TimedSetControls` already fires on completion
- pause/resume (mirrors `SessionRecord.pausedAt`/`pausedDurationMs` — the
  flow's own elapsed-time accounting should reuse that pattern, not invent a
  second one)
- manual skip forward/back (a flow athlete having a hard day can still get
  through it their way — auto-advance is the default cadence, not a cage)
- completion (last step's countdown hits zero → hand back to the normal
  overview/debrief flow exactly like finishing an exercise today)

### 3.3 Where it renders

Two options, not yet decided — this is the one open call the real build needs
to make before writing code:

- **A fourth `workout.tsx` view mode** (`'flow'`, alongside today's
  `'overview' | 'exercise' | 'superset'`) — a dedicated full-screen player.
  Cleaner mental model, more new UI surface.
- **An auto-advance mode on the existing `'superset'` round view** — the
  round view already shows "Round X of Y" with manual Previous/Next; add a
  ticking countdown that also auto-advances. Less new surface, but the
  existing view's manual controls must keep working unchanged when guided
  mode is off, and yoga/stretch/barre don't go through that view today (no
  `rotationGroup`), so they'd need the flow-stage flattener wired into it too.

Either way: pausing a guided flow must never lose the athlete's place — the
same requirement `SessionRecord.pausedAt` already satisfies for the whole
workout clock.

### 3.4 The on/off switch

Needs a real decision, not a default-on assumption — someone mid-yoga-flow
having a rough day should be able to fall back to manual, tap-at-your-pace
tracking without losing data. Candidate shapes:

- A new `WorkoutOptions` field (distinctly named from the existing `flow`
  field — see §2) — e.g. `guidedFlow?: boolean` — defaulting to unset =
  today's manual behavior exactly, per this codebase's existing convention
  for every optional `WorkoutOptions` field.
- Or a per-`WorkoutType`/`CardioIntent` default (aerobics + yoga + stretch +
  barre default to guided on, everything else has no flow to sequence), with
  a session-level override.

### 3.5 Explicitly out of scope for v1

Keep the eventual build small:

- Voice cues / spoken countdowns
- Music sync or tempo detection
- Per-step video (media stays the existing still/clip model, ADR-0301-0303)
- Multi-user/class-style playback

## 4. Rollout order once this phase starts

1. **Aerobics first.** It's the newest, simplest case — one flat rotation,
   no `FlowStage` semantics to reconcile, and it's the flow that motivated
   this document. Prove the sequencer out here.
2. **Yoga/stretch/barre second**, once the aerobics integration validates the
   flatten-then-play split. These need the flow-stage flattener and have to
   coexist with `buildYogaFlow`/`buildStretchFlow`'s existing pool-substitution
   behavior (an unsafe-today pose is skipped, not substituted — ADR-0137
   §v2) — the sequencer must not fight that, only play whatever ordered list
   generation already produced.

## 5. Open questions for whoever picks this up

- Fourth view mode vs. augmented round view (§3.3) — needs a decision before
  the first line of UI code.
- Exact `WorkoutOptions` field name and default-on set (§3.4).
- Does skip-forward during a guided flow log the skipped step as `skipped:
  true` (like today's manual skip) or something new — same question the
  existing debrief/decision-log (CLAUDE.md §7) already has an answer for
  elsewhere; this should reuse it, not invent a parallel rule.
