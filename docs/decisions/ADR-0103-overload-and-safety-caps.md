# ADR-0103 — Progressive overload & safety caps

- **Status:** Accepted (v2)
- **Date:** 2026-07-21 (v2: 2026-07-22)
- **Phase:** 1

## Context
CLAUDE.md's core promise: never blindly increase load. Progression must be earned
by performance and bounded by hard caps the engine can never exceed. This ADR
defines how load advances for weight-progression exercises from session history.

## Decision
For each weight-progression exercise, look up the athlete's most recent completed
top set of that exercise (`recommendLoad`, pure, from `history`):
- **No history** → no weight prescribed; user logs their working weight (honest).
- **Felt easy** (last RPE ≤ target − 1) → increase one small step
  (`DEFAULT_STEP_KG`, default 2.5 kg), **clamped** so the session-to-session jump
  never exceeds `MAX_SESSION_LOAD_INCREASE_PCT` (10%).
- **On target** (within ~1 RPE) → hold the same load.
- **Ground out** (last RPE ≥ target + 2) → **deload** by `DELOAD_PCT` (10%).

Hard caps are enforced as clamps in code, not suggestions:
- `MAX_SESSION_LOAD_INCREASE_PCT = 0.10` — absolute ceiling on any increase.
- Loads round to the nearest 0.5 kg (realistic increments).

Every recommendation carries a plain-language `note` ("+2.5 kg from last — felt
easy at RPE 6", "holding 24 kg", "deloaded 10% — RPE 9 last time") surfaced on the
`PlannedExercise` and captured in the decision log.

Deload *triggers* beyond single-session RPE (multi-session stalls, accumulated
fatigue) are refined alongside ADR-0102/0104; v1 covers the single-session case.

## Decision — v2 addendum (multi-session stall)
v1 only ever looked at the single most recent session's RPE. That leaves a
real gap: RPE can read "on target" for weeks while the realized load simply
isn't moving — a trainer would notice and intervene; v1 couldn't.

Added a **fourth, subordinate condition** to `recommendLoad`: when RPE alone
would otherwise **hold** (not a clear earned increase, not a clear grind-out
deload — the ambiguous middle case), check the exercise's realized weekly
volume-load trend (`weeklyLoadByExercise`, `src/domain/metrics/volume.ts`,
ADR-0104's shared weekly-aggregation module) for a **stall**: the last two
week-over-week transitions both flat-or-declining (needs 3+ weekly points;
fewer is insufficient evidence, not a stall — hold as before). A stall
escalates "hold" to a deload, reusing the existing `SAFETY.DELOAD_PCT` (10%)
magnitude — no new constant — with its own note distinguishing it from an
RPE-triggered deload.

This is deliberately **narrow and subordinate**: it only ever fires in the
ambiguous "holding steady" branch. It can never override an earned increase
(a real-time "felt easy" RPE reading is trusted at face value) and never
double-deloads an already-grinding-out case. It composes with the existing
hard cap rather than around it — the cap on any *increase* is completely
unaffected; this only ever adds a second reason to *reduce* load.

## Consequences
- Load only rises when earned, and never by more than the cap — the safety promise
  is enforced by code, not prompt or preference.
- Deterministic, offline, unit-testable with synthetic history.
- Bodyweight/time/hold progressions are governed by reps/duration templates
  (ADR-0104/0105) rather than load; this ADR is load-specific.
- v2: closes the "flat for weeks despite fine RPE" gap called out in v1's
  Context without touching the increase-side cap or the RPE-deload branch —
  purely additive, purely reductive when it fires.
