# ADR-0204 — Achievements engine

- **Status:** Accepted (v1)
- **Date:** 2026-07-22
- **Phase:** 2

## Context
CLAUDE.md calls for achievement tracking to support motivation. Needs to be
simple, honest, and consistent with the rest of the engine: deterministic, pure,
computed from data we already have.

## Decision
**Stateless, derived-from-history detection** — no separate "unlocked" table.
`detectAchievements(history, decisionLogCount?)` in
`src/domain/metrics/achievements.ts` recomputes the full unlocked set fresh each
call from `SessionRecord[]`. A fixed v1 rule set:
- **First session** — first completed workout ever.
- **Streak milestones** — 3-day and 7-day consecutive-day streaks (by calendar
  date of `completedAt`).
- **Volume milestones** — 5, 10, 25 completed sessions.
- **New PR** — any exercise's e1RM (ADR-0202) exceeds its prior max.

Each achievement is `{ id, title, description, achievedAt }`. Recomputing from
history means there's no drift between "what's unlocked" and "what the data
shows" — it can never go stale or need a migration when rules change.

## Consequences
- No extra persistence, no possibility of desync with actual history.
- Adding/changing rules later is just editing this function — no data migration.
- Slightly more CPU per view than reading a cached flag, but history sizes here
  are small (personal-use scale) so this is a non-issue.
