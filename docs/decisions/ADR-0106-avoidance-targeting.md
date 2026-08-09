# ADR-0106 — Avoidance & targeting resolution

- **Status:** Accepted (v2)
- **Date:** 2026-07-21 (v2: 2026-07-28)
- **Phase:** 1

## Context
Trainer nuance comes from structured inputs the rules act on (CLAUDE.md §6). This
ADR defines how `avoidToday.flags`, persistent `constraints`, and `targeting`
(emphasize/avoid) deterministically shape exercise selection.

## Decision
Resolution order when selecting/keeping an exercise:
1. **Hard exclude** — drop any exercise whose `primaryAreas`, `secondaryAreas`, or
   `jointLoad` matches a **severe** avoidance flag, a constraint with
   `severity: 'avoid'`, or a `targeting.avoid` area. Prefer a same-`movementPattern`
   substitute that does not match; if none, drop the slot.
2. **De-load / limit** — for **moderate**/**mild** flags or `severity: 'limit'|'caution'`
   matches, keep the exercise only if no clean substitute exists, and reduce its
   prescription (fewer sets / lower target RPE). Matching on `primaryArea` de-loads
   more than a `secondaryArea` match.
3. **Emphasize** — bias selection toward exercises whose `primaryAreas` intersect
   `targeting.emphasize`, and add a little volume there (within ADR-0104 limits).

Every swap/de-load/skip records a human-readable `note` on the `PlannedExercise`
(e.g. "swapped from back squat → leg press: left-knee flag") and is captured in the
decision log's `drivers` (ADR-0005).

Matching helper: a flag/target area matches an exercise if the muscle `group`
equals a primary/secondary area, the `region` rolls up to one of them, or the
`joint` string matches a `jointLoad` tag (case-insensitive).

## Consequences
- Fully deterministic and offline; explains itself in plain language.
- Safety-first: severe/`avoid` always excludes; caps/limits are enforced by rules.
- v1 keeps the substitution search simple (same movement pattern); smarter
  substitution can come later without changing the contract.

## v2 (2026-07-28) — severe fatigue is overridable by explicit targeting; injury never is
v1's "hard exclude" step, as implemented, actually folded **four** sources into
one undifferentiated bucket: severe avoidance flags, `severity: 'avoid'`
constraints, `targeting.avoid`, and **severe accumulated fatigue** (ADR-0102) —
the last of which this document never named, though the code always included it.
A session-generation review surfaced that this was too blunt: if an athlete
explicitly asks to target a severely fatigued (not injured) muscle, a good
trainer builds it anyway, heavily de-loaded — rather than silently swapping it
out as if it were an injury.

`AvoidanceModel.hard` is now split:
- **`hardSafety`** — the original three injury/pain-based sources. Unchanged:
  permanently absolute, matching CLAUDE.md's "safety cannot be overridden by any
  component." Explicit targeting never touches this bucket.
- **`hardFatigue`** — severe fatigue only. Still excludes by default, but
  `pick()` lets a candidate through when it matches `targeting.emphasize`,
  flagging it (`pushedThroughFatigue`) so the Main-block builder applies a
  noticeably heavier de-load than the standard `recovery` tier (more sets/RPE
  trimmed) and the rationale says so explicitly.
- **`isMaxDayReady`** is deliberately *not* extended by this override — a
  max-effort calibration attempt stays blocked by either bucket regardless of
  targeting, since testing a new max is a higher-stakes ask than a normal
  working set.

See `docs/decisions/ADR-0114-flow-session-structure.md` for how this interacts
with Stretch's targeted selection (where it matters most in practice).
