# ADR-0121 — Superset / triset rationale engine

- **Status:** Accepted (v2)
- **Date:** 2026-07-24 (v2: 2026-07-28)
- **Phase:** 1 (engine revamp)

## Context
Grouping existed only for `workoutType === 'bodybuilding'`
(`applyBodybuildingStructure` + `rotationCompatible`) and paired any two exercises
that merely didn't share a muscle or a piece of fixed equipment. There was no
*reason* behind a pairing, no notion of antagonist vs. exhaust vs. time-saver, and
grouping didn't affect the time estimate — so supersets were both arbitrary and
"free but pointless." The user asked for deliberate structure: "what is it building
and why — no randomness."

Grounding: `docs/methodology/strength-set-design.md` §5.

## Decision

### Typed groups on the contract
`PlannedExercise.group?: { id; type; rationale }` where
`SupersetType = 'antagonist' | 'pre_exhaust' | 'post_exhaust' | 'time_saver'`.
`group.id` mirrors the existing `rotationGroup` string so the tracker's
round-based `flatten` and the time model keep working unchanged; `type` +
`rationale` carry the *what & why* to the prebrief and tracker.

### Relationship data (`muscle-relationships.ts`)
An antagonist muscle map (chest↔back, quads↔hamstrings, biceps↔triceps,
abs↔lower_back, …) plus a coarse pattern fallback (push↔pull, squat↔hinge) that
only applies **between two compounds** — an arm-only curl is 'pull' but isn't a
bench press's antagonist.

### Pairing engine (`supersets.ts`)
Priority-ordered passes over the strength Main block — antagonist first, then
pre/post-exhaust, then (opt-in) time-saver — so a time-saver never cannibalizes an
exercise that could anchor a better antagonist pairing:

1. **Antagonist** — opposing muscles; one recovers while the other works.
2. **Post-exhaust** — a compound then a same-muscle isolation (finish the muscle).
   **Pre-exhaust** — isolation then compound.
3. **Time-saver** — unrelated muscles paired purely for time (only when opted in).

Exercises that are equipment-incompatible, non-rep-based (planks/carries), or
**heavy low-rep main compounds** (≤6 reps, or ≤8 @ RPE ≥9) are left **straight** —
heavy work needs full rest and undivided focus.

### When it runs
Beginners stay straight (form + simplicity). For intermediate+:
- explicit `bodybuildingRotation: 'straight'` opts out;
- `'superset'`/`'triset'` opt in (triset = groupSize 3);
- otherwise auto-group **hypertrophy/general/time-efficiency** days
  (`weights.general + weights.cardio ≥ 0.3`, or a bodybuilding session). Pure
  strength/hypertrophy sessions only group when explicitly opted in.

`allowTimeSaver` is enabled only on opt-in or a time-efficiency lean, so unrelated
pairings never appear unbidden on a focused strength day.

### Time credit
Grouped exercises pay reduced shared rest (`SUPERSET_REST_FACTOR`, ADR-0120), so a
superset genuinely shortens the session estimate and the budget balancer can fit
more real work — supersets finally earn their place.

## Consequences
- Removed `applyBodybuildingStructure` / `rotationCompatible`.
- The prebrief shows each group's rationale; the tracker's round header shows the
  typed label (e.g. "ANTAGONIST SUPERSET").
- Exhaust pairs are structurally rarer than antagonist/time-saver because Main
  enforces distinct movement patterns; they surface mainly when a same-muscle
  compound + isolation are both selected. Acceptable for v1.

## Safety
Grouping never touches load, reps, or the safety envelope (ADR-0103/0106); it only
sequences already-prescribed work.

## v2 (2026-07-28) — a superset always has ≥2 members
`applySupersets` itself never forms a 1-member group — but `fitDurationToBudget`
(ADR-0120) can run afterward and pop a grouped exercise off the Main block to
hit a tight time budget, leaving its partner still tagged with a `rotationGroup`/
`group` — a "superset" of one, reported as a bug. `demoteOrphanedSupersets`
(`rules-engine.ts`) now runs as a final invariant pass over every block after
all trimming: any `rotationGroup` with fewer than 2 remaining members has its
`rotationGroup`/`group` cleared, so the survivor renders as a normal straight
set instead. This is a system-wide invariant, not a special case in the budget
fitter — any future code path that can remove a grouped exercise is covered by
the same pass automatically.
