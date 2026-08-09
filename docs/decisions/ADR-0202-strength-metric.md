# ADR-0202 — Strength metric

- **Status:** Accepted (v2)
- **Date:** 2026-07-22 (v2: 2026-07-24)
- **Phase:** 2

## Context
Need a way to show strength progress per exercise (and roll up to a body area)
from logged sets, without new instrumentation.

## Decision
**Estimated 1-rep max (e1RM) via the Epley formula:** `e1RM = weight × (1 + reps/30)`,
computed per completed weight-progression set; an exercise's e1RM for a session
is the max across its completed sets that session. Pure functions in
`src/domain/metrics/strength.ts`:
- `exerciseHistory(history, exerciseId)` → `{ date, e1rm }[]`, sorted ascending.
- `latestStrengthSnapshot(history)` → per exercise, `{ exerciseId, name, e1rm, date,
  previousE1rm? }` (previous = the entry before the latest, for a simple trend).
- Body-area rollup: for a `MuscleGroup`, take the **latest** e1RM across all
  exercises whose `primaryAreas` include it (a rough "how strong are you at
  training this area right now" signal, not a single canonical number).

Display as **numbers + a trend delta** (e.g. "+2.5 kg since last time"), not a
chart — advanced graphics is explicitly the lowest near-term priority
(CLAUDE.md). A simple proportional bar is fine; a charting library is not needed.

## Evidence base
`e1RM = weight × (1 + reps/30)` is Epley's formula (Epley B. "Poundage chart."
Boyd Epley Workout, 1985), one of the small set of estimated-1RM formulas in
routine use in strength & conditioning practice (alongside Brzycki, Lombardi,
etc.) — all are calibrated regression fits against measured true 1RMs, most
reliable in the ~1-10 rep range, and all degrade for higher-rep sets, which
is why the Consequences below flag reps > ~12 as unreliable rather than
treating this as a peculiarity of Epley specifically.

## Decision — v2 addendum (relative strength index + anchor lift)
v1's group rollup (`latestStrengthByGroup`) picked whichever exercise had the
*most recent* completed session touching a group and reported its raw e1RM.
That silently mixes absolute e1RM numbers across mechanically incompatible
lifts — e.g. a 100 kg barbell bench press one week and a 15 kg dumbbell fly
the next both get reported as "the chest number," so the trend isn't a trend
at all, just whatever lift happened to be logged most recently.

Replaced with `muscleGroupStrengthIndex(history, group)` (plus
`muscleGroupStrengthIndexHistory` for charting) in
`src/domain/metrics/strength.ts`, which reports two honest, non-fabricated
numbers instead of one composite score:

1. **Relative strength index (`indexPct`)** — for every exercise touching the
   group with ≥2 logged sessions, `latest e1RM ÷ that same exercise's own
   best-ever e1RM` (a self-relative 0–100% ratio — tracking % of personal best
   over time is an established strength-training practice). The group's index
   is the simple mean of these ratios. It is unit-less by construction, so it
   never conflates incompatible kg numbers across lifts, and it can never
   exceed 100% (an exercise's latest value can't beat the max that includes
   it). `previousIndexPct` is the same average one qualifying session back per
   exercise, computed against each exercise's running-best *as of that point*
   (not retroactively against today's eventual best), so it never quietly
   changes after the fact when a later PR lands.
2. **Anchor lift (`anchorExerciseId`/`anchorE1rm`/`anchorPreviousE1rm`)** — the
   exercise with the most completed sessions touching the group, so users who
   want a concrete kg number still get one, and it's coherent over time (same
   lift every time) instead of whichever lift was most recently performed.

Exercises with only one logged session contribute to anchor selection but
not to the index — a single session gives a trivial 100% ratio, which would
be uninformative rather than a real trend; excluding it is more honest than
displaying a number that can't yet mean anything.

This is deliberately **additive, not a new scoring model**: no weighting,
regression, or composite formula is introduced — just an honest reframing of
numbers the app already computes (`epley1RM`/`exerciseHistory`), so it stays
consistent with "rules, not a fabricated score" (CLAUDE.md §2).

## Consequences
- Reuses data already captured by the tracker — no new fields.
- Epley is a standard, well-understood estimate; reps > ~12 get noticeably less
  reliable, which is an accepted limitation of any e1RM formula, not unique to us.
- Bodyweight-only exercises (no weight) aren't covered by this metric — expected;
  they'd need a reps-based strength proxy later if it matters.
- v2: `latestStrengthByGroup` is removed (its only caller was the Progress
  screen); no other module depended on it (achievements' muscle-PR family
  reads `primaryAreas` off history directly, not this rollup).
- v2: the index can't be gamed by picking an easy new exercise — an exercise
  only counts once it has 2 logged sessions, and the anchor stays sticky to
  whichever lift has the most history, not the most recent.
