# ADR-0122 — Load finalization (fatigue, feel, max-out)

- **Status:** Accepted (v1)
- **Date:** 2026-07-24
- **Phase:** 1 (engine revamp)

## Context
Progressive overload (ADR-0103) picked a working load from the last session's
performance and clamped it to the hard +10% cap — but nothing then adjusted that
load for **today**. Readiness only scaled *reps* (a binary 0.8/1.0), per-muscle
fatigue only dropped a set + RPE and acted as a selection tiebreaker, and e1RM /
"maxing out" was display-only. A good trainer eases the *weight* when the athlete
is beat up, under-recovered, or just maxed that muscle. The user asked for exactly
this: fatigue, how they feel, and recent maxing should move the load.

Grounding: `docs/methodology/strength-set-design.md` §6.

## Decision — a finalization pass (`load-finalization.ts`, pure)
`finalizeLoad({ baseWeightKg, exercise, readiness, fatigue, history, now })` runs
**after** `recommendLoad` and **before** owned-weight snapping. It multiplies the
base by three factors, each **≤ 1** — so it can only reduce or hold, never breach
the cap upstream:

| Factor | Signal | Range |
|---|---|---|
| `readinessFactor` | graded sleep/energy/soreness | 1.0 → 0.90 |
| `fatigueFactor` | peak fatigue across the exercise's primary muscles (0.35 / 0.5 / 0.7 bands) | 1.0 → 0.90 |
| `maxTaxFactor` | a primary muscle maxed within 4 days (fatigue `lastWorkoutWasMax`, or a completed calibration set in history) | 1.0 → 0.92 |

`final = round½(base × readiness × fatigue × maxTax)`. Readiness **never raises**
load — a good day is earned through performance, not a self-report.

### Wiring & logging
- Called in the strength Main path; the finalized target is then snapped to owned
  weights (so snapping still can't round up past a cap).
- The per-exercise `note` explains *why* the load moved
  ("eased 15% to 36 kg — how you feel today + quads fatigue").
- A structured driver line (`readiness×… fatigue×… maxTax×…`) is pushed into
  `plan.adjustments`, which the decision log persists (`output.adjustments`), plus
  `fatigueByGroup` is added to the service-layer drivers (CLAUDE.md §7).

## Consequences
- The same earned base load now yields a lighter prescription on a fatigued /
  poor-readiness / post-max day, with an auditable reason — complementing the
  existing set/RPE de-load (volume) with a load reduction.
- Worst realistic case (poor readiness + high fatigue) is ~−19%; a fresh day holds
  exactly the earned load.
- The `note`/`recommended`→`target` wording changed (the snapped value is now the
  finalized target); tests updated accordingly.

## Safety
Absolute and unchanged: `recommendLoad`'s +10% cap and deload triggers
(ADR-0103) remain the sole authority. Finalization is reduction-only within that
envelope; it cannot raise load or override a deload.

## Addendum (ADR-0107 v2)
`readinessFactor`'s per-signal banding described above was extracted into a
shared `readiness.ts` helper, reused by the volume/reps axis (ADR-0107). The
numbers and behavior here are unchanged — only the implementation's location.
