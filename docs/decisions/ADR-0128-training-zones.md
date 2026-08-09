# ADR-0128 — Training zones: per-exercise strength / hypertrophy / endurance rotation

- **Status:** Superseded in part by ADR-0131 (automatic baseline/style bias); test mechanics retained
- **Date:** 2026-08-05
- **Phase:** 1 (engine revamp)

## Context

The engine could not prescribe strength work at all. The reachable rep space was
`{5–9, 8–12, 11–15}` and no combination of inputs produced 3–6 reps, which had
three consequences:

- `isHeavySet` (`timing.ts:54`) requires reps ≤6, or ≤8 at RPE ≥9. `mainRpe` was
  only ever 6 or 7, so the second branch was unreachable and the 165s
  `HEAVY_COMPOUND` rest tier was effectively dead code.
- **Rep range tracked session length, not intent.** 30 min → 8–12, 40 min →
  11–15. Asking for *more time* made the work lighter and higher-rep, and the
  only way to reach a strength rep range was to book a *short* session — exactly
  inverted.
- A strength-dominant and a general-fitness athlete received byte-identical
  prescriptions: `recommendWorkoutType` returns `undefined` for `'general'`, so
  both fell through to the same `rx.mainReps`.

**The root cause is that the goal taxonomy has no axis for this.**
`Modality.strength`'s own goal card reads "Build strength & muscle"
(`personalization.ts:16`) — deliberately both. So "derive the rep range from
`goals.weights`", which ADR-0125 recorded as the intended follow-up, cannot work:
the information is not there. Splitting the `Modality` union was rejected for the
reason ADR-0124 already documented — it is used as `Record<Modality, X>` keys
across ~8 sites plus the weight-blending arithmetic.

References: ADR-0103 (safety caps), ADR-0120 (session time model), ADR-0121
(superset rationale), ADR-0124 (Modality union constraints), ADR-0125 (double
progression, whose `RepRange` seam this fills), ADR-0126 (selection and ordering).

## Options considered

- **Add `strength` and `endurance` workout styles** beside Bodybuilding and
  Sculpting. Reuses a mechanism athletes already understand, and styles already
  carried rep semantics (10 vs 13). Rejected as **too coarse**: it forces a whole
  session into one rep zone, when the thing a trainer actually does is press
  heavy *and* chase reps on the accessory for the same muscle in the same hour.
- **A profile-level "training emphasis" field**, independent of style. Explicit,
  but creates two knobs controlling the same thing — style and emphasis would
  have to negotiate — and it is still session-wide.
- **Per-exercise zones, rotated per muscle group on a history-driven schedule.**
  Lets one session hold both kinds of work, and turns "when did we last go heavy
  on this muscle?" into the actual scheduling question.

## Decision

**`TrainingZone = 'strength' | 'hypertrophy' | 'endurance'`**, assigned per
exercise per session (`src/domain/engine/training-zone.ts`). `ZONE_SPEC` owns the
rep band and working RPE: strength 4–6 @ 8, hypertrophy 8–12 @ 7, endurance
15–20 @ 7. Hypertrophy is the baseline — most training is, and should look like,
unremarkable work.

**Cadence is derived, and its unit is exposures, not days.** A fixed "every 14
days" is wrong for both a 6×/week advanced lifter and a once-a-week intermediate.
"Test this group every N times you train it" tracks adaptation directly and makes
training frequency fall out for free rather than needing a term of its own.
Base counts are per experience — beginners never test; **advanced athletes test
*less* often, not more**, because their e1RM moves slowly and a genuine max costs
more to recover from. A `minDays` floor stops a high-frequency trainee being
tested every few days once exposures pile up; a `maxDays` ceiling stops a
once-a-week trainee waiting two months to accumulate them. Sessions under ~30 min
never test; 50 min or more may carry both a strength and an endurance test.

**Goals and style bias the schedule, not the reps.** The pairwise comparison is
`weights.strength` vs `weights.cardio`, with `general` and `mobility` neutral —
comparing the top goal against *all* the others dilutes the signal to nothing,
since a single dominant goal only reaches ≈0.38 of a normalized four-way split
and the difference against the rest is ≈−0.03. Style overlays on top:
bodybuilding leans strength, sculpting and bodyweight lean endurance (the latter
because loading heavily enough for a true 4–6 rep max often isn't possible),
and cardio/stretch/yoga disable strength testing outright.

**The clock runs per muscle group, with the exercise as tiebreak.** ADR-0126
deliberately rotates exercises, which pushes any single lift weeks into the past,
so a strictly per-exercise clock would leave every lift permanently "overdue" and
cluster tests on whichever one happened to resurface.

**Within-session cascade.** Once a group takes a test, other exercises hitting
that group move to lighter, higher-rep work and carry the existing de-load. This
is genuinely new: fatigue is derived from history, *before* the session, so the
engine had never accounted for damage it was about to inflict in the same workout.

**Tests generalize the max-day machinery** (`applyZoneTests`, replacing
`applyMaxDayRecommendation`). That code did the right thing already — ramp sets
then an AMRAP marked `isCalibration` — but was gated behind `athlete.maxDay`,
which **no screen ever sets**, so in practice it never fired. Scheduling now comes
from the zone rotation; the explicit config survives only as a tiebreak over
*which* lift is chosen. Tests are ordered first (`orderForSession`), and never
apply to timed work, where "as many reps as you can" is meaningless.

**Duration buys volume, never reps.** `prescriptionFor` no longer scales
`mainReps`. A session-level `MAX_SESSION_WORK_SETS` ceiling was added, since with
reps no longer inflating, a long budget would otherwise keep adding sets.

**The UI states the ask.** A red STRENGTH / blue ENDURANCE badge on the exercise
in both the workout overview and the detail, and an all-out set's reps render as
`5+` / `15+` — the floor from `ZONE_SPEC`, plus the instruction to beat it.

## Consequences

**Easier.** Strength work is reachable for the first time, and the heavy rest
tier and superset exclusion light up for free because both already keyed off reps.
Session length stops being a covert intensity lever. A muscle now gets developed
across zones over weeks rather than living permanently at 10 reps.

**Harder.** Testing is on by default where it previously never fired, so several
latent issues became live and had to be fixed as part of this change:

- **`recommendPrescription` had lost the calibration branch.** It picks the
  *heaviest* completed set, which on a test day is the ~110% attempt, and no
  branch treated it specially — so a max day's attempt would have become the next
  session's working load, and its RPE 9 would have read as "ground out, deload".
  Restored, and the conversion now discounts by the RPE gap between an all-out
  test and a working set: converting rep count alone is a no-op when the test
  reps equal the target reps.
- **`PerformedSet` had no `isWarmup`.** Ramp sets would have counted as full
  working sets in both `deriveFatigueFromHistory` and `weeklyVolumeByGroup`,
  inflating a tested muscle by ~2 sets — falsely pushing it toward MRV and
  suppressing the next session. The flag is now recorded and excluded from both.
- **Anything reading `sets[0]` broke.** `workout.tsx`'s effort prompt defaulted
  to the first set's RPE, which on a test day is a warm-up at RPE 3–4.

**Reversibility.** Moderate. `training-zone.ts` is pure and isolated; reverting
means pinning every exercise to `hypertrophy`, which restores the previous 8–12
behavior exactly. `prescribedZone`, `isWarmup`, and `PlannedExercise.zone` are
optional additive fields needing no migration (records are JSON blobs). The zone
tokens and `Badge` are additive design-system pieces.

**Supersedes** ADR-0125's follow-up note proposing that rep ranges come from
`goals.weights`. They come from the zone instead, for the reason above: the goal
taxonomy cannot express the distinction, and a session-level answer would have
been too coarse regardless.
