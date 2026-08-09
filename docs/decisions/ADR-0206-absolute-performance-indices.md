# ADR-0206 — Absolute strength/endurance performance indices

- **Status:** Accepted (v1)
- **Date:** 2026-07-30
- **Phase:** 2

## Context

ADR-0205 added "Overall Strength"/"Overall Endurance" headline numbers, but
deliberately kept them self-relative (% of your own personal best) to stay
inside ADR-0202's "no fabricated score" constraint. After using it, the user
wanted something different: an *absolute* headline — "you're at 40% of a
maximum strength index" — framed as progress toward a fixed goal, not a
comparison against your own history. They specified the inputs directly:
performance across muscle groups (legs/arms/chest) for strength, and
duration + intensity for endurance.

An absolute number needs a real ceiling to divide by. Two honest sources are
possible: a user-typed goal (e.g. "I want to squat 150kg"), or a recognized
external standard. The user's framing ("legs/arms/chest... how they're
doing," "duration and intensity") pointed at the second: a performance score
built from actual training signals against a fixed target, not a number the
user has to type in themselves.

## Decision

Two new absolute indices, kept **alongside** (not replacing) the existing
self-relative ones from ADR-0202/0205 — "am I near my own best" and "am I
training at a level that matches a recognized target" are different
questions, and the user confirmed both should stay.

**Strength Index** (`overallStrengthPerformanceIndex`,
`movementCategoryPerformanceIndex` in `src/domain/metrics/strength.ts`) —
this ISO week's completed sets per muscle group, as a % of **MRV** (Maximum
Recoverable Volume = 20 sets/week), the volume-landmark ceiling ADR-0104
already established and the app already uses elsewhere (the "Weekly volume"
card). Muscle groups roll up into Push/Pull/Legs/Core (a new
muscle-group-axis mapping, `MOVEMENT_CATEGORY_MUSCLE_GROUPS` — distinct from
but conceptually aligned with ADR-0205's exercise-`movementPattern`-axis
mapping), then average to one overall %.

**Endurance Index** (`overallEndurancePerformanceIndex`,
`weeklyCardioMinutesByCategory` in `src/domain/metrics/endurance.ts`) — this
week's cardio minutes, steady-state counted as "moderate" and interval/HIIT
counted as "vigorous" at 2× weight (the standard moderate/vigorous
equivalency convention), as a % of the **WHO/ACSM public-health activity
guideline**: 150 minutes/week moderate-intensity, or an equivalent
combination with vigorous work. One blended percentage, not a
Steady/Interval breakdown — the guideline itself is framed as "moderate OR
vigorous OR a combination," so an independent per-category score would
misrepresent it.

Both percentages are **always defined**, including 0% for a user with no
history — unlike the self-relative indices, which show "not enough data"
until 2+ sessions exist. This is deliberate: 0% is a real, correct answer to
"are you training at a level that matches this target," not a fabricated
placeholder. The UI still gates on *some* history existing before showing
numbers at all, matching the rest of the screen's empty-state pattern.

## Consequences

- Both ceilings (MRV, WHO/ACSM 150 min) are pre-existing, citable standards
  — MRV was already adopted and documented in ADR-0104; the WHO/ACSM
  guideline is a widely-used public-health reference, not something invented
  for this feature. Neither is a new weighting/regression model, so this
  stays inside CLAUDE.md §2's "rules, not a fabricated score."
- No new instrumentation — both reuse data the tracker already captures
  (`weeklyVolumeByGroup`, `durationSec` on cardio sets).
- These are weekly snapshots (ISO week, no rolling average), matching the
  existing "Weekly volume" card's behavior — simple and consistent, at the
  cost of being noisier week-to-week than a longer rolling window would be.
  If that proves too noisy in practice, a rolling-average variant is a
  contained follow-up (new function, same UI slot).
- The moderate/vigorous 2× equivalency and the steady→moderate,
  interval→vigorous mapping are reasonable, standard approximations, not a
  precise physiological measurement — same caveat class as the Epley e1RM
  formula in ADR-0202 (a well-understood estimate, not a lab figure).
- The Progress screen now shows, per metric, three distinct levels: an
  absolute headline (this ADR), a self-relative headline (ADR-0205), and raw
  numbers (e1RM / minutes, ADR-0202/0203). The UI makes this explicit via
  card titles ("Strength Index" vs. "Strength vs. Personal Best") so the two
  headline cards don't read as unexplained duplicates.
