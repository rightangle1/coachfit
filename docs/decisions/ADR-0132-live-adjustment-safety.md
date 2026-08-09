# ADR-0132 — Live pain and substitution safety

- **Status:** Accepted
- **Date:** 2026-08-05
- **Phase:** 1

## Context

`pain` shared the too-hard branch, so exercise continued. Swaps copied the old
exercise's weight and left grouping, rest, duration, and rationale stale. The
replacement picker filtered only modality and equipment.

## Decision

Pain stops the affected exercise and records area, severity, and symptom type.
Too-hard may only reduce; too-easy changes one variable within-zone; time-short
trims optional/accessory work before priorities; skip repairs the session.

A substitution must match modality, specific movement slot, and target muscles,
then pass equipment, exclusions, avoidance, prerequisites, and athlete
difficulty. It is prescribed from its own history; absent a baseline, load is
unset. The old weight is never transferred. Grouping, rest, duration, secondary
muscles, rationale, and structured reason code are recomputed.

## Consequences

Live adaptation now shares the generation safety boundary and rejected swaps
remain explainable. The UI picker uses the same core compatibility dimensions.
