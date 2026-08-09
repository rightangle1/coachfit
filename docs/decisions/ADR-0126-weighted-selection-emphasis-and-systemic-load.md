# ADR-0126 — Weighted exercise selection, the emphasis quota, and systemic fatigue

- **Status:** Accepted (v1)
- **Date:** 2026-08-04
- **Phase:** 1 (engine revamp)

## Context

Three related weaknesses surfaced in the same trainer-perspective review that
produced ADR-0125. All three trace to the engine reasoning about *muscles* well
and about *the athlete over time* barely at all.

**1. Selection was a lexicographic boolean cascade.** `pick()` sorted by
emphasis → favorite → prior-work → under-MEV → fatigue. Because the first four
keys were booleans, *every* favorite outranked *every* non-favorite, absolutely.
The only counterweight was the hard distinct-`movementPattern` guard, and there
are eleven patterns — so an athlete who had favorited one exercise per pattern
received the identical session indefinitely. There was **no recency, staleness,
or last-performed term anywhere in the engine**, and in bodybuilding/sculpting
mode `hasPriorWeightedWork` actively biased *toward* what had just been done.

The deeper issue is expressive: a boolean cascade cannot represent a trade-off.
It has no way to say "a favorite, but trained yesterday, with its muscle at 0.6
fatigue, versus a fresh lift under its weekly minimum" — the first key that
differs simply wins, and everything else is unreachable.

**2. Emphasis was a ranking nudge that claimed to be more.** `targeting.emphasize`
was a sort key and never a filter, so a session could contain **zero** emphasized
exercises — if the emphasized pool was equipment-blocked or collapsed into a
single movement pattern — while `buildRationale` still printed "Emphasizing
chest." It also never moved *volume* (set count is purely the time-budget lever),
and `emphasizesArea` matched primary areas only, so a dip scored identically to a
leg curl on a chest day.

**3. Fatigue was per-muscle only.** An athlete could train six days straight with
perfectly rotated splits and accumulate no penalty at all, because no single
muscle crossed a threshold. Deloads were purely reactive (RPE spike, stalled
lift, fatigued muscle), so weeks of hard training could pass with no back-off.
Meanwhile `sessionTrainingLoad` — Foster's session-RPE × minutes — was being
computed in `metrics/endurance.ts` with **zero consumers**. Readiness was
stateless, so three consecutive terrible nights read the same as one. And the
debrief loop was open: `interpretDebrief` returned `newConstraintsSuggested`,
the screen discarded the result, and `buildAvoidance` never read debrief issues —
so a reported knee flare had no effect on tomorrow, contradicting CLAUDE.md §8.5.

References: ADR-0104 (volume landmarks), ADR-0105 (Main-block pipeline),
ADR-0106 (avoidance/targeting), ADR-0121 (supersets), ADR-0124 (full-body spread).

## Options considered

- **Add a recency tie-break to the existing comparator.** Minimal diff. Rejected:
  it lands below four boolean keys, so it can only break exact ties — precisely
  the situation the favorites problem is *not* in.
- **Randomize among near-equal candidates.** Cheap variety. Rejected: it makes
  the engine non-deterministic (against CLAUDE.md §6's whole premise), it is
  unexplainable in the rationale, and it destroys progression continuity by
  rotating the lifts that carry overload.
- **Additive weighted score, applied greedily, with an anchor/accessory split.**
  Expresses trade-offs, keeps determinism, and lets the lifts that carry
  progression stay stable while accessories rotate.

## Decision

**Selection** moves to an additive weighted score in
`src/domain/engine/selection-score.ts`, with all term weights in one auditable
table. Terms: graded emphasis (primary 1.0 / secondary 0.5 / joint 0.25), anchor
bonus, favorite bonus, graded volume deficit, compound bonus, minus peak fatigue,
volume excess, recency (`2^(−days/5)`), and pattern saturation.

- Scoring is applied **greedily** rather than as a sort, so terms depending on
  what has already been chosen (pattern saturation) actually respond as the block
  fills.
- **Hard exclusions are unchanged and applied before scoring.** `hardSafety`
  stays absolute; `hardFatigue` is still overridable only by explicit
  primary-match emphasis, still paying the existing `heavyDeload`. Scoring only
  reorders what the safety rules already allow. The substitution *messaging* the
  rationale depends on is preserved by scoring the would-be-top candidate
  including excluded ones, then reporting the swap.
- **Anchor/accessory split**: the first `MAIN_ANCHOR_COUNT` (2) picks use a
  profile that damps recency almost to zero and rewards a known progression
  baseline; later picks rotate. You cannot run progressive overload on a lift you
  meet once a month, so variety is deliberately *not* applied uniformly.

**Emphasis** becomes a guaranteed minimum share, not a nudge.
`SessionTargeting.emphasisMode` (`'balanced'` default | `'priority'`) sets the
quota: about half the Main block, or the whole of it. The quota is filled by a
dedicated pass with `requireDistinctPattern: false` — a chest day legitimately
runs three pushes, and that guard was the most common reason the quota was
unfillable; the soft pattern-saturation term still spreads the picks. Emphasized
exercises earn **+1 set** (unless anything says to back off), are marked
`PlannedExercise.emphasized`, and are the *last* thing `fitDurationToBudget`
drops. **When the quota cannot be met, `buildRationale` says so** — a plan that
under-delivers while announcing the opposite is worse than one that admits the
constraint.

**Systemic load** arrives in `src/domain/engine/systemic-load.ts`: consecutive
training days, a rolling 4-week Foster-load trend driving a **proactive** deload
after three consecutive rising weeks, and readiness memory across recent
sessions (which required persisting `readiness` onto the plan and record).
Session-ending is read **conjunctively**: `endedEarly` alone is not evidence the
prescription was too much — running out of time is at least as common as running
out of gas — so a new `endedEarlyReason` must say `'too_hard'` *and* sets must
actually have been skipped. A time-driven finish never touches volume.

**The debrief loop closes** via `src/domain/engine/debrief-feedback.ts`, which
needs no new storage: `debrief.issues` is already persisted on every record and
the engine already receives history, so the loop closes by *reading* what is
there. Severity decays — severe blocks its area for 3 days, softens to a de-load
for 7, then is forgotten.

Two safety-adjacent fixes landed alongside: fatigue is now clamped **once after
accumulation** rather than inside the loop (which made results depend on history
order and made a 20-set day indistinguishable from a 10-set one), and
`fitDurationToBudget`'s under-budget fill **skips de-loaded exercises**, which
previously targeted them every time precisely *because* they had the fewest sets
— quietly undoing the safety decision that cut them.

## Consequences

**Easier.** The engine can now express judgment rather than precedence, and the
weights are in one table to tune. Sessions rotate without losing the lifts
progression accumulates on. "Train shoulders today" is honoured or honestly
declined. Six-day weeks and multi-week build-ups finally cost something.

**Harder.** Selection is O(n·count) instead of one sort — irrelevant at 364
exercises and ≤8 picks, but no longer free. The weights are taste encoded as
numbers, and taste needs revisiting as real sessions accumulate; the decision log
(CLAUDE.md §7) is the intended evidence base. Compound-first ordering
**deliberately supersedes ADR-0124's region interleaving**: that interleave
existed so end-trimming couldn't erase a region, but ordering by mechanic solves
it better — when a session must lose work, a trainer drops the isolation
exercise, not the squat.

**Reversibility.** Moderate. `selection-score.ts` is a pure, isolated module;
reverting means restoring the comparator in `pick()`. `emphasisMode`,
`emphasized`, `deloaded`, `readiness`, and `endedEarlyReason` are all optional
additive fields needing no migration. The systemic and debrief-feedback modules
are additive multipliers/inputs and can be neutralized by returning their
identity values.
