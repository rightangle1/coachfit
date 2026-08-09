# ADR-0002 — State management & persistence

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
We need in-memory UI/app state (e.g. the active workout: current exercise, set,
entered reps/weight, rest timer) distinct from the on-disk database (ADR-0001,
the source of truth). We want minimal boilerplate and easy hydration/persistence.

## Options considered
- **Zustand** — minimal, unopinionated, tiny boilerplate, simple persistence.
- **Redux Toolkit** — structured, great devtools, more boilerplate than needed early.
- **Jotai** — atomic/fine-grained; elegant but atom-sprawl risk as app grows.

## Decision
**Zustand.** Lowest-friction option; pairs cleanly with SQLite-as-source-of-truth,
where stores hold ephemeral/session state and flush to the DB via services.

## Consequences
- Little ceremony; easy for a small team to move fast.
- Discipline needed: the DB is the source of truth; stores hold transient state and
  must persist important changes immediately (matters for offline crash-safety, ADR-0108).
- Reversible: state access is confined to hooks/services, so migrating later is bounded.
