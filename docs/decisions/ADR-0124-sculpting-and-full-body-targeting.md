# ADR-0124 — Sculpting workout style + Full Body targeting

- **Status:** Accepted (v1)
- **Date:** 2026-07-31
- **Phase:** 1 (engine revamp)

## Context
Product wants "sculpting" as a training goal: a full-body toning/definition
style, distinct from targeted muscle work, selectable both as a standing
overall preference and as a per-workout override. Two existing mechanisms
were candidates and both fall short on their own:

- `TrainingGoals.weights` (`src/domain/types/goals.ts`) is a closed 4-value
  `Modality` union (`strength`/`cardio`/`mobility`/`general`) used as
  `Record<Modality, X>` keys across ~8 sites (hero images, icons, goal
  stories, `MODALITY_LABELS`, `PRIMARY_METRIC`) plus weight-blending
  arithmetic in `rules-engine.ts` (`normalize`, `dominantMainModality`,
  conditioning-block gating, `timeEfficiencyLean`). A goal *weight* biases
  which block runs (Main vs. Conditioning), not which muscle groups within
  that block get picked — it doesn't actually solve "spread across the
  body," and growing the union ripples through all ~8 sites.
- `SessionTargeting.emphasize: BodyArea[]` (`src/domain/types/session.ts`),
  resolved per ADR-0106, is a 1-2-group *concentration* tool by construction
  (`EMPHASIS_OPTIONS`'s 2-chip cap, `pick()`'s emphasis-biased sort) — great
  for a strength split, the opposite of what sculpting needs.

References: ADR-0105 (Main-block generation pipeline), ADR-0106
(avoidance/targeting resolution order), ADR-0114 (precedent: a session
*style* gets its own dedicated builder logic, e.g. Yoga vs. Stretch).

## Options considered
- **Option A — Sculpting as a 5th `Modality` weight.** Rejected: ripples
  through every `Record<Modality, X>` site and the weight-blending
  arithmetic, and still doesn't solve within-block spread (a modality weight
  operates one level too high — it can't tell `pick()` to stop concentrating
  on 1-2 groups).
- **Option B — Sculpting as a new `WorkoutType` (prescription) + reviving
  `BodyRegion: 'full_body'` as a session-structure targeting directive
  (selection), composed only at the UI default level.** Chosen.
- **Option C — one combined, inseparable "sculpting mode" flag** that
  bundles prescription and forced full-body spread together. Rejected: loses
  real, useful combinations — "Bodybuilding + Full Body" (a hypertrophy
  session that still spans the whole body) or "Sculpting + one extra
  emphasized group" (a toning day with slight extra arm work) — that fall
  out for free once the two concerns are orthogonal.

## Decision
Two independent inputs, wired together only at the UI default level:

**1. `WorkoutType` gains `'sculpting'`** (`src/domain/types/session.ts`),
directly parallel to the existing `'bodybuilding'`. In `rules-engine.ts`'s
strength Main-block builder, `isSculpting` drives:
- `sculptingCount()` — a new count function (floor 3, ceiling 8) sized a
  step above `bodybuildingCount()`, since breadth (more exercises), not
  per-lift volume, is sculpting's lever.
- A `13`-rep override in `strengthSets()` (vs. bodybuilding's flat `10`) —
  the toning end of the hypertrophy band in
  `docs/methodology/strength-set-design.md` §3 (~6-15 reps).
- Inclusion in the auto-superset invite condition alongside
  `isBodybuilding`/`timeEfficiencyLean`.

`AthleteProfile.preferredWorkoutType?: WorkoutType` is the "overall"
standing preference, set via `onboarding-form.tsx` (shared by first-run
onboarding and the Settings "Edit training profile" sheet) and read by the
Today screen (`src/app/index.tsx`) as the per-session picker's default —
still overridable per session, which is how "individual workout" comes for
free from the same `WorkoutType` mechanism `'bodybuilding'` already uses.

**2. A new "Full Body" targeting option**, added to the Today screen's
target-muscles picker alongside the existing muscle-group chips
(`FULL_BODY_EMPHASIS_OPTION`, `src/app-lib/options.ts`), mutually exclusive
with them (picking one clears the other). It resolves to
`targeting.emphasize = [{ region: 'full_body' }]` — reviving
`BodyRegion.full_body` (`src/domain/types/body-area.ts`), previously
declared but never wired into `GROUP_TO_REGION` or read by the engine.

`isFullBodyTargeting()` (`src/domain/engine/matching.ts`) detects the
directive (region `'full_body'` deliberately never appears in
`GROUP_TO_REGION`, so it correctly never matches per-exercise via
`emphasizesArea`/`matchStrength` — this is intentional, since full-body
isn't a per-exercise emphasis score, it's a session-structure directive).
When present, the Main-block builder calls `pickFullBodySpread()` instead of
plain `pick()`:
- `fullBodyRegionQuotas(count)` splits the exercise count across
  `upper_body`/`lower_body`/`core` — core gets a deliberately smaller share
  (single-joint work, less time-costly), the remainder favors upper before
  lower. A simple v1 split, not derived from any existing constant —
  intentionally left to tune against real usage later, per ADR-0114's
  precedent of shipping a reasonable v1 and refining after real sessions
  surface issues.
- `pickFullBodySpread()` runs `pick()` once per region-filtered pool, with
  `pick()` extended to accept optional `seedChosenIds`/`seedUsedPatterns` so
  two regions can't pick the same exercise or duplicate a movement pattern.
  Each per-region call still goes through the same `avoid`
  (`hardSafety`/`hardFatigue`/`limit`/`recovery`) resolution as a normal
  `pick()` call — safety and avoidance apply identically regardless of how
  `main` was assembled.

Full Body targeting is **not gated to Sculpting** — it works in any strength
Main block (e.g. "Bodybuilding + Full Body"). The two inputs combine only in
the UI: selecting `'sculpting'` on the Today screen auto-selects "Full Body"
in the emphasis picker as a sensible default (still user-changeable — a
manually-picked muscle group clears Full Body, matching the same
never-stomp-a-touched-selection precedent the existing recovery-suggestion
effect already uses).

## Consequences
- Reversible: `pickFullBodySpread` is a pure function returning
  `Exercise[]` behind `pick()`'s existing call-site shape — falling back to
  plain `pick()` is a one-line revert. `pick()`'s two new trailing params
  default to empty sets, so every pre-existing call site is byte-identical.
- `BodyRegion.full_body` goes from documented-dead-code to live, closing a
  gap the taxonomy itself had reserved space for.
- No decision-log schema change required — `programming.ts` already logs
  the full `SessionContext` (including `targeting.emphasize` verbatim) and
  full output (including `rationale`), satisfying CLAUDE.md §7 for free.
  `buildRationale()` gained explicit sentences for both the sculpting style
  and the full-body directive (and a latent bug was fixed in passing:
  `describeArea()`'s bare-`region` fallback would otherwise have printed the
  literal string `"full_body"` in the prebrief note).
- `WorkoutType` becoming a 6th value is a small, contained blast radius
  compared to growing `Modality`: two exhaustive `Record<WorkoutType, X>`
  sites needed a new entry (`exercise-detail.tsx`'s header-background map,
  `achievements.ts`'s workout-style achievement family) — both additive,
  no arithmetic to rebalance. `exercise-detail.tsx` reuses the bodybuilding
  hero image as a placeholder (no dedicated Sculpting art yet, per
  CLAUDE.md §11's "simple placeholders now, richer later").
