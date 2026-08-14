# ADR-0142 — Weekly rolling-plan promotion, routine awareness, and daily handoff

- **Status:** Accepted (v1)
- **Date:** 2026-08-14
- **Phase:** 1

## Context

Three uncoordinated "weekly" concepts existed, and none of them actually
informed daily generation:

1. **`weekly-program.ts`'s `buildWeeklyProgram`** recomputed a hypothetical
   6-week schedule from scratch on *every* `generateSession` call, but only
   `.today.anchorExerciseIds` was ever read anywhere (`rules-engine.ts`, a
   minor selection tiebreak) — `.movementSlots`, `.priorityMuscles`,
   `.targetSetRange`, and the full `sessions[]` array were computed and
   discarded. Worse: its "today" selection came from its OWN independently
   re-derived schedule, which could (and did) disagree with the modality
   `generateSession` actually decided to train.
2. **`rolling-plan.ts`'s `buildRollingPlan`** was the real, good day-level
   forecast — already fatigue-aware (projecting `deriveFatigueFromHistory`'s
   decay curve forward, cumulatively across the forecast itself), already
   cadence-aware, already persisted and rendered as the "Weekly Plan" UI
   card. But `generateSession` never read it — today's actual modality was
   decided fresh, live, from goal weights alone, with no memory of what the
   forecast had already said about today.
3. **`AthleteProfile.scheduledWorkouts` / `Routine.recurrenceDaysOfWeek`**
   were reconciled with the forecast only at UI-render time
   (`app/index.tsx`'s `weekPlan` memo) — the forecast itself had no idea a
   future day might already be fixed by a routine, so it could propose a
   redundant or conflicting modality for that date, and its own fatigue-
   projection/format-variety intelligence had no way to account for what
   that day would actually be.

## Options considered

- **Keep both `weekly-program.ts` and `rolling-plan.ts`.** Rejected — the
  redundancy and the today-selection disagreement (§1 above) are real
  correctness problems, not just untidiness.
- **Build a new, third `WeeklyEngine` module/interface from scratch.**
  Rejected — CLAUDE.md §5 is explicit that `ProgrammingEngine` is the one
  reversibility anchor; a second formal engine interface is unneeded
  ceremony when `rolling-plan.ts` already has the fatigue-projection,
  cadence-awareness, persistence, and test coverage a new module would have
  to rebuild from zero.
- **Promote `rolling-plan.ts` (chosen).** Retire `weekly-program.ts` except
  its one genuinely-used piece (the stable-anchor concept); make
  `rolling-plan.ts`'s output a real input to `generateSession`.

## Decision

**`rolling-plan.ts` is now the weekly programming layer**, in both of its
existing roles at once: the UI-facing forecast, and the daily engine's real
weekly input.

- **`SessionContext.weeklyPlan?: { modality?, cardioIntent? }`** (new,
  optional, additive) carries today's forecast entry into `generateSession`.
  It is a **default, never a mandate** — resolved strictly behind explicit
  `workoutType` and `input.routine`, both of which still short-circuit
  entirely, exactly mirroring the existing `ADR-0105 v2` `weeklyTargets`
  cadence-override precedent (an override-able bias, never forced). Absent
  `weeklyPlan` (every pre-existing caller) is byte-identical to today's exact
  naive-weight-based behavior.
- **`RollingPlanDay.cardioIntent?: CardioIntent`** — the forecast now
  proposes a cardio *format*, not just a modality. A new `cardioIntentFor()`
  varies format across the week and specifically never repeats `'interval'`
  on consecutive cardio days (tracked as "the last cardio day seen so far,"
  independent of rest/other-modality days in between — a deliberate
  simplification, not a full recovery-gap model).
- **Stable anchors, extracted, not rebuilt from a hypothetical week.**
  `weekly-program.ts:76-81`'s anchor computation moved to a new
  `anchors.ts` as `stableAnchorExerciseIds(context, modality, movementSlots)`
  — called directly with `generateSession`'s *actual* `mainModality` and this
  ISO week's real completed-session count, fixing the today-selection
  disagreement from §1. `anchors.ts` (not `rolling-plan.ts`) is where this
  lives specifically because it needs the catalog (`EXERCISES`) —
  `rolling-plan.ts` stays catalog-free (ADR-0003's leaf-module convention,
  matching `timing.ts`'s "callers pass the resolved value" pattern); the
  purely-structural `slotsFor`/`STRENGTH_SLOTS` moved there with it, while
  `modalitySchedule` (which `rolling-plan.ts` itself actually calls) moved
  into `rolling-plan.ts`.
- **Routine awareness — the gap closed after being flagged mid-design.**
  `buildRollingPlan` gained an optional `fixedDays?: FixedForecastDay[]`
  parameter (`{ date, modality, priorityMuscles? }`). A day already fixed by
  an explicit `scheduledWorkouts` entry or a recurring `Routine` is resolved
  by the new `resolveFixedForecastDays()` in `services/rolling-plan.ts`
  (services may touch the catalog to find a routine's dominant modality;
  `rolling-plan.ts` may not) and passed straight through. A fixed day: never
  gets an algorithmic slot spent on it; still projects its fatigue
  contribution forward exactly like a proposed day would; and **counts
  toward the athlete's weekly session budget** rather than stacking an extra
  algorithmic session on top (`algorithmicSessions = effectiveSessions -
  fixedCount`) — without this, an athlete whose routines already covered
  their whole stated frequency would still get algorithmic days piled on.
  Deliberately conservative: a fixed day's *exact* cardio format isn't
  resolved (this module stays exercise-free by design), so the format
  rotation resets to `'basic'` after one rather than guessing through an
  unknown.
- **v2 — weight-only modality apportionment is now proportional, not a flat
  round-robin.** Found while writing goal-adherence tests: when no explicit
  `weeklyTargets` are set, `modalitySchedule`'s fallback previously cycled
  evenly through every modality with nonzero weight — a goal weighted 60%
  cardio produced the *same session count* as one weighted 10%, just ordered
  first. Replaced with largest-remainder apportionment, so the week's
  distribution actually tracks the stated weights. This is squarely a "does
  the week serve the stated goal" fix, not a side effect.
- **`app/index.tsx`** threads `weeklyPlan` (today's forecast entry, mapped
  down to `{modality, cardioIntent}`) into `runBuild()`'s `generateSession`
  call, and passes its already-loaded `routines`/`scheduledWorkouts` into
  `ensureRollingPlanFresh`.
- **v3 — the forecast now surfaces systemic deload risk, not just a same-day
  volume cut.** `systemic-load.ts`'s `systemicState()` (rising Foster-load
  trend, consecutive training days, rough check-ins — ADR-0126) was already
  computed fresh inside `generateSession` to shrink `volumeScale`, but
  `rolling-plan.ts` never read it, so the "Weekly Plan" UI card had zero
  visibility into an upcoming back-off until it landed as a quiet per-session
  reduction. `buildRollingPlan` gained a 4th, additive, optional `systemic?:
  SystemicState` parameter (type-only import, preserving the module's
  catalog-free purity — ADR-0003), surfaced on the returned plan as
  `deloadRecommended`/`deloadNote`. `services/rolling-plan.ts` computes
  `systemicState()` once per `refreshRollingPlan` call (the same two trigger
  conditions gate it, so this is not a per-render cost) and passes it
  through; `app/index.tsx` shows an "Easing off this week" flag on the
  Weekly Plan card when set. **Deliberately a snapshot, not a forecast**:
  `deloadRecommended` reflects TODAY's backward-looking systemic state,
  identical regardless of horizon length (tested explicitly) — it does not
  project systemic load forward across future weeks. Projecting it forward
  would be the block/mesocycle periodization `ADR-0133` and
  `docs/methodology/programming-engine.md` explicitly scope out; this change
  stays inside that boundary by only surfacing an already-computed,
  currently-true signal one interaction earlier than before.
- **v4 — the "owed" missed-day catch-up now biases toward the modality that
  was actually missed, weighted by its goal weight.** Previously, catch-up
  sessions (`owed`, capped at +2) added to the week's total count but the
  modality mix was re-derived through the same proportional
  `modalitySchedule()` split — a missed cardio session and a missed strength
  session were caught up identically regardless of which goal the athlete
  actually cares more about. Product guidance behind this change, recorded
  verbatim because the judgment call is non-obvious: *"I actually think the
  missed day may not be the highest priority for the person's goals. So I
  wouldn't over-anchor on the missed day but I wouldn't ignore it either. We
  should weight it accordingly depending on the goal. If it is a key point
  of the goal then it should be prioritized higher."* Implementation:
  `domain/metrics/volume.ts`'s private `dominantModalityOf` (session →
  catalog modality) was exported and generalized into
  `sessionCountsByModalitySince(history, since, until)`, an explicit-window
  version of the existing ISO-week-only `weeklySessionCountsByModality`
  (which now wraps it, unchanged behavior) — the rolling planner's trailing
  window isn't expressible as an ISO-week offset. `buildRollingPlan` gained
  a 5th, additive, optional `recentModalityCounts?: Partial<Record<Modality,
  number>>` parameter; new pure helpers `deficitByModality` (what a normal
  week would have contained, minus what was actually done) and
  `owedCatchUpBias` (largest-remainder allocation of the owed slots across
  deficited modalities, weighted by `goals.weights`, each modality capped at
  its own real deficit) layer the bias on top of the unchanged baseline
  apportionment — never replacing it. The per-modality cap is the literal
  implementation of "don't over-anchor": a modality's weight can pull it
  more of the owed slots, but never more than it actually fell short by; a
  low- or zero-weight modality with a real deficit still gets a slot instead
  of being crowded out entirely, which is the literal implementation of
  "wouldn't ignore it either." `services/rolling-plan.ts` computes
  `recentModalityCounts` via `sessionCountsByModalitySince` over the same
  trailing 7-day window `buildRollingPlan` itself already uses for `owed`.

## Consequences

| Before | After |
|---|---|
| `generateSession` never reads the forecast; today's modality is decided fresh from goal weights alone every call | Forecast is a real default; still overridable |
| `weekly-program.ts`'s "today" pick could disagree with the modality actually trained | `anchors.ts` uses the real `mainModality`, always in sync |
| A weight-only goal's session mix was an equal split across every modality | Proportional to the stated weights |
| Cardio format defaulted to `'basic'` every time, implicitly | Varies across the week; never two `'interval'` days adjacent |
| A routine's day was invisible to the forecast — could propose a conflicting day, and its own budget/fatigue math didn't know the routine day existed | Forecast skips it algorithmically, still tracks its fatigue, and it counts toward the weekly budget |
| Two parallel, partially-redundant "weekly" modules | One, doing both jobs it always should have |
| A proactive deload only ever showed up as a same-day volume cut, with no warning | `deloadRecommended`/`deloadNote` surfaced on the forecast itself (v3) |
| The real forecast horizon was hardcoded to 7 days everywhere it was called, despite the algorithm being tested at 14/28/56 days | Default horizon is 14 days; the Weekly Plan card shows the first 7 with a "Show next week" expansion |
| No history when `weeklyTargets` summed to zero defaulted every athlete to a flat 3 sessions/week | Defaults from a small table keyed by experience x dominant goal modality (`defaultWeeklyFrequencyFor`) |
| A missed day's catch-up sessions were re-derived through the plain proportional split — identical treatment regardless of which modality was actually missed | Biased toward the actually-missed modality, weighted by goal weight and capped at its real deficit (v4) |

**Found and explicitly out of scope**: while building the daily-integration
test for this change, an implicit (non-`'stretch'`/`'yoga'`) `mainModality`
of `'mobility'` was found to already hit a separate, pre-existing bug — the
generic Main-block pipeline hardcodes `pick(mainPool, 'strength', ...)`
regardless of `mainModality`, so a mobility-goal-dominant athlete's implicit
day silently builds a strength session. This reproduces with plain
`dominantMainModality` alone; `weeklyPlan` only exposed it via a new,
legitimate path, it did not create it. Flagged as a separate follow-up
(spawned task), not fixed here — the correct fix (routing implicit
mobility-dominant days through the existing `buildStretchFlow` path rather
than the strength-shaped pipeline) is a real, independent piece of work.
**Resolved: see ADR-0145.**

**Reversible**: `weeklyPlan`/`fixedDays` are additive optional
parameters — every existing caller (and this repo's full pre-existing test
suite) is byte-identical when they're omitted, confirmed by the complete
suite passing unchanged before any new tests were added.
