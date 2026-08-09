# ADR-0114 — Flow session structure (Yoga vs. Stretch)

- **Status:** Accepted (v3)
- **Date:** 2026-07-28 (v3: 2026-07-28)
- **Phase:** 1 (engine revamp)

## Context
`Exercise.flowStage` and the `movementPattern: 'yoga_flow'` catalog entries have
cited "ADR-0114" since ADR-0101/0112, and `rules-engine.ts`'s flow-sequencing logic
has cited it since it was written — but the file never existed (the index jumped
0113 → 0115). `ADR-0304`'s own Consequences section flagged this explicitly as a
pre-existing gap. This ADR closes it, and additionally documents a v2 redesign that
came out of a session-generation logic review: the original v1 mechanism treated a
`workoutType: 'yoga'` and `workoutType: 'stretch'` session identically (the same
stage-ordered `buildOrderedFlow`, differing only in which catalog pool and hold-
length constants it drew from), and derived hold length by dividing the requested
time budget by however many poses fit — which could silently compress a pose's
hold length to hit a duration.

The review surfaced that Yoga and Stretch are actually different activities that
should be built differently:
- **Yoga** is a sequence — a flow class has a natural, repeatable combo (like a
  sun-salutation), and the number of times you repeat it depends on how long you
  have, not how short each pose gets compressed to. It's muscle-agnostic: you don't
  "target biceps" with a yoga flow, but you do still need to route around an
  injured area.
- **Stretch** is not a flow at all — it should be built around explicit targeting
  ("what am I trying to loosen up today?"), stay a small and deliberate set of
  exercises rather than a rotating circuit, and use the scientifically correct
  prescription for each stretch type: a static hold (30-60s) or a dynamic movement
  (10-15 reps, no hold).

Grounding: `docs/methodology/strength-set-design.md` §7.

## Options considered
- **Option A — keep v1's single shared mechanism**, just fix the hold-length
  compression bug. Simple, but doesn't capture that Yoga and Stretch have
  genuinely different structures (sequence-with-repeats vs. targeted-set).
- **Option B — two dedicated builders**, each shaped for what its activity
  actually is, sharing only the low-level `pick()`/avoidance machinery. Chosen.
- **Option C — one config-driven builder** parameterized by "sequence mode" vs.
  "targeted mode." Rejected: the two modes diverge enough (stage-ordered bookends
  + whole-round repeat math vs. per-area picks + progression-based prescriptions)
  that a shared parameterized function would need as many branches as two plain
  functions, with less clarity.

## Decision

### Yoga — `buildYogaFlow()`
An opening pose (`YOGA_STAGE_ORDER[0]`, `'center'`) and a closing pose
(`'cooldown'`), each a single hold, bookend a **combo**: one pose per middle
stage (`warmup → standing → balance → backbend → seated`), picked once and then
**repeated as a unit** for as many whole rounds as the time budget naturally
allows:

```
naturalRoundSeconds = comboPoses.length × (holdSeconds + activityOverhead)
rounds = max(1, floor((requestedSeconds − bookendSeconds) / naturalRoundSeconds))
```

Hold length (`MOBILITY_HOLD.yoga`, 30-90s, pace/readiness-scaled within that band)
is fixed *before* round count is computed — round count is the only lever, so a
combo's natural duration is never fragmented to fit (a 30-minute combo at a
30-minute budget yields exactly one round; a 60-minute budget yields two, not two
compressed 15-minute halves). Pose selection passes an empty `emphasize` into
`pick()` — Yoga stays muscle-agnostic by design — while `avoid` (including
targeting overriding severe fatigue, ADR-0102 §override below) still fully
applies, so an injury flag or explicit "avoid my shoulder" still shapes the flow.

### Stretch — `buildStretchFlow()`
No stage ordering at all. The pool is `movementPattern: 'stretch'` entries whose
`progression` is `'hold'` (static) or `'reps'` (dynamic) — excluding `'time'`-
progression entries, which are dynamic movement-prep drills (jogging in place,
arm circles) closer to Warmup's territory than deliberate stretch work — plus
individual `movementPattern: 'yoga_flow'` poses that primary-match a targeted
area, used standalone rather than as part of a sequence.

Selection picks roughly **one exercise per targeted area** (`targeting.emphasize`)
via `pick()`; with nothing targeted, a small fixed default (3) rather than a long
rotating list. Each pick is prescribed by its own `progression`:
- `'hold'` → 1-2 sets, each clamped to `MOBILITY_HOLD.stretch` (30-60s) — never
  compressed below that to fit a time budget.
- `'reps'` → a single set of 10-15 reps, no `durationSec` at all.

Session duration is an **output** of these correct prescriptions, not an input
the algorithm force-fits — unlike Yoga (and Warmup/Cooldown), Stretch's block is
not run through `fitDurationToBudget()`, since that fitter's 20s discretionary-
hold floor would undercut the clinical 30s static-stretch minimum.

### Targeting overriding severe fatigue (shared with the Main block, ADR-0102/0106)
While redesigning this, a related gap surfaced: `targeting.emphasize` already won
over moderate/high fatigue (de-load, not exclude) but had no power over *severe*
fatigue — it was hard-excluded identically to an injury flag. `AvoidanceModel.hard`
is now split into `hardSafety` (injury/pain-based — severe today-flags, `'avoid'`
constraints, `targeting.avoid` — permanently absolute, matching CLAUDE.md's safety
mandate) and `hardFatigue` (severe accumulated fatigue — overridable by explicit
`emphasize`, at a heavier de-load than the normal tier). This is what lets Stretch
build "loosen up my hamstrings" even when hamstrings read as severely fatigued —
arguably more appropriate for stretching than for lifting, and consistent either
way. Max-day calibration (`isMaxDayReady`) is deliberately **not** extended by this
override — testing a new max on a hard-excluded muscle stays blocked regardless of
targeting.

## Consequences
- `buildOrderedFlow`, `flowCountFor`, and `fitHold` (v1) are removed — replaced by
  `buildYogaFlow`/`buildStretchFlow`. `STRETCH_STAGE_ORDER` is removed; Yoga keeps
  `YOGA_STAGE_ORDER`.
- Warmup/Cooldown's repeated-circuit mechanism (`planRepeatedMobility`) is
  unchanged — it still derives hold length from its time budget, which is
  appropriate for a brief warm-up/cool-down circuit but was the wrong model for
  Yoga's natural-sequence-time and Stretch's clinical-hold-time needs.
- The `WorkoutOptions.flow.focus` field (redundant with `targeting.emphasize`,
  which already carried the same value end-to-end) was removed as part of this
  change.
- Reversible: both builders are pure functions returning `PlannedExercise[]`
  behind the same `SessionPlan`/`SessionBlock` contract — a future revision can
  swap either independently without touching the other or the UI.

## v3 (2026-07-28) — two real-usage bugs, both from v2's design
Real sessions surfaced two problems with v2's specifics (the mechanisms above
stand; only the details below changed):

### Yoga: bookends broke the "every pose is one hold" invariant
v2 kept the opening/closing poses at a fixed 1 set while the middle combo
repeated for `rounds` — pedagogically reasonable (a real class opens/closes
once) but it meant the tracker showed a mismatched set count on the very
first and last exercise ("why does everything else have 2 sets and this only
has 1?"), reported as a bug. Fixed: `buildYogaFlow` now picks one pose per
stage across the **full** `YOGA_STAGE_ORDER` as a single sequence and repeats
the **whole sequence together** for the same whole-round count — no more
special-cased bookends. The natural-time-rounds math (never fragment a
sequence to fit) is unchanged, just applied uniformly.

### Stretch: the rotation never actually filled the requested time
v2 picked one exercise per targeted area and gave it 1-2 sets at a fixed
~45s hold — for a typical 1-2 target areas, that's 1-3 minutes of real work
against a 20-minute request, landing nowhere close. Fixed, per direct
guidance ("specify the muscles targeted and tackle rotational sets around
each muscle... cap max exercises to 4 or 5 and just do rotations and longer
holds"): `buildStretchFlow` now treats "the muscles targeted" as the
rotation's membership (explicit `targeting.emphasize`, or a `DEFAULT_STRETCH_MUSCLES`
5-muscle full-body default when nothing is targeted — always a
muscle-driven rotation, never an arbitrary pick), capped at
`MAX_STRETCH_MUSCLES` (5), and **rotates the whole set for multiple whole
rounds** (capped at `MAX_STRETCH_ROUNDS`, 5) rather than holding once and
stopping. Rounds are solved first at the nominal ~45s hold; if that would
need more than 5 rounds to fill the budget, hold length extends instead
(still clamped to the clinically safe 30-60s band) so a handful of rounds at
a slightly longer hold covers the same time — "rotations and longer holds,"
in that priority order. A 20-minute default-rotation request now lands
around 17 minutes (was ~3).

Both fixes are pure refinements of the v2 mechanisms (natural-time rounds,
clinically-bounded holds, muscle-agnostic Yoga, targeted Stretch) — no part
of the v2 Decision section above was reversed, only tuned against real usage.
