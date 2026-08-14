# ADR-0137 — Routines

- **Status:** Accepted (v1)
- **Date:** 2026-08-10
- **Phase:** 1

## Context

Every session was generated fresh — there was no way to say "run my Tuesday
push routine" or "same as my usual leg day." The two closest existing
concepts, `ScheduledWorkout` and `RollingPlan`, both deliberately store
day-level *style/intent* ("bodybuilding, 30 min") with no exercise list —
"the exact session is regenerated on the day." Nothing in the codebase stored
a reusable, named, exercise-level template.

The hard constraint, from CLAUDE.md §1/§2: the workout must be genuinely
adaptive and never blindly repeat load/volume. A routine cannot become a
static, replayed plan — it has to keep going through the same safety and
progression logic every other session does.

## Options considered

- **A separate code path that materializes a `SessionPlan` directly from a
  stored exercise list**, bypassing `RulesEngine.generateSession()`. Rejected:
  the engine's safety/progression logic (fatigue de-load, weekly volume
  ceiling, load finalization, warmup/cooldown selection) lives inline inside
  `generateSession()`, not as reusable standalone functions. A parallel path
  would have to duplicate all of it, or risk a routine session that skips
  safety checks a generated one always gets.
- **A new optional `SessionContext.routine` field**, consulted only where
  Main-block exercise selection already happens. The routine fixes *which*
  exercises Main draws from; every downstream step (load, sets, zone,
  de-loads, volume ceiling, warmup/cooldown) runs completely unchanged. This
  is the same shape as the existing `favoriteExerciseIds` input — an
  additional selection input, not a new pipeline.
- **Recurrence materialized into `scheduledWorkouts` ahead of time** (a
  background job writing future days). Rejected in favor of a render-time
  overlay — recurrence lives on the routine (`recurrenceDaysOfWeek`) and the
  weekly-plan view computes "does a routine's recurrence match this day"
  fresh each render, exactly mirroring how `RollingPlan` is already a
  recomputed forecast rather than a stored schedule. Turning off a routine's
  recurrence just stops it appearing next render — nothing to clean up, no
  new background job.

## Decision

Add `Routine` as a new persisted entity (`routines` table, JSON-blob payload,
same list-table shape as `equipment_profiles` from ADR-0135 — no
active-pointer table needed, since a routine is picked per-session rather
than globally active).

`SessionContext` gains one optional field: `routine?: { id, name,
exerciseIds }`. When set, the Main-block branch in `generateSession()`
restricts its candidate pool to `available.filter(e => routine.exerciseIds
.includes(e.id))` instead of the full goal-weighted catalog, sets its target
count to that pool's size, and skips the emphasis-quota-backfill and
"pull more from outside the pool" steps that don't apply to a fixed list.
Everything else — `pick()`'s existing hard-safety/fatigue exclusion and
substitution-within-pool logic, zone assignment, load finalization, the
per-session volume ceiling, warmup/cooldown selection, superset pairing,
duration-budget trimming — runs unchanged on whatever the routine-restricted
pool produces.

An unsafe-today routine exercise is **skipped, not substituted** with a
different exercise. The athlete curated this list deliberately; reusing
`pick()`'s pool-restricted "no safe substitute → skip" fallback means a
flagged exercise is dropped with a rationale note rather than silently
swapped for something the athlete didn't choose. A missing-equipment
exercise is filtered out before selection the same way normal generation
already filters `available` — also silent, summarized as one adjustment
note.

`SessionPlan`/`SessionRecord` gain `routineId?: string`, denormalized at
generation/start exactly like `workoutType` already is — this is what lets
history be filtered to "sessions run from this routine" for progress views,
with no new fatigue/volume accounting: `deriveFatigueFromHistory` and the
volume metrics already work from `SessionRecord.performed`, regardless of
where the session's exercise list came from.

Routine-level progress reuses existing pure metric functions
(`domain/metrics/`) against pre-filtered or full history rather than new
routine-specific computations: `weeklyTotalVolumeSeries(routineHistory)` for
the routine's own volume trend, and new thin wrappers
`routineStrengthIndex`/`routineEnduranceIndex` (generalizing the existing
`relativeStrengthIndexForExercises`/`relativeEnduranceIndexForExercises`
cores to an arbitrary exercise-id list) for a self-relative "% of your own
best" index. Per-exercise "potential max" reuses `exerciseBestStats` against
full history — deliberately **not** routine-scoped, since a PR set outside
the routine still represents the athlete's real capability on that lift.

Routine building lives in Explore (a third tab alongside Discover/Saved), per
the existing "browse the catalog" home. "Have the system pick from my custom
routines" is a small pure scorer (`domain/engine/routine-selection.ts`)
ranking saved routines by today's equipment coverage, conflict with severe
avoidance flags, and recency of last use — the same kind of deterministic,
explainable heuristic the rest of the rules engine uses, not a new kind of
decision-making.

## Consequences

- Reversible: removing routines entirely means dropping the `routine` field
  and its two call sites in `generateSession()`'s Main-block branch — nothing
  else in the pipeline depends on it existing.
- A routine is scoped to the Main block only; Warmup/Conditioning/Cool down
  stay engine-selected. A routine is assumed single-modality in practice — if
  its exercises are mixed, the engine picks whichever modality is more common
  among them for Main and the rest are excluded from selection. Multi-block,
  user-authored full sessions are a possible future layer, not built now.
- A routine selected together with `workoutType: 'stretch' | 'yoga'` has no
  effect — those styles replace Main entirely with a single flow block
  (ADR-0114), which never consults `routine`. The routine builder doesn't
  offer those styles as a routine's default to avoid implying otherwise.
- No new decision-log `EngineCall` variant was added — a routine-driven
  generation is still a `generateSession` call; `services/programming.ts`
  appends `routine:<id>` to the existing `reasonCodes` driver, matching how
  every other structured input is logged.

## v2 (2026-08-11) — workoutType as the routine's topline field; Stretch/Yoga honor it

v1 treated `workoutType` as an optional "default style" applied after the
exercise list was built, with no effect on which exercises could go in, and
the builder hid `stretch`/`yoga` from the style picker entirely because those
two styles bypass Main (and therefore `input.routine`) completely — the
"has no effect" Consequences bullet above. Real usage (a user building
mixed-modality routines) plus a direct ask — "the topline of a routine should
be the workout type which defines the exercises allowed" — surfaced that this
should be inverted: style first, exercises constrained by it, matching how
`workoutType` already constrains the engine's own candidate pool during
normal (non-routine) generation.

**`exercisesAllowedForWorkoutType(exercises, workoutType)`**
(`src/domain/engine/workout-type-catalog.ts`) is a new pure function, one
`switch` case per style, each a direct mirror of the equivalent inline pool
filter `generateSession()` already applies: `bodyweight` → equipment
no/bench-only; `cardio` → `modality === 'cardio'`; `stretch` → stretch
holds/reps plus yoga poses; `yoga` → `movementPattern === 'yoga_flow'`;
`bodybuilding`/`sculpting`/Balanced → unrestricted, since the engine doesn't
restrict Main's pool by modality for these either (a mixed-modality routine
already routes mobility → Warmup/Cool down and cardio → Conditioning). One
rule, two call sites: the routine builder (what's legal to add, and what gets
stripped with an inline notice if an existing exercise stops being legal
after a style change) and the engine (below).

**Stretch/Yoga now consult `input.routine`** — superseding the old "has no
effect" bullet. Yoga's stage-ordered pick (`buildYogaFlow`) is unchanged; its
candidate pool is simply restricted to the routine's poses first, so a
smaller pool naturally yields a routine-scoped sequence (any stage the
routine has no pose for is skipped, same as an ordinary sparse pool today).
Stretch's normal mechanism — one exercise per *targeted muscle group* — can't
guarantee every routine exercise survives (two routine stretches targeting
the same muscle would only ever yield one pick), so `buildStretchFlow` gained
an optional `routineExerciseIds` parameter: when set, the routine's own
ordered list becomes the rotation's membership directly, skipping an
unsafe-today entry rather than substituting one outside the athlete's list
(the same skip-not-substitute rule the Main block already follows), and the
variety-backfill step that would otherwise reach for a *non-routine* stretch
under a tight time cap is disabled. Both branches now also set `routineId`
and prefix the rationale with `Following your "<name>" routine.`, matching
the strength/cardio path.

### Extensibility

More `WorkoutType`s (HIIT, Aerobic, Barre, ...) are expected later. This
design has two extension points, neither requiring a change to `Routine`,
`SessionContext`, or `ProgrammingEngine`:

1. **A type that only restricts Main's pool** (e.g. Aerobic as another
   cardio-shaped case, Barre as another equipment-shaped case) — one new
   `case` in `exercisesAllowedForWorkoutType`, plus a line in the
   `mainModality` derivation if it should force a modality the way `cardio`
   does today.
2. **A type that needs its own session shape** (HIIT's work/rest interval
   timing is a different block structure, not a restricted Main pool, much
   like Stretch/Yoga) — copy this ADR's template: restrict the candidate pool
   to `input.routine.exerciseIds` when set, thread it into a dedicated
   builder that skips-not-substitutes an unsafe routine pick, set `routineId`
   and prefix the rationale on return.

`exercisesAllowedForWorkoutType`'s `default` arm (no restriction) is what any
new, not-yet-cased `WorkoutType` falls into automatically — adding the union
member is never a breaking or silently-wrong step on its own.
