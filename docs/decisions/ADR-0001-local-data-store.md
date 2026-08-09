# ADR-0001 — Local data store

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
The app is offline-first; local storage is the source of truth for all data
(profile, equipment, sessions, logs, decision log). Must support a typed schema,
migrations, and be friendly to optional cloud sync later.

## Options considered
- **Drizzle + Expo SQLite** — SQLite for rock-solid offline storage; Drizzle ORM
  for a typed schema and migrations with strong TypeScript ergonomics. Sync-friendly.
- **WatermelonDB** — offline-first RN DB with sync built in and lazy loading;
  powerful but heavier and more opinionated, more upfront ceremony.
- **Expo SQLite (raw)** — minimal deps, full control, but hand-written queries and
  migrations, and no type safety.

## Decision
**Drizzle + Expo SQLite.** Best balance of offline reliability, type safety,
migrations, and future sync flexibility without locking us into a heavy framework.

## Consequences
- Typed schema shared across services and the engine; migrations are first-class.
- We own the sync strategy later (see the "later/maybe" sync ADR) rather than
  inheriting WatermelonDB's model — more work but more control.
- Reversible: the data layer sits behind repository/service modules (ADR-0003), so
  swapping the ORM later touches a bounded surface.
