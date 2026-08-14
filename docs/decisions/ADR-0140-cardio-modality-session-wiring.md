# ADR-0140 — Wire cardio modality into session generation

- **Status:** Accepted (v1)
- **Date:** 2026-08-13
- **Phase:** 1

## Context

ADR-0139 added `cardioModality` (running/walking, machine, combat, jump
rope, aerobics, bodyweight, loaded) as a real, filterable field on cardio
exercises, but deliberately kept it out of session generation — "inert
metadata for now," with a "future ADR" flagged to cover surfacing it as a
`WorkoutOptions` input. This is that ADR.

The ask, from direct user feedback on the Today ("Kind of session") builder
screen: alongside the existing single-select **"CARDIO FORMAT"** chip row
(`CARDIO_INTENTS` — Easy base / Intervals / Benchmark / Aerobics, backed by
`CardioIntent`, `src/app/index.tsx`), add a **multi-select "CARDIO TYPE"**
row using the same 7 `cardioModality` values, positioned above it, that
actually narrows which exercises `RulesEngine` draws from for the session's
Main block — not just a catalog-browsing filter.

## Options considered

- **Multi-select OR-filter with graceful empty-pool fallback.** Chosen: an
  exercise is eligible if its `cardioModality` is any one of the selected
  values (OR — confirmed with the user; AND doesn't make sense since each
  exercise has exactly one modality). When the chosen format × type
  combination has zero matching exercises (many combinations do — e.g. no
  `loaded_cardio` exercise is `aerobics`-pattern), the engine silently drops
  the type preference for that session and records why, rather than
  generating an empty or failed session.
- **Hard filter, no fallback** (reject/error when a combination has no
  matches). Rejected: turns a UI convenience into a session-generation
  failure mode, directly against CLAUDE.md §2 ("when unsure, be
  conservative — a good trainer would rather under-load than injure") and
  §7 (safety/completeness are hard constraints, not preferences to violate
  silently in the other direction either).
- **AND-filter across selected types.** Rejected: meaningless, since every
  exercise carries exactly one `cardioModality` — an AND of two-or-more
  values could never match anything.

## Decision

Add `cardioModalities?: CardioModality[]` to `WorkoutOptions`
(`src/domain/types/session.ts`). Empty/absent = no preference, identical to
today's behavior — fully additive and backward compatible.

In `RulesEngine.generateSession` (`rules-engine.ts`, the `mainModality ===
'cardio'` branch), the existing `cardioIntent` → `movementPattern` filter
(`matchesIntent`) builds `intentPool` as before; `cardioModalities`, when
set, further filters that pool by `exercise.cardioModality` (OR-match). If
the result is empty, the engine falls back to `intentPool` unfiltered and
pushes a note onto the existing `swaps` array — the same mechanism already
used for routine-equipment gaps (`rules-engine.ts:471`) — which surfaces on
`SessionPlan.adjustments`, not `rationale`. Routines are unaffected:
`routinePool` already overrides pool selection entirely when a routine is
active, same as `cardioIntent` today.

UI (`src/app/index.tsx`): a new "CARDIO TYPE" chip row, multi-select
(independent per-chip toggle, unlike "CARDIO FORMAT"'s single-select),
rendered directly above "CARDIO FORMAT" inside the same cardio branch of the
"Kind of session" builder. The ordered value list and labels
(`CARDIO_MODALITIES` / `CARDIO_MODALITY_LABELS`) now live in
`src/app-lib/options.ts`, shared with the Explore catalog filter (ADR-0139)
so both surfaces present the same 7 options in the same order.

No decision-log schema change was needed — `logDecision` already serializes
the full `SessionContext` input, so `workoutOptions.cardioModalities` is
captured automatically. One reason code was added
(`src/services/programming.ts`) mirroring the existing `routine:` entry, for
at-a-glance visibility in the log without opening the raw JSON.

## Consequences

- Reversible: the field, the pool filter, and the fallback branch can all be
  removed without touching anything else — no other engine logic branches on
  `cardioModalities`.
- Cardio sessions are now genuinely steerable by workout style (not just
  intensity), matching how the athlete actually thinks about a cardio day.
- The empty-pool fallback is a new safety-relevant branch in the crown-jewel
  engine and has explicit test coverage (`rules-engine-test.ts`: single-type
  OR-filter, multi-type OR-filter, and the zero-match fallback), rather than
  being assumed correct.
