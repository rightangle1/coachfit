# ADR-0136 — Experience-tiered exercise selection, and no repeats across blocks

- **Status:** Accepted
- **Date:** 2026-08-09
- **Phase:** 1 (amends ADR-0111, ADR-0116, ADR-0126, ADR-0134)

## Context

Two related reports about what selection actually recommends, as opposed to
how much of it and how safely loaded:

1. **The catalog's depth wasn't experience-aware.** A beginner and an advanced
   athlete with the same equipment and the same emphasis were offered the same
   pool, ranked the same way. A trainer doesn't do this — a new athlete gets
   steered toward common, foundational movements they can execute safely with
   no coaching in the room; a seasoned athlete is offered the fuller catalog,
   including the barbell/skill/unilateral work a beginner has no business
   attempting unsupervised on day one. Nothing in `scoreExercise` (ADR-0126)
   read `ex.difficulty` or `athlete.experience` at all — it was already
   computed on every catalog entry for the swap picker (`matching.ts`,
   ADR-0134) and simply never consulted by generation.

2. **Warmup and Cool down could select the same exercise.** Reported
   concretely: a chest stretch appeared as both the opening and the closing
   movement of one session. Root cause: `pickFocusedMobility` is called once
   for Warmup and once for Cool down (`rules-engine.ts`), each with its own
   locally-scoped `chosenIds`/`usedPatterns` — nothing threads across the two
   calls. Their pools overlap by construction: Cool down's pool is
   `flowStage: 'cooldown'` unioned with the general static-stretch pool
   (ADR-0116's widening), and that general pool is a subset of Warmup's
   unrestricted mobility pool. With no history/volume signal differentiating
   mobility candidates, both calls score the same candidates identically and
   independently converge on the same top picks.

## Decision

### Experience tiers the catalog via a graded scoring bias, never a filter

`SELECTION_WEIGHTS.EXPERIENCE_FIT` (16) and a new `experienceFit(experience,
exercise)` term in `selection-score.ts`, keyed off the `difficulty` field the
catalog already guarantees on every entry (`catalog/index.ts`). An explicit
table, matching the file's existing "auditable in one place" convention
(ADR-0126, ADR-0134):

| athlete → \ ex.difficulty | beginner | intermediate | advanced |
| --- | --- | --- | --- |
| beginner | +1 | -0.6 | -1 |
| intermediate | +0.3 | +0.7 | -0.4 |
| advanced | 0 | +0.4 | +0.8 |

Read: a beginner is steered hard toward the common, foundational tier and away
from harder ones. An advanced athlete gets **no penalty** for beginner-tier
accessory work (a push-up is still a legitimate exercise for anyone) but a
real pull toward the intermediate/advanced catalog — the "deeper catalog" a
beginner shouldn't default into. A bias, not a gate: it competes only within
whatever the hard filters (equipment, safety, emphasis) already allowed, so an
equipment-limited beginner (one advanced barbell lift and nothing else) still
gets it.

**Damped almost away for anchor picks.** The session's stable, measurable
lifts (ADR-0126's `anchor` profile) must not get bumped by a difficulty-tier
reshuffle the moment they pick up a routine fatigue penalty — that is exactly
what ADR-0126 built the anchor/accessory profile split to prevent for recency,
and this term is the same kind of novelty signal. Caught by a real regression
while implementing this: under moderate quad fatigue, a tracked `DB front
squat` (beginner-tier, with a progression basis from history) lost its slot to
an unrelated single-leg calf raise (intermediate-tier, no progression basis)
purely because EXPERIENCE_FIT tipped an already-close race. Fixed by adding
`experienceFit` to `PROFILE_SCALE` alongside `recency`/`anchor`/`favorite`:
`anchor: 0.2` (nearly inert, matching recency's `0.15`), `accessory: 1` (full
strength — this is where catalog-depth rotation belongs), `neutral: 0.6`
(Warmup/Cool down/cardio picks).

`experience` threads through `PickOptions` and both `pickFullBodySpread` and
`pickFocusedMobility` down to every `pick()` call site in `generateSession`,
defaulting to `'intermediate'` (a neutral middle ground) for the two call
sites inside `buildYogaFlow`/`buildStretchFlow` that don't currently carry it
— those pools are almost entirely beginner-tier stretches regardless, so the
term is inert there in practice; not worth threading one more parameter
through a muscle-agnostic flow builder for no behavioral change.

### Cross-block de-duplication is a hard exclusion, not a bias

`generateSession` now threads a single `sessionChosenIds: Set<string>`,
populated as each block is finalized — Main (after the daily volume ceiling
drops anything, so a dropped exercise stays free for another block), Warmup,
Conditioning — and consulted by every block built afterward. `pick()` already
had the mechanism (`seedChosenIds`, ADR-0134's sub-pool plumbing) — it filters
candidates out of the pool entirely before scoring, so this is a real
exclusion, never a de-prioritization. `pickFocusedMobility` gained an
`excludeIds` parameter that seeds its internal `chosenIds` with this set,
covering the Warmup → Cool down path that could actually collide.

Threaded through all four blocks rather than special-cased to Warmup/Cool
down specifically: today's modality partitioning (Main is strength/cardio,
Warmup/Cool down are mobility, Conditioning is cardio only when Main isn't)
makes every other pairing already impossible by construction, but "a session
never recommends the same exercise twice" is the actual invariant asked for,
and enforcing it structurally costs a few lines against relying on modality
boundaries to hold forever.

Pools degrade gracefully when exhausted — `pick()` already returns fewer than
requested rather than erroring, so in the pathological case (e.g. a single
hamstring stretch owned in the whole equipment-filtered catalog) Cool down
would come back with one fewer exercise, never a duplicate.

## Consequences

- Catalog depth now visibly correlates with `athlete.experience` in generated
  sessions — measured via the new `experienceFit`/`scoreExercise` tests and a
  narrow-pool integration test in `rules-engine-test.ts`.
- The per-difficulty numbers are a judgment call, the first thing to revisit
  with real usage: they're deliberately conservative (comparable in magnitude
  to `COMPOUND`, well below `EMPHASIS`/`ANCHOR`/the fatigue and saturation
  penalties) precisely because the regression above showed how easily a
  blunt version of this idea overrides decisions the engine already reasons
  about carefully.
- `difficulty` remains heuristically derived for all but 12 hand-tagged
  catalog rows (`catalog/index.ts`'s regex classifier). This reuses that
  existing signal rather than introducing a new "popularity" field — accurate
  enough to steer selection, not a hand-curated ranking.
- A session's total exercise list is now guaranteed duplicate-free, asserted
  directly (`rules-engine-test.ts`), independent of whatever pool overlaps
  the catalog happens to have today or grows in the future.
