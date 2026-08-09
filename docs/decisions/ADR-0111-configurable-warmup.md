# ADR-0111 — Configurable warmup & stretching focus

- **Status:** Accepted (v1)
- **Date:** 2026-07-22
- **Phase:** 1

## Context
Warmup/stretching was a single hardcoded exercise for a fixed 5 minutes,
regardless of the user's goals or preferences — thin relative to CLAUDE.md's
mobility/flexibility modality, and not configurable at all.

## Decision
**Warmup preference lives on the athlete profile** (a standing preference, like
experience/goals — edited in the same "Edit profile & goals" screen), not a
per-day prebrief control:

```ts
interface WarmupPreferences {
  totalMinutes: number;   // total warmup/stretch block time
  activityCount: number;  // preferred variety of drills
  focus: BodyArea[];      // areas to bias selection toward (muscle-group level)
}
```

Defaults (`{ totalMinutes: 5, activityCount: 1, focus: [] }`) exactly reproduce
prior behavior when unset — fully backward compatible.

**Session generation** (`RulesEngine.generateSession`) uses `activityCount` as
a variety preference, then builds a compact circuit of 2–3 exercises repeated
for 2–4 rounds. It distributes `totalMinutes × 60` across those rounds,
clamped to a 20s floor per hold, and biases selection toward `focus` areas using the same
`emphasizesArea` primary-tier matching Main-block emphasis already uses — so
`focus` must be expressed as muscle-group areas (`{ group: 'hamstrings' }`), not
joint tags, to actually drive the bias (joint-tag matches are a weaker tier that
`emphasizesArea` doesn't count — see `domain/engine/matching.ts`).

**Selection constraint relaxed for warmup only:** `pick()` gained a
`requireDistinctPattern` flag (default `true`, preserving existing Main/
Conditioning behavior). Nearly all stretch exercises share `movementPattern:
'stretch'`, so the existing "distinct movement pattern per pick" rule — correct
for avoiding two squat variants back to back — would have capped warmup at a
single exercise regardless of `activityCount`. Warmup passes `false`.

**Catalog expanded** from 2 to 8 mobility/stretch exercises spanning hips,
hamstrings, shoulders, upper back/spine, neck, and ankles, so `focus` and
`activityCount` have real variety to draw from.

## Consequences
- Fully backward compatible — profiles without `warmup` set behave exactly as
  before.
- One settings surface (profile), not a new per-day control — keeps Today's
  prebrief from growing unbounded; revisit if daily variation turns out to matter.
- The `requireDistinctPattern` relaxation is scoped to the warmup call site only;
  Main/Conditioning keep their movement-pattern variety guarantee.

## v2 — compact repeated warmup circuit
The old time-filling rule could expand a five-minute warmup into five separate
one-set drills. The engine now favors a familiar 2–3 drill circuit with 2–4
rounds per drill, preserving total time and short holds without a long setup list.
