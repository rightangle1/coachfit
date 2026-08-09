# ADR-0107 — Readiness scaling

- **Status:** Accepted (v2)
- **Date:** 2026-07-28
- **Phase:** 1 (rules engine)

## Context
`readinessScale()` has existed since early Phase 1 as a deliberately conservative
v1 stub — cited in the ADR index and in code comments, but never given its own
document (the gap the index itself flagged as "Proposed (v1 stub in code)"). It
collapsed today's sleep/soreness/energy report into a single binary: any one
signal crossing a threshold (energy ≤2, soreness ≥4, sleepQuality ≤2) flipped a
flat 20% volume/reps cut; otherwise no cut at all. A single mildly-off signal
(energy exactly 2) was penalized identically to every signal being genuinely bad —
not what a trainer would do, and not graded the way the *load* axis already was.

By ADR-0122, the load axis (`load-finalization.ts`'s `readinessFactorOf`) already
solved this properly: independent per-signal threshold bands, summed, capped —
mild readiness issues barely move load, several bad signals move it more. This
ADR builds out the volume/reps axis to match that same proven pattern, and
extracts the shared banding logic so both axes read "how bad is bad" consistently.

Grounding: `docs/methodology/strength-set-design.md` §6.

## Decision

### Shared grading (`readiness.ts`, new)
`gradedPenalty(r)` sums independent per-signal bands — identical numbers to
ADR-0122's original `readinessFactorOf` (energy ≤1→0.05/=2→0.03, soreness
≥5→0.05/=4→0.03, sleepQuality ≤1→0.04/=2→0.02) — and
`readinessFactor(r, maxCut, scale = 1)` turns that into a `[1 − maxCut, 1]`
multiplicative factor, never raising.

### Load axis (unchanged behavior)
`load-finalization.ts`'s `readinessFactorOf` becomes `readinessFactor(r,
MAX_READINESS_CUT)` (`MAX_READINESS_CUT = 0.10`, `scale` defaults to 1) —
byte-identical output to the original ADR-0122 numbers. All existing
`load-finalization-test.ts` cases pass unchanged, confirming this.

### Volume/reps axis (the actual v2 change)
`rules-engine.ts`'s `readinessScale()` becomes `readinessFactor(r, 0.3, 2)` — a
deeper max cut (30% vs. load's 10%) and a steeper per-signal scale (2×), because
reps/hold-duration (not weight) are the primary "how do you feel today" lever —
`strengthSets()`'s own comment already establishes that split ("effort... shows
up as reps/hold-duration instead — that's what moves visibly without silently
shortening the workout"). Worked examples:
- A single mild signal (energy = 2 alone): −6% (vs. the old flat −20%).
- A single severe signal alone (energy ≤1): −10%.
- Every signal at its worst: −28%, capped at −30%.

`volumeScale`'s existing `[0.65, 1.1]` combined clamp (with `trainingIntent`) is
unchanged and still the final safety floor — this ADR only makes what feeds into
it graded instead of binary.

## Consequences
- A single off-but-not-terrible signal no longer triggers the same flat cut as a
  genuinely rough day — closer to what a trainer would actually do.
- The worst realistic day now trims *more* than the old flat 20% (up to 28%
  before the outer clamp), while typical single-signal days trim much less.
- `readiness.ts` is a new, small, pure module (ADR-0003 domain layering) —
  imported by both `rules-engine.ts` and `load-finalization.ts`; no other call
  sites change.
- Reversible: both axes' magnitudes (`maxCut`, `scale`) are named constants at
  their call sites, tunable independently without touching the shared grading.

## Safety
Unchanged: readiness only ever reduces or holds volume/reps and load, never
raises either. The hard progression caps (ADR-0103) and volume landmarks
(ADR-0104) remain the sole source of any *increase*.
