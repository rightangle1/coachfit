# ADR-0131 — Explicit resistance focus and opt-in tests

- **Status:** Accepted
- **Date:** 2026-08-05
- **Phase:** 1

## Context

Automatic zone rotation made regular resistance work hypertrophy by default and
periodically inserted AMRAP tests. A strength athlete therefore did not receive
ordinary heavy working sets. Bodybuilding and sculpting were also being used as
proxies for physiology even though they are structural preferences.

## Decision

Add `resistanceFocus = general | max_strength | hypertrophy |
muscular_endurance | power`. Regular zones are respectively hypertrophy,
strength, hypertrophy, endurance, and power. Tests require an explicit
`AthleteProfile.maxDay` configuration and remain milestone/exposure based.
Recovery intent, systemic deload, poor readiness, pain/avoidance, and local
recovery signals block testing. Normal working-set performance is the primary
calibration mechanism. Heavy compounds receive exercise-specific ramps even
without a test.

## Consequences

Workout style no longer infers physiological intent. Strength and power become
normal trainable outcomes, while AMRAP fatigue is optional.

**Supersedes** ADR-0128's automatic zone baseline and style-biased testing. Its
per-muscle exposure clock and test materialization remain valid when testing is
enabled.
