# ADR-0006 — Navigation

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
We need screen navigation for the core loop (onboarding, equipment, prebrief,
workout tracker, debrief, progress) with a sensible back stack and room to grow.

## Options considered
- **Expo Router** — file-based routing, current Expo default, deep-linking for free,
  less config. Built on top of React Navigation.
- **React Navigation** — mature, maximally flexible, but more manual setup.

## Decision
**Expo Router.** File-based screens are easy to reason about, it's the default Expo
path with least config, and we can still drop to React Navigation APIs when needed
since Expo Router is built on it.

## Consequences
- Screens map to files under the routing directory; conventions are clear.
- Deep-linking essentially free for later (e.g. resume-workout links).
- Reversible: Expo Router wraps React Navigation, so escape hatches exist.
