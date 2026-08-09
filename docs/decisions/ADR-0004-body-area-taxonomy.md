# ADR-0004 — Body-area taxonomy

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
The body-area taxonomy is the shared vocabulary used by targeting (emphasize/
avoid), avoidance flags, per-area fatigue tracking, exercise tagging, and strength
trends. It is the highest-leverage foundational decision — everything speaks it —
so it deserves an explicit, ratified decision before Phase 1 hardens logic around it.

## Open questions to resolve
- **Granularity:** region (upper/lower/core) vs. muscle group (chest, quads…) vs.
  individual muscle (upper vs. lower pec). Recommendation: **muscle group** as the
  primary engine granularity, with a coarser **region** rollup for high-level
  reasoning, and individual-muscle detail deferred.
- **Non-muscle areas:** how users flag joints/areas ("left knee", "wrist"). v0 uses
  a free-form `joint` string + `side`; decide whether to enumerate these.
- **Laterality:** do we track left/right for fatigue, or only for avoidance flags?
- **Exercise mapping:** how exercises declare primary vs. secondary areas, and how
  secondary involvement contributes to fatigue.

## Provisional v0 (in `src/domain/types/body-area.ts`)
`BodyRegion` (4) + `MuscleGroup` (14) + a `BodyArea` reference type with optional
`group` / `region` / `joint` / `side`, and a `GROUP_TO_REGION` rollup. Marked
provisional in-code.

## Decision
Ratifying the provisional v0 with these rules:
- **Primary granularity = muscle group** (the 14 in code). The engine targets,
  recovers, and reports strength at this level.
- **Region rollup** (upper/lower/core/full) via `GROUP_TO_REGION` for coarse
  reasoning and UI grouping. Individual-muscle detail (e.g. upper vs. lower pec)
  is **deferred** — not needed for good v1 programming.
- **Non-muscle areas** stay a free-form `joint` string (+ `side`) on `BodyArea`.
  We do **not** enumerate joints yet; users flag them ("left knee") and exercises
  can declare joint-load tags so avoidance can match them.
- **Laterality:** tracked only on avoidance flags / constraints (`side`), **not**
  on fatigue — per-side fatigue is deferred (adds state for little v1 benefit).
- **Exercise mapping:** exercises declare `primaryAreas` and `secondaryAreas`
  (muscle groups) plus optional `jointLoad` tags. Secondary involvement counts
  toward fatigue at a reduced weight (defined in ADR-0102).

## Consequences
Changing the taxonomy later ripples across fatigue, exercises, targeting, and
metrics — hence ratifying early. The provisional v0 is deliberately conservative
(muscle-group level) to minimize churn if accepted roughly as-is.
