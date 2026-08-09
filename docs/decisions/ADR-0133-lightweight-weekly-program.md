# ADR-0133 — Lightweight weekly program layer

- **Status:** Accepted
- **Date:** 2026-08-05
- **Phase:** 1

## Context

The engine generated a good daily session but had no durable representation of
what later sessions in the week were meant to cover. Missed work could influence
today without a boundary preventing volume from being crammed forward.

## Decision

Build a stable six-week program boundary. Expected sessions are allocated by
explicit weekly modality targets or goal weights. Each session stores movement
slots, priority muscles, experience-based target set ranges, and up to two
stable anchor exercises. Today's index advances only when a session completes.
Daily readiness adapts the current prescription but does not mutate later weekly
intent or add missed volume. Power and balance are explicit optional slots.

## Consequences

The engine gains weekly coverage and anchor stability without complex
periodization. Competition peaking and machine-specific cardio blocks remain
future layers, not hidden heuristics in daily generation.
