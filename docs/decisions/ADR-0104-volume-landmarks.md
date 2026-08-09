# ADR-0104 — Volume landmarks

- **Status:** Accepted (v1)
- **Date:** 2026-07-22
- **Phase:** 1

## Context
A trainer doesn't just avoid overworking a fatigued muscle (ADR-0102) — they
also track whether a muscle group has done *enough* work over the week to
grow, and whether it's crept past what's recoverable. This is the classic
Renaissance-Periodization MEV/MRV framework (minimum effective / maximum
recoverable volume), distinct from fatigue: fatigue asks "how recovered is
this muscle right now," volume landmarks ask "has this week's total work on
it been enough, or too much." `ADR-0105`'s session-generation pipeline
already reserves a step for this ("ADR-0104 volume landmarks refine later").

## Decision
**Fixed v1 landmarks, sets/muscle-group/week:** `MEV = 10` (below → under-
stimulated), `MRV = 20` (at/above → overreaching), the standard intermediate-
lifter defaults. Not scaled by experience level in v1 — a deliberate
simplification (same pattern as `ADR-0203`'s "richer measure can replace this
later").

**Crediting reuses catalog resolution, not free-text matching.** Weekly
volume is computed by `weeklyVolumeByGroup` (`src/domain/metrics/volume.ts`)
over completed sets, resolving each exercise's muscle groups via `groupsFor`
(`src/domain/engine/fatigue.ts`, exported for this reuse) — the same
catalog-backed lookup, with the same older-record fallback, that fatigue
accounting already uses. Primary areas credit a full set; secondary areas
credit `FATIGUE.SECONDARY_CREDIT` (0.4) — reusing that existing constant
instead of inventing a second, ungrounded weighting.

**Week bucketing is ISO-calendar-week** (Monday–Sunday), not a rolling
7-day window — lets the UI page "this week / N weeks ago" for comparison.

**Wired into `generateSession`, not just displayed** (`src/domain/engine/rules-engine.ts`):
- **Selection tie-break** (`pick()`): among otherwise-equal candidates
  (after emphasis and fatigue-freshness), prefer exercises whose primary
  group is under `MEV` this week — reordering only, never adding sets beyond
  what the rest of the pipeline already prescribes.
- **Prescription de-load**: a third de-load reason (`overMrv`), alongside the
  existing flagged-area and fatigue-recovery reasons in the Main block, fires
  when an exercise's primary group is at/above `MRV` for the current week.
  Reuses the existing de-load mechanics (one fewer set, RPE −1) — no new
  magnitude constant. Its own rationale note keeps the reason distinct from
  the other two: `"de-loaded — already at this week's volume ceiling for
  {muscle}"`.

Both hooks are purely reductive/reordering. The hard 10% session-to-session
load cap (`ADR-0103`) is untouched — volume landmarks can never push load or
set count beyond what the rest of the pipeline already allows.

**Display:** a "Weekly Volume" card on the Progress screen — horizontal bars
per muscle group colour-banded by `volumeStatus`, MEV/MRV reference marks,
week prev/next navigation, tap-to-expand per-exercise breakdown
(`weeklyVolumeBreakdown`). No charting library, matching the existing Phase 2
convention (numbers + simple bars).

## Consequences
- The engine now reasons about *weekly sufficiency*, not just moment-to-
  moment recovery — a second, distinct axis of "thinks like a trainer."
- Fixed, unscaled landmarks are an accepted v1 simplification; a later pass
  can scale by experience without changing any caller's contract.
- Reversible: `weeklyVolumeByGroup`/`MEV`/`MRV` are pure and swappable
  independent of the fatigue model or the rest of the pipeline.
