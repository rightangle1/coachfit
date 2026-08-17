# ADR-0409 — Selection tie-breaking defaults to catalog insertion order

- **Status:** Proposed
- **Date:** 2026-08-16
- **Phase:** 1 (amends ADR-0126, ADR-0134)

## Context

Found while investigating a report of a cardio session stacking Burpees and its own named
variant (Burpee broad jump combo) into one session. The stacking itself had a separate,
precise cause (`variantFamily` mis-tagging — fixed directly, see the exercises.ts /
selection-score.ts changes from this pass) — but tracing it surfaced a second, broader
finding in the selection algorithm itself that is *not* fixed here and is being tracked in
this ADR for a dedicated future pass.

`pick()`'s `bestOf()` helper ([rules-engine.ts:1671-1684](../../src/domain/engine/rules-engine.ts))
selects the highest-scoring candidate with a strict comparison:

```ts
for (const ex of candidates) {
  if (chosenIds.has(ex.id) || !predicate(ex)) continue;
  const score = scoreExercise(ex, ctx);
  if (score > bestScore) {
    bestScore = score;
    best = ex;
  }
}
```

`score > bestScore` (not `>=`) means that when two candidates tie exactly, the **first one
encountered in `candidates`** wins — and `candidates` preserves the order of `pool`, which
preserves the order of the `EXERCISES` catalog array, which is just the order exercises
happen to be written in `exercises.ts`.

For a same-tier pool of near-equivalent candidates — e.g. the bodyweight interval-cardio
pool (high knees, mountain climbers, jumping jacks, burpees, ...) — most of `scoreExercise`'s
terms are frequently 0 or identical across candidates when the athlete has no differentiating
history yet:

- `EMPHASIS`/`ANCHOR`/`FAVORITE` are 0 unless the athlete specifically targeted/favorited/has
  a progression basis on one of them.
- `EXPERIENCE_FIT` and `COMPOUND` are equal across this pool (same difficulty tier, same
  isolation classification for `interval`-pattern cardio).
- `VOLUME_DEFICIT`/`VOLUME_EXCESS` are already 0/constant for cardio (see this pass's fix #3).
- `RECENCY` is 0 for everything on a first exposure (empty history).
- `PATTERN_SATURATION`/`FAMILY_SATURATION` are 0 before the first pick of the block.

On a first-ever cardio session, or any day where fatigue/recency happen not to differentiate
the pool, essentially every term ties at 0/equal — and the tie always resolves to whichever
exercise is written first in `exercises.ts`. `ca-burpees` (line 8856) is the first
`interval`-pattern bodyweight cardio entry in the entire file, ahead of every other candidate
in that pool. That is an accident of file layout, not a trainer judgment, and it means the
*first* cardio exercise this class of athlete ever sees is structurally biased toward whatever
sits earliest in a 10,000+-line data file — with no mechanism in `selection-score.ts` or
`pick()` that treats "never yet had a turn" as a positive signal the way sports/training
literature would (a real trainer actively rotates a fresh athlete through variety, rather than
defaulting to the same move every time).

This is speculative in how often it actually decides real sessions (fatigue/history usually
break ties after the first exposure or two), but it is a real, verifiable property of the
current algorithm, worth a focused pass rather than a bundled fix.

## Options considered

- **A — Leave as-is.** Zero risk, zero code change. Cons: the bias is invisible and
  unowned — nobody chose "burpees first" on purpose, and it will silently recur for any other
  pool where a data file's insertion order happens to put one particular exercise first.
- **B — Session-seeded deterministic shuffle of the candidate pool before scoring.** Derive a
  seed from data already in `SessionContext` (e.g. `plannedFor` + athlete id), shuffle
  `candidates` once per `pick()` call before the greedy loop runs. Ties then resolve to a
  pseudo-random-but-reproducible order instead of file order. Preserves "same inputs → same
  plan" (required for decision-log replay/eval, CLAUDE.md §7, and for tests asserting exact
  output), since the seed is a pure function of the session's own inputs, not wall-clock or
  process state. Adds a small PRNG dependency to a module whose docstring currently advertises
  "pure, deterministic" scoring with no seed concept at all — that framing would need to
  become "deterministic *given a seed*," a real (if small) shift worth stating explicitly
  rather than sneaking in.
- **C — Explicit "hasn't had a turn" bonus.** Track a per-exercise-id lifetime pick count
  (distinct from `RECENCY`, which decays and can be 0 for many candidates simultaneously) and
  add a small scoring term favoring the least-picked-ever candidate among ties. Closer to
  literal trainer instinct ("you haven't done this one yet") and avoids introducing randomness
  at all. Cons: needs a new persisted signal threaded through history the way
  `withProgressionBasis`/`enjoymentByExercise` already are, and needs its own weight tuned
  against the rest of the table — more surface area than B.
- **D — Break ties on something already stable and semantically meaningful** (e.g. exercise
  `id` lexicographic order, or `metValue`) instead of insertion order. Trivial change, but
  swaps one arbitrary-but-invisible bias (file position) for another one that looks
  intentional but isn't ("z-named exercises never win a tie") — likely worse than A, since it
  invites someone to assume the ordering means something. Rejected outright, not a real
  contender.

## Decision

Not yet decided — deferred to a dedicated future pass, out of scope for the burpee-stacking
fix this ADR was written alongside. Leaning toward **B** (session-seeded shuffle) over **C**
when this is picked up, since it fixes the general case (any pool, not just cardio) with a
smaller, more contained change and no new persisted signal — but the actual call, and a check
of whether any existing test asserts exact selection order that a shuffle would need to
account for, belongs to whoever picks this up.

## Consequences

Left open. Whoever implements this should re-verify the term-by-term "everything ties at 0"
claim above still holds against the scoring table at that time (weights/terms may have shifted),
and should specifically check `selection-score.ts`'s and `rules-engine.ts`'s existing test
suites for any assertion that depends on today's insertion-order tie-break (a shuffle would
break those tests' expectations, not the engine's correctness).
