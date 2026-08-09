# ADR-0125 — Double progression, RPE-free progression signals, and the return-to-training ramp

- **Status:** Superseded in part by ADR-0129 (aggregate evidence/minimum increments); layoff ramp retained
- **Date:** 2026-08-04
- **Phase:** 1 (engine revamp)

## Context

A trainer-perspective review of the engine found that progressive overload —
CLAUDE.md §1's "single most important thing" — silently stopped working for a
large share of realistic usage. Four independent defects, all invisible in a
single session and only visible as "why has this not moved in two months?":

1. **Every lift under 25 kg was permanently stalled.** `recommendLoad`
   (`src/domain/engine/progression.ts`) capped any increase at
   `lastW × 1.10` (ADR-0103), then `snapToSensibleWeight` floored the result to
   the 2.5 kg grid. An increase therefore required `lastW + 2.5 ≤ lastW × 1.10`,
   i.e. **`lastW ≥ 25 kg`** (≈50 lb imperial). A 10 kg lateral raise got a cap of
   11 kg, which floored straight back to 10 kg — forever, with the note "the next
   2.5 kg step is above the safety cap." This hit lateral raises, curls, triceps
   work, rear delts, face pulls — most dumbbell accessory work, which is the bulk
   of the **bodybuilding** and **sculpting** session types.

2. **Progression never fired without a *distinct* RPE.** Both the increase and
   deload branches required `lastRpe != null`. The subtler problem: the tracker
   pre-fills each performed set's RPE from `targetRpe`
   (`services/sessions.ts`, `state/workout-store.ts`), and the per-exercise RPE
   prompt defaults to the target too. An athlete who taps through therefore logs
   `rpe === targetRpe` — precisely the value that means "hold". The data looked
   real, so nothing flagged it.

3. **Bodyweight and timed work never progressed at all.** `recommendLoad`
   returned `undefined` for `progression: 'reps'`; reps came from
   `rx.mainReps × volumeScale`, so an athlete who managed 25 push-ups at RPE 5
   was prescribed the same 10 next time. `coreSeconds: 30` was likewise fixed.
   For **bodyweight** — a first-class workout type in a home-workout app — the
   engine was not adaptive in any sense.

4. **Reps and load moved independently.** `strengthSets` set reps from the
   workout style (bodybuilding 10 / sculpting 13) scaled by readiness, while the
   weight came from a top set performed at *unknown, different* reps. Switching
   bodybuilding → sculpting kept the same load for three more reps.
   `epley1RM` already existed in `metrics/strength.ts`, unused for this.

Separately, the engine had **no concept of time away**: `lastTopSet` walks
history with no recency bound, and `listHistory(30)` is a row count, not a
window. Returning after six weeks off, the athlete was prescribed the exact load
they last lifted, at full volume. And CLAUDE.md §6 specifies a cap on *weekly*
load increase, but only a session-to-session cap was implemented — a lift
trained three times in a week could compound +10% three times.

References: ADR-0103 (overload + safety caps), ADR-0115 (owned weights),
ADR-0122 (load finalization), ADR-0107 (readiness scaling).

## Options considered

- **Loosen the percentage cap for light lifts.** Simple, fixes (1) alone.
  But it treats the symptom: the percentage cap is the wrong instrument for
  small absolute loads, and loosening it gives no principled stopping point —
  at 2.5 kg the smallest real step is a 100% jump.
- **Require RPE before progressing.** Fixes (2) by making the athlete answer
  honestly. Rejected: it puts the burden on the fatigued user (CLAUDE.md §9),
  and it still leaves (1), (3) and (4) untouched.
- **Double progression** — a rep *range*; reps climb at a fixed load, and the
  load only steps once the top of the range is genuinely earned, at which point
  reps reset to the bottom. This is what a trainer actually does, and it happens
  to resolve all four defects with one mechanism: light lifts progress by reps
  (1); "did you complete the prescribed reps?" is an RPE-free signal (2);
  unloaded work has a rep/hold axis to climb (3); and reps and load become one
  coordinated decision (4).

## Decision

Adopt **double progression** as the Main block's prescription model, in
`recommendPrescription` (`src/domain/engine/progression.ts`), superseding
`recommendLoad` for that path. Specifically:

- The rep band is centred on the session's existing rep target, so today's
  prescriptions are unchanged in aggregate — reps simply gain somewhere to climb.
  A first exposure is prescribed the band's **centre**, not its floor, so new
  exercises are not quietly made easier than before.
- **One minimum increment is always permitted when the top of the range has been
  earned**, even where that exceeds the +10% cap. The rep reset is what makes the
  step safe, not the percentage: 10 kg × 12 = 120 volume-load becomes
  12.5 kg × 8 = 100. This allowance is deliberately scoped to that branch and
  never loosens `recommendLoad`'s cap.
- **Prescribed values are frozen on the record.** `PerformedSet` gains
  `prescribedReps` / `prescribedRpe` / `prescribedDurationSec`, written at
  materialization. Without them the record cannot distinguish "confirmed on
  target" from "never touched". Records predating this fall back to the logged
  values and behave as before.
- **An RPE equal to the prescribed one carries no information** and is treated as
  *no* effort signal; the rep evidence decides instead.
- **e1RM reconciliation** applies when the rep band itself moves, with a
  tolerance (`EQUIPMENT_CAPPED_REP_HEADROOM`) so an equipment-capped rep climb is
  never mistaken for a style change.
- **Return-to-training ramp** (`src/domain/engine/layoff.ts`): gaps beyond
  `GRACE_DAYS` ease both load and volume, volume harder than load (connective
  tissue and work capacity fall off faster than strength), fading over the first
  two sessions back. Composed in `finalizeLoad` as a reductions-only driver,
  consistent with ADR-0122.
- **Weekly load ceiling** (`SAFETY.MAX_WEEKLY_LOAD_INCREASE_PCT`), measured
  against the previous ISO week's best *working* load, with the same
  minimum-increment floor so it cannot re-create the light-lift stall one level
  up.

## Consequences

**Easier.** Progression now works for the exercises most people actually do most
of: light dumbbell accessories, bodyweight movements, and timed holds.
Progression no longer depends on the athlete engaging with RPE at all. Rep and
load decisions are coherent rather than independent. The ramp makes returning
after time off safe by default rather than by luck.

**Harder / riskier.** Prescriptions now depend on `prescribedReps` being written
correctly at every point a record is materialized — there are three
(`startSessionRecord`, `applyPlanEdit`, `applySwap`), and a fourth would silently
degrade progression to the legacy path rather than failing loudly. The rep band
is currently derived from the existing rep target rather than from
`goals.weights`; that is a deliberate seam (see below), not the end state.

**Reversibility.** High. `recommendLoad` is untouched and still exercised by its
original 19 tests, so the load-only model remains available. The new fields on
`PerformedSet` are optional and additive; no migration is required (the profile
and records are JSON blobs — `data/schema.ts`). Reverting means pointing the Main
block back at `recommendLoad`.

**Known follow-up — resolved by ADR-0128, differently than proposed here.** This
ADR expected the rep range to come from `goals.weights` (strength 4–6 @ long rest,
hypertrophy 8–12, endurance 12–20 @ short rest). It cannot: `Modality.strength`'s
goal card reads "Build strength & muscle", so the taxonomy has no axis separating
maximal-force training from size training. ADR-0128 instead assigns a zone *per
exercise*, rotated per muscle group on a history-driven schedule, and the
`RepRange` seam built here is what it plugs into. The prediction that the rest
tiers would "respond for free" held exactly.
