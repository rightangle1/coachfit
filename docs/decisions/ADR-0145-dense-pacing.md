# ADR-0145 — Goal-level rest-interval / pacing-density parameter

- **Status:** Accepted (v1)
- **Date:** 2026-08-15
- **Phase:** 3

## Context

Phase 0 built the two-level goal taxonomy; Phase 1 added a persistent cardio-format lean; Phase 2
gave circuit intent a real loaded-implement structure. All three left one gap named directly in
project memory: Fat Loss and Metabolic Conditioning subtypes got no explicit rest/pacing-density
boost — only a side effect of whatever rep range their `resistanceFocus` happened to imply.
`restSecondsFor` (`timing.ts`) and `restIntensityFactor` (`intensity.ts`) — the only two functions
that decide strength-set rest — take an `Exercise`/`PlannedSet` and nothing else; no goal input
reaches either one. `lose_weight.metabolic_conditioning` didn't even set `resistanceFocus`.

A design review before implementation (mirroring Phase 2's process) found a structural gap in the
straightforward version of this fix: `lose_weight.metabolic_conditioning` forces
`preferredWorkoutType: 'cardio'`, so its Main block is built entirely by the cardio branch and
stamped into a circuit group — both rest consumers (`annotateRest`, `estimateBlocksSeconds`)
short-circuit to the flat `REST.AEROBICS_TRANSITION`/`REST.LOADED_CIRCUIT_TRANSITION` constants for
any circuit-grouped exercise. A density parameter touching only `restSecondsFor`'s compound/
isolation tiers would have zero effect on the one preset literally named "Metabolic Conditioning."
The user chose to extend the parameter with a second, more conservative lever for circuit
transitions rather than leave that preset's Main block untouched.

The review also caught three real bugs before they shipped:

1. An AMRAP calibration test set (endurance-zone: 15 reps, RPE 9, `isCalibration: true`) isn't
   caught by `isHeavySet()`'s reps-≤8 heuristic — without an explicit exemption, a max-effort test
   would have its recovery compressed by a goal preference.
2. Naively stacking a density discount on top of `SUPERSET_REST_FACTOR` (0.55) for a grouped set
   would compound into a budget estimate far below the real displayed rest for that set (which
   never applies `SUPERSET_REST_FACTOR`), causing `fitDurationToBudget` to pack in more work than
   actually fits and real sessions to run over their requested duration.
3. `workout-details.tsx`'s `blockMinutes()` calls `estimateBlocksSeconds` directly with no access
   to `TrainingGoals` — a missed call site that would leave the pre-workout duration badge
   overstating real time for a dense-paced session.

A fourth bug was found during implementation, not review: `roundPlanTimes` — the last step of
session build — unconditionally rounds every `restSec` to the nearest 10s. The new circuit-density
constants (8s/16s) round straight back up to the standard 10s/20s, silently erasing the discount.

## Decision

- New `TrainingGoals.restPacing?: 'standard' | 'dense'` (`goals.ts`), resolved via
  `GoalPresetResolution.restPacing` and set on all three `lose_weight` subtypes (`with_strength`,
  `with_cardio`, `metabolic_conditioning`) — matching project memory's original framing exactly.
  Exposed as a "PACING" Fine-tune chip row in onboarding, consistent with every other resolved
  field except the UI-only `suggestedDurationMin`.
- **Straight-set lever** (`timing.ts`): `densePacingFactor(exercise, set, densePacing)` centralizes
  every safety exemption in one place — off entirely, a calibration/warmup set, or a genuinely
  heavy compound set (`isHeavySet`) always returns `1` (no discount). Cardio/mobility/aerobics
  exercises also return `1` — dense pacing only shapes strength-tier rest; circuit transitions have
  their own lever. Otherwise: `DENSE_PACING_COMPOUND_FACTOR = 0.75` or
  `DENSE_PACING_ISOLATION_FACTOR = 0.6` (isolation tolerates a more aggressive cut — lower stakes,
  single joint; compound recovery is where insufficient rest risks technique breakdown).
  `pacedRestSecondsFor` wraps `restSecondsFor` + the factor, only re-rounding when the factor isn't
  a no-op — `restSecondsFor` itself is untouched, still 2-arg and pure.
- **Grouped/dense are mutually exclusive**, never stacked: `setCostSeconds` gives a grouped set
  `SUPERSET_REST_FACTOR` alone, exactly as before this feature existed; the density discount only
  applies to ungrouped sets.
- **Circuit-transition lever** (`timing.ts`): `REST.DENSE_AEROBICS_TRANSITION = 8`,
  `REST.DENSE_LOADED_CIRCUIT_TRANSITION = 16` — a deliberately gentler 20% cut (vs. 25-40% for the
  straight-set factors), since these constants already sit at Phase 2's tightest-safe value, not a
  generic default with headroom. The 2x aerobics:loaded ratio Phase 2 established is preserved
  exactly (8 × 2 = 16). `cardioSets()`'s circuit round-math takes the matching value so round count
  stays internally consistent with the transition actually displayed — the same class of
  coordination Phase 2 required for its own transition constant.
- `roundPlanTimes` skips re-rounding `restSec` for circuit-grouped exercises — `annotateRest`
  already writes a final, intentional value for those (the standard 10s/20s were already exact
  multiples of 10, so this is a no-op for every non-dense circuit; only the new 8s/16s values were
  actually affected).
- `SessionPlan.densePacing?: boolean` persists the resolved decision at generation time, mirroring
  the existing `workoutType`/`workoutOptions` precedent — consumers that only have the plan (the
  pre-workout duration badge, a live mid-session exercise swap) read this instead of re-deriving it
  from goals. `adjustDuringSession` reads `plan.densePacing` rather than a fresh
  `LiveAdjustmentContext` field (unlike `resistanceFocus`'s precedent) — a live swap should stay
  consistent with how the rest of *that* session was already timed, not the athlete's current
  standing goal.
- Named in the athlete-visible rationale when active (CLAUDE.md §7's decision-logging principle).

## Consequences

| Before | After |
|---|---|
| Fat Loss/Metabolic Conditioning subtypes: rest differed only as a rep-range side effect | Explicit, bounded discount on straight-set rest and circuit transitions |
| A heavy compound or AMRAP test set's recovery | Unaffected regardless of pacing goal — safety exemption |
| A grouped (superset) set's real displayed rest | Unaffected — density discount only applies to ungrouped sets, never stacked with `SUPERSET_REST_FACTOR` |
| `fitDurationToBudget` under dense pacing | Packs more work into the same requested duration (cheaper per-set estimate), still hard-capped by the existing `MAX_SESSION_WORK_SETS`/volume-landmark ceiling — untouched by this phase |
| Pre-workout duration badge (`workout-details.tsx`) | Fixed — reads `plan.densePacing`, matches the tracker's real per-set rest |
| Circuit-grouped rest display | `roundPlanTimes` no longer clobbers an intentional sub-10s-multiple value |

**Reversible**: `densePacing`/`restPacing` default to `false`/unset everywhere, and every new
function parameter defaults to `false` — a session generated with no goal-level pacing lean is
provably byte-identical to pre-Phase-3 output. **Deliberate scope boundary**: `improve_cardio.
get_fitter_fast`/`sport_conditioning` and the `move_better.*` "gentle/steady/slower" presets are not
touched — no pacing language in their copy, not named by project memory. A bidirectional `'relaxed'`
value is a natural, easy extension of the `RestPacing` type if a slower-than-baseline lean is ever
wanted, not built now.
