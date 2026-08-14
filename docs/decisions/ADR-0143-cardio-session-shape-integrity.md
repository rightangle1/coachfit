# ADR-0143 — Cardio session-shape integrity

- **Status:** Accepted (v1)
- **Date:** 2026-08-14
- **Phase:** 1

## Context

Manual testing repeatedly surfaced a session shaped like nothing a trainer
would prescribe: a single exercise stretched across 10+ sets with arbitrary
durations, most often on conditioning/interval days — including the plain
main cardio workout when Interval format was chosen explicitly. Root-caused
to four independent defects in `rules-engine.ts`, all now fixed together:

1. **Exercise count silently collapsed to 1.** `baseCount`'s ternary
   hardcoded `1` whenever `workoutType !== 'cardio'` (the common *implicit*
   case — `mainModality` derived purely from goal weights) **and** whenever
   `workoutType === 'cardio' && cardioIntent === 'interval'` even when
   explicitly chosen — unlike its sibling `circuit`, which already scaled via
   `aerobicsStationCount(experience, targetDurationMin)`.
2. **The pattern filter that keeps a slot's candidates coherent with the
   declared shape only applied when `workoutType === 'cardio'` explicitly.**
   An implicit cardio day's single slot was scored across the entire cardio
   pool (steady/interval/aerobics mixed), with nothing steering it toward the
   shape the resolved intent implied.
3. **`cardioSets()` branched on the exercise's own catalog `movementPattern`
   tag, `|| ex.movementPattern === '...'`, not the session's declared
   `cardioIntent`.** A single exercise landing in an implicit/basic slot could
   still get full interval structure — first exposure, no history:
   `priorRounds = priorWork.length || 5` → 5 rounds × work+recovery =
   **exactly 10 sets** — or worse, circuit/aerobics structure: `stationCount`
   defaulted to `1` everywhere outside an explicit circuit (Conditioning never
   passed it at all), so with the default `rx.cardioSeconds = 1200`:
   `round(1200 / 1 / (45 + 10)) ≈ 22` same-exercise work sets, structurally
   uncapped because `Math.min(8, priorRounds + 1)` only ever bounded the
   *growth* step, never the base. This is exactly the reported "Round 1 of
   22" shape (`guided-flow.ts`'s `flattenSingleExerciseCardio()` renders it
   that way whenever no set carries a `'recovery'` phase).
4. **`fitDurationToBudget()` never touched cardio** — its `isTrimmableStrength`
   gate is strength-Main-only, so an over-long single-exercise cardio block
   was never rebalanced. Strength already has the right model for this exact
   class of problem: `session-volume.ts` (ADR-0134) exists because "a
   chest-emphasis session could — and did — prescribe 22 chest sets against a
   weekly MRV of 16," for the structurally identical reason (exercise count
   decided separately from set count). Cardio had no equivalent.

A fifth, related gap: **cardio bypassed all the readiness/fatigue volume
scaling strength gets.** `volumeScale` was computed but only ever passed to
`strengthSets()`; a poor-readiness or `recovery`-intent day only blocked
cardio's further *progression*, never shrank the un-progressed baseline — so
a recovery day still got the full first-exposure 10-set interval prescription.

**Explicitly not a bug, and preserved as legitimate**: running/walking and
cardio-machine intervals (treadmill or track sprint/recovery cycles) are
naturally single-exercise — there's no real "second station" to rotate to
without switching equipment mid-interval. A deliberately-chosen circuit or
interval format legitimately carries more rounds on a single exercise than an
implicit/basic pick ever should. A routine's own composition is always
authoritative. These are named, tested exceptions, not oversights.

## Options considered

- **Cap set counts only, leave selection/branching alone.** Rejected — same
  reasoning ADR-0134 rejected its analogous option: it treats the symptom,
  not the two independent causes (count collapse, tag-overrides-intent).
- **Filter selection by intent only, leave `cardioSets()`'s tag fallback in
  place.** Rejected — leaves no clean hook for the one legitimate exception
  (a routine's own tag should still govern), and the uncapped circuit
  arithmetic is an independent defect either way.
- **The combination implemented**: pool/intent agreement + an
  intent-authoritative `cardioSets()` with one named exception + a shared
  round cap applied to the base value + `volumeScale` threading + a
  cross-workout-type shape-audit layer as a permanent regression backstop.

## Decision

- `rules-engine.ts`'s cardio Main pool/count logic no longer branches on
  `workoutType === 'cardio'` — `cardioIntent` (already resolved, defaulting to
  `'basic'`) alone drives both the pattern filter and the exercise count,
  whether cardio was chosen explicitly or derived from goal weights. Interval
  gained its own `intervalStationCount(experience, targetDurationMin)`,
  scaled like `cardioFocusCount`/`aerobicsStationCount` already were, with a
  floor of 1 (a genuinely single-focus session is legitimate) and a ceiling of
  4 (interval doesn't need circuit's station-variety range). A new
  `isSingleFocusCardioPool()` check overrides the count back to 1 whenever
  *every* candidate in the matched pool is `running_walking` or
  `machine_cardio` — a mixed pool still gets the normal scaled count.
- `effectiveCardioIntent(ex, sessionIntent, isRoutinePick)` resolves intent
  once, at each call site, where routine-vs-not is known. `cardioSets()`
  itself is now a pure function of its `intent` parameter — no tag fallback.
- `MAX_CARDIO_ROUNDS = 8` / `MIN_CARDIO_ROUNDS = 2` cap the *base* round count
  in both the circuit/aerobics and interval branches, not just their
  progression-growth step. `MIN_CARDIO_DURATION_SEC = 180` floors a scaled
  steady-state bout.
- `cardioSets()` gained a trailing `volumeScale = 1` parameter, applied
  downward-only to the capped base before any progression growth — old call
  sites (and this file's own existing tests) are unaffected by the new
  default.
- Conditioning always defaults to a steady/basic pick unless a routine placed
  a specific exercise there (it's a finisher on a lifting day, with no format
  control of its own — a trainer would never hand someone an unplanned
  22-round circuit as an afterthought). This falls out of the two fixes above
  applied consistently; no separate mechanism was needed.
- New `session-shape.ts`: `auditSessionShape(blocks, context)` — a pure,
  read-only, cross-workout-type checker with two invariants (no single
  exercise past the round cap outside a declared multi-round format or a
  routine pick; a Main block never silently drops to fewer than 2 exercises
  outside the same named exceptions). Wired post-hoc in
  `services/programming.ts` after `engine.generateSession()` returns —
  findings always reach the decision log via `drivers.shapeFindings`; nothing
  currently surfaces to the athlete-facing rationale (a deliberate scope
  line, not an oversight — see Consequences). It never mutates the plan,
  never throws, never blocks generation: a defense-in-depth net, not a new
  hard-safety bucket (CLAUDE.md §7's hard-safety buckets stay exactly
  avoidance/fatigue/volume).

## Consequences

| Before | After |
|---|---|
| Implicit cardio (goal-weight-derived): 1 exercise, unbounded shape | Real exercise variety, scaled by experience/duration |
| Explicit Cardio + Interval Main: always 1 exercise | Scales the same way circuit already did, unless genuinely single-focus |
| A single exercise's rounds: uncapped (~10 to ~22 observed) | Capped at 8, at the source |
| Conditioning: exposed to the identical bug | Always steady/basic unless a routine placed the pick |
| Recovery-intent/poor-readiness cardio day: unchanged volume | Measurably reduced, same as strength already does |
| Running/machine interval sessions | Still correctly single-exercise — a named, tested exception, not broken by the fix |
| A routine's deliberately interval-tagged exercise | Still runs as interval — the tag-trust exception is explicit and tested |
| Whether a generated session's shape "makes sense" | Explicitly specified and checked (`session-shape.ts`), not implicit |

**Reversible**: `volumeScale`'s default (`1`) makes every pre-existing
`cardioSets()` call site behave identically unless it opts in by passing a
value; `auditSessionShape` is additive and read-only, removable with zero
effect on generation. **Deliberate scope boundary**: `warn`-severity shape
findings are not (yet) woven into the templated, hand-crafted `rationale`
string — doing so would mean either auditing *inside* `generateSession`
(more invasive) or crudely appending a generic sentence post-hoc
(inconsistent with the rationale's hand-crafted style elsewhere). The
decision log already captures every finding for both severities; surfacing
`warn` findings to the athlete directly is a real, separate follow-up if it
turns out to be needed in practice — not silently dropped, a conscious
sequencing choice.
