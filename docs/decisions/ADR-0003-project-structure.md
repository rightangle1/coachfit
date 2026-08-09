# ADR-0003 — Project structure & domain layering

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
CLAUDE.md requires a clean UI ⇄ services ⇄ engine ⇄ data boundary so the UI only
ever calls the `ProgrammingEngine` interface, the rules stay swappable, and the
data layer is reversible. We need a folder layout that enforces this.

## Options considered
- **Layered `src/` with a pure `domain/`** — UI (`app/`, `components/`) → `services/`
  (orchestration) → `domain/` (pure types + engine, no IO/RN) and `data/`
  (persistence). Clear dependency direction.
- **Feature-folder / vertical slices** — group by feature (onboarding, workout…).
  Good for big teams; premature here and blurs the engine boundary.
- **Flat** — everything under a few folders. Fast now, erodes the boundary fast.

## Decision
**Layered `src/` with a pure `domain/`.** Dependencies point inward:
`app` → `state`/`services` → `domain` + `data`. `domain/` (types + engine) has **no**
React Native or IO imports, so it's unit-testable in plain Node and portable.

```
src/
  app/          # Expo Router screens — UI only, call services/engine
  components/   # presentational components (template + ours)
  state/        # Zustand stores (ephemeral/session state)
  services/     # orchestration: engine + data + decision log
  domain/       # PURE: no RN, no IO
    types/      # shared domain vocabulary (body areas, athlete, session…)
    engine/     # ProgrammingEngine interface + RulesEngine
  data/         # Drizzle schema, db client, repositories (persistence)
  hooks/ constants/  # existing template utilities
```

## Consequences
- The engine and rules are testable without a device/emulator.
- UI cannot reach into rules or data directly — it goes through `services/`.
- Reversible: swapping ORM (ADR-0001) or adding an advisor (CLAUDE §5) is bounded.
- Rule to enforce in review: nothing in `domain/` imports from `react-native`,
  `expo-*`, or `data/`.
