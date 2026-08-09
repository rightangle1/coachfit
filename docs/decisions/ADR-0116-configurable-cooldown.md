# ADR-0116 — Configurable cool-down

- **Status:** Accepted (v1)
- **Date:** 2026-07-24
- **Phase:** 1

## Context
Sessions opened with a Warmup block (ADR-0111) but never closed one out —
nothing brought the athlete back down after Main/Conditioning. The catalog
already had a `flowStage: 'cooldown'` pool (static stretches + foam-rolling,
gated behind `yoga_mat`/`foam_roller` equipment) used only by 'stretch'/'yoga'
flow sessions (ADR-0114), unused by the ordinary strength/cardio/bodyweight/
bodybuilding path.

## Decision
**Cool-down preference lives on the athlete profile**, mirroring
`WarmupPreferences` exactly:

```ts
interface CooldownPreferences {
  totalMinutes: number;   // total cool-down block time
  activityCount: number;  // preferred variety of stretches/foam-roll activities
  focus: BodyArea[];      // areas to bias selection toward
}
```

Default (`{ totalMinutes: 5, activityCount: 1, focus: [] }`) — unlike Warmup,
there is no prior behavior to preserve, so this ships on by default: every
non-flow session now closes with a compact repeated cool-down circuit unless
the athlete changes or disables it.

**Session generation** appends a `Cool down` block after Main/Conditioning
(non-'stretch'/'yoga' `workoutType`s only — those flow sessions already end
on a `cooldown`-stage pose as part of their ordered sequence, ADR-0114). It
draws from `available.filter(e => e.flowStage === 'cooldown')` — the same
equipment-gated pool flows already use — via `pick()` with
`requireDistinctPattern: false` (ADR-0111's relaxation applies here too, since
stretches and foam-rolling both mostly share `movementPattern: 'stretch'`).
`activityCount` guides movement variety; the engine favors a 2–3 movement circuit
repeated for 2–4 rounds, with every hold kept in its established range.

If no cooldown-stage exercise is available (e.g. no yoga mat or foam roller
owned), the block is simply omitted — same graceful-empty behavior as every
other `pick()`-driven block.

**Duration budget:** `Cool down` is added to `fitDurationToBudget`'s
protected-from-exercise-trimming set alongside `Warmup` — under a tight time
budget the engine compresses hold durations proportionally (like it already
does for warmup/cardio/flow) rather than dropping the block outright.

**UI:** a "Cool down your way" section mirrors "Warm up your way" in the
profile/onboarding form (same duration/count presets, same
`STRETCH_FOCUS_OPTIONS` reused for focus).

## Consequences
- Every session now has a closing block by default — no opt-in step, matching
  CLAUDE.md's "wraps each session" framing and the existing Warmup precedent.
- No catalog changes needed — the `flowStage: 'cooldown'` pool built for
  ADR-0114 flow sessions was already the right shape (mix of stretches and
  foam-rolling); this ADR just adds a second consumer.
- Athletes without a yoga mat or foam roller get no cool-down block today,
  since every cooldown-stage exercise currently requires one of those two.
  Revisit if that gap matters — e.g. adding bodyweight-only cooldown stretches.

## v2 — compact repeated cooldown circuit
Rather than filling time with many one-set cooldown cards, the engine now
prefers 2–3 stretches/rolls repeated for 2–4 rounds each. This preserves a
calm, practical finish without creating a single multi-minute hold.
