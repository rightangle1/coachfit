# ADR-0102 — Fatigue & recovery model

- **Status:** Accepted (v2 — explainable history-derived local fatigue)
- **Date:** 2026-07-21
- **Phase:** 1

## Context
A trainer schedules around recovery — they don't hammer a muscle group that's
still cooked. The engine must account for per-group fatigue when selecting and
dosing exercises (CLAUDE.md: "understands muscle groups trained and fatigue").

## Decision — v2
Derive and consume a per-group fatigue estimate carried in `SessionContext.fatigue`
(`byGroup`, 0 = fresh … 1 = maximally fatigued). Every completed set contributes
an effort- and work-scaled impulse to primary muscles (100%) and secondary muscles
(40%), then decays exponentially: 48-hour half-life normally and 60 hours for a
max-effort day. A max day is detected from RPE 9–10 unless the debrief overrides it.

- **Fatigued** (≥ 0.70) → treat that group like a hard avoidance:
  exclude exercises loading it as a primary (substitute within movement pattern,
  else skip). Note: "skipped for recovery (very high fatigue)".
- **Recovering** (≥ 0.35) → **de-load** exercises whose primary area is
  that group (fewer sets, lower RPE). Note: "de-loaded for recovery (high fatigue)".
- **Good** (below 0.35) → no restriction; use freshness as a selection tie-breaker.

Fatigue-driven adjustments are kept **distinct from user avoidance flags** so the
rationale explains *why* ("recovery" vs. "a flagged area").

The Today view presents this estimate as a tappable front/back body map, including
last-trained context and max-day status. It remains a training-planning estimate,
not an injury or medical measurement.

## Consequences
- The engine now respects recovery, not just equipment/avoidance — a real step
  toward "thinks like a trainer."
- Clean separation of concerns: fatigue and user avoidance both cause de-load/skip
  but through their own lists and notes.
- Reversible: swapping the provided estimate for a history-derived one changes only
  how `fatigue.byGroup` is populated, not the consumption logic.

## Addendum (ADR-0123)
`FATIGUE.SET_LOAD` is now scaled by a per-exercise intensity multiplier
(`intensityMultiplierFor`, `domain/engine/intensity.ts`) before being credited
to primary/secondary muscles — a burpee's set counts for more fatigue than a
shadow-boxing set; a bench press's for more than a fly. The decay curve,
thresholds, and max-day detection described above are unchanged; only the
per-set impulse feeding into them is now exercise-aware instead of flat.
Exercises with no catalog entry (synthetic/unknown ids) default to a neutral
`1.0` multiplier — identical to today's behavior.
