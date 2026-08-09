# ADR-0129 — Aggregate-work progression

- **Status:** Accepted
- **Date:** 2026-08-05
- **Phase:** 1

## Context

Progression used the most recent session's best completed set. That discarded
the prescribed set count and the rest of the rep distribution. It could deny
credit after an athlete completed the full prescription in fewer sets, or let a
single strong set outweigh a mostly incomplete session.

## Decision

Warm-ups and calibration sets are excluded. The engine computes prescribed and
performed work across every working set: weight × reps for loaded reps, reps for
unloaded work, weight × duration for loaded time, and duration for unloaded
time. `workCompletionRatio` is the primary signal. At comparable load,
`totalPerformedReps / prescribedWorkingSetCount` redistributes achievement over
the intended future structure.

`2 × 10` versus `20 + skipped` is 100% and earns a conservative `2 × 11` next
time. `3 × 10` versus only 20 total does not progress. `12/10/8` against
`3 × 10` does. Lower loads are prorated; pain/form can block load increase
without erasing achievement. Volume-load plateau alone never deloads. A minimum
load increment must be plausible from e1RM at the reset reps.

## Consequences

Progression follows productive work while retaining set distribution, quality,
effort, pain, and adherence as qualifying evidence. Records now freeze
`prescribedWeightKg` and may store set `quality`.

**Supersedes** ADR-0125 wherever it describes best-set evidence or an always-
permitted minimum increment.
