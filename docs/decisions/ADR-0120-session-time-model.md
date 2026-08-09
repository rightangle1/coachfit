# ADR-0120 — Session time model & set-block budgeting

- **Status:** Accepted (v3)
- **Date:** 2026-07-24 (v2: 2026-07-28, v3: 2026-07-29)
- **Phase:** 1 (engine revamp)

## Context
The engine was producing sessions no trainer would: ~12 exercises for a 60-minute
slot, many timed items crushed to a 15-second floor, and estimates that badly
overran in reality. Three root causes:

1. **Time was mis-accounted.** `estimateDurationSeconds` charged a flat **+30 s
   rest per set** and a fixed **75 s per rep-set** — a heavy squat (needs ~2.5-3
   min rest) and a 15 s calf raise cost nearly the same.
2. **Count scaled linearly with duration** (`durationScale = target/30`), reaching
   8-9 main lifts plus warmup/conditioning/cooldown ⇒ ~12 items.
3. **The budget fitter crushed timed holds to a 15 s floor and popped whole
   exercises** rather than reasoning in whole set-blocks ⇒ "a bunch of 15-second
   items."

Grounding: `docs/methodology/strength-set-design.md` §2-4.

## Decision

### A real time model (`src/domain/engine/timing.ts`, pure, ADR-0003)
A session's length is dominated by **rest**, and rest depends on the set's job:

| Set type | Rest |
|---|---|
| Heavy compound (≤6 reps, or ≤8 @ RPE ≥9) | 165 s |
| Hypertrophy compound (7-15 reps) | 90 s |
| Isolation / small-muscle | 50 s |
| Core / mobility hold | 25 s |
| Warmup ramp | 15 s |
| Cardio | 0 (intrinsic / recovery phase) |

- `mechanicOf(exercise)` derives compound vs. isolation from `movementPattern` +
  `primaryAreas` (an optional `Exercise.mechanic` override wins), so the whole
  catalog need not be hand-tagged.
- `transitionSecondsFor` adds one-time per-exercise setup (~30-45 s; barbell/rack
  most, bodyweight least).
- **Work seconds are rep-INDEPENDENT** for rep-based strength (`NOMINAL_REP_WORK_SEC`):
  a set's ~20-45 s of work is dwarfed by its rest, and the daily effort dial
  (reps/RPE) must never change scheduled length — that's the budget's job.
- `SUPERSET_REST_FACTOR` (0.55) lets a grouped set pay reduced shared rest, so a
  superset actually **buys time** in the estimate (used by ADR-0121).
- Rest classification is keyed on **rep range, not the RPE effort dial**, so
  `trainingIntent` (recovery/balanced/challenge) can't silently lengthen a session.

### `PlannedSet.restSec` becomes first-class
Every set (except the last of an exercise) carries its prescribed, load-aware rest.
It drives the estimate and the tracker's per-set rest timer; the prebrief surfaces
it in the set summary.

### Budget-first, set-block sizing
Exercise count is an **output of the time budget**, not a linear function of
minutes. Initial counts are a rough estimate (ceilings lowered: main ≤6,
bodybuilding ≤7); the balancer (`fitDurationToBudget`) does the final sizing using
the real estimate:

- **Over budget:** drop a work set from the fullest lift (down to **3**), then drop
  a whole Main exercise (down to **2**), then compress timed holds — the
  discretionary ones (conditioning bouts, flow holds) first toward a **20 s** floor,
  and only as a true last resort the **warmup/cool-down anchor blocks**, never below
  **45 s** so they stay visible (never rounding to "0 min"). Rep counts and weights
  are never touched here.
- **Under budget:** add work sets to Main lifts (up to **5**).

Result: a 60-minute lifting session is ~5-7 lifts of 3-5 sets with real rest, and
**no 15-second filler sets**.

## Consequences
- `estimatedDurationMin` is now honest (rest-aware) — absolute values changed, so
  tests assert relative/structural properties, not the old magic numbers.
- The effort lever (readiness/`trainingIntent`) changes reps/RPE only, never set
  count or session length (preserved invariant, now enforced by a rep-independent
  time model).
- Sets the stage for ADR-0121 (supersets that earn their time savings) and ADR-0122
  (load finalization).

## Safety
Unchanged and absolute: progression caps, deload triggers, and avoidance
hard-excludes (ADR-0103/0106) remain the sole authority. The balancer only moves
structure (sets/exercises/hold length), never load.

## v2 (2026-07-28) — a soft 4-set floor before dropping exercises
Real usage surfaced that "drop a work set down to 3" ran *before* "drop a whole
exercise" too readily: whenever the initial exercise-count estimate ran a
little high (e.g. 8 lifts for a 40-min advanced session), the over-budget loop
trimmed **every** lift down to the bare 3-set floor before it ever considered
dropping one — reported as "8 exercises of 3 sets each" when a trainer would
build "6 exercises of 4 sets." `SOFT_MIN_WORK_SETS` (4) is now the first-pass
floor: sets trim toward 4, then a whole exercise drops (down to `MIN_MAIN_EXERCISES`),
and only once exercise count is already at that floor does trimming continue
down to the true `MIN_WORK_SETS` (3) minimum. A 40-min advanced bodybuilding
session now lands around 4 exercises × 4 sets instead of 8 × 3.

## v3 (2026-07-29) — graded rest via per-exercise intensity (ADR-0123)
The heavy/hypertrophy/isolation rest tiers above were a binary split by
`mechanic` + rep range only — a light isolation move and a demanding one got
identical rest. `restSecondsFor` now multiplies the tier value by
`restIntensityFactor(exercise)` (`domain/engine/intensity.ts`), a graded
±15% factor derived from the exercise's `loadDemand` (ADR-0123). Bounded so
tiers never invert: `HYPERTROPHY_COMPOUND × 1.15` (103.5 s) stays below
`HEAVY_COMPOUND × 0.85` (140.25 s). Tier *selection* (still rep-range/RPE-
driven) is unchanged — this only adds an exercise-identity dimension on top,
preserving the "effort dial never silently changes scheduled length"
invariant. `mechanicOf` was extracted to its own leaf module
(`domain/engine/mechanic.ts`) so this module and `intensity.ts` can depend on
it without depending on each other; `timing.ts` re-exports it unchanged for
existing importers.
