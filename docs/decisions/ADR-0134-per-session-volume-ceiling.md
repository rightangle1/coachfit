# ADR-0134 — Per-session volume ceiling and movement redundancy

- **Status:** Accepted
- **Date:** 2026-08-06
- **Phase:** 1 (amends ADR-0104, ADR-0120, ADR-0126)

## Context

A chest-emphasis session was prescribing three push-up variants totalling ~140
reps. Investigating the report turned up three independent defects that had been
compounding, plus one that was actively misleading the athlete.

### 1. There was no per-session volume ceiling at all

ADR-0104 gave the engine weekly landmarks (MEV/MRV) and nothing else. A weekly
ceiling cannot see a single day. Measured against the real engine:

| Scenario (intermediate, 60 min, weekly MRV 16) | Chest sets | Chest reps |
| --- | --- | --- |
| `emphasisMode: 'balanced'` | 14 | 140 |
| `emphasisMode: 'priority'` | 22 | 220 |
| `priority`, warmup/conditioning/cooldown all skipped | 25 | 250 |

The last row is the perverse one: skipping blocks folds their minutes back into
Main, so *stripping a session down made it bigger*.

`MAX_SESSION_WORK_SETS` (30) never engaged — the binding constraint was the
clock, so volume was simply whatever fitted in the requested time.

### 2. The one volume brake that existed made things worse

`weeklyVolume` is computed once from completed history *before* selection
(`rules-engine.ts`), so the sets a session was currently allocating were
invisible to every volume rule. Worse, the over-MRV response trims sets *per
exercise* while exercise *count* is derived separately from duration — so
trimming freed time, freed time bought another exercise, and total volume rose.

Given 18 chest sets already logged in the week (over the 16 ceiling), the engine
produced 18 *more*, and said:

> "Trimming volume on chest, triceps — already at this week's ceiling."

Confidently wrong in the direction the athlete would trust.

### 3. Redundancy was measured at the wrong granularity

Distinctness was keyed on `movementPattern`, whose entire vocabulary for
upper-body pressing is `'push'`. Every one of the 26 chest-primary catalog
entries is `'push'`. The guard was therefore all-or-nothing, and was explicitly
disabled on the two paths that mattered (the emphasis-quota fill and the
exercise-count backfill) with the comment *"a chest day legitimately runs three
pushes"* — true of pushes, false of push-ups, and the data could not tell them
apart.

`substitutionFamily` looked like the answer but is not: it derives as
`modality:slot:primaryArea`, so push-up, dumbbell bench press and dumbbell fly
all share `strength:horizontal_push:chest`. Using it as a redundancy key would
cap a chest day at **one** exercise.

### 4. "Only chest" silently became a different workout

With every chest exercise but the push-up excluded, a `priority` chest request
returned: push-up, bodyweight squat, Romanian deadlift, forward lunge, bent-over
row, farmer's carry. Five of six exercises trained something the athlete had
explicitly declined — and the shortfall message blamed *"your equipment and
what's safe to train"* when the real cause was the athlete's own exclusion list.

### The constraint on any fix

An athlete who wants nothing but push-ups must still get them. In extreme cases
(bodyweight-only equipment, or exclusions down to a single exercise) an
all-push-up session is a legitimate, intended output — it should be discouraged,
never blocked.

## Options considered

- **Cap sets per exercise only.** Cheapest, and already present as the over-MRV
  trim. Rejected: it is exactly the mechanism that made volume go *up*, because
  it does not touch exercise count.
- **Hard "max one exercise per family" filter.** Simple and easy to test.
  Rejected: it makes the plan unfillable in precisely the scenario we must
  support, and the codebase already shows the failure mode — when distinctness
  cannot be satisfied, the emphasis quota is abandoned and filler squats appear
  on a chest day.
- **Ceiling derived as `MRV / sessionsPerWeek`.** Attractive, and the first thing
  tried. Rejected: training frequency is not reliably known. `goals.weeklyTargets`
  is usually unset, and the fallback schedule in `weekly-program.ts` can hand a
  strength-focused athlete a *single* strength session per week — which derives a
  daily ceiling *higher* than MRV itself.
- **A hard ceiling as a share of MRV, plus a graded redundancy penalty.** Chosen.

## Decision

Split the problem along the hard/soft line CLAUDE.md §7 already draws.

### The volume ceiling is a hard constraint

`session-volume.ts` owns the day. `dailySetCeiling(landmarks)` returns
`clamp(round(mrv × 0.55), 4, 10)` — derived from the weekly landmark, so it
inherits the experience and resistance-focus adjustments `volumeLandmarksFor`
already makes, with an absolute bound at both ends. For an intermediate on
general focus: **9 sets per muscle group per session.**

Nothing may exceed it: not emphasis, not workout style, not a 60-minute request,
not a live swap. Primary areas are credited fully and secondary at 0.4,
mirroring ADR-0102's fatigue accounting so all three agree what a set costs.
`headroom()` floors rather than rounds — fractional secondary credit must not let
the ceiling be crossed a fraction of a set at a time.

**The ceiling is allocated, not consumed.** The obvious implementation — let each
exercise take its full prescription until the ceiling runs out — is visibly
wrong: on a 9-set ceiling it gave the first two lifts 5 and 4 sets and dropped
the remaining three, collapsing a five-exercise block to two. `allocateDailyVolume`
instead runs two passes over the block in priority order: the first reserves a
real set block (ADR-0120, 3 sets) for as many exercises as the ceiling supports,
the second tops those up toward their full prescription. A trainer with 9 chest
sets writes three exercises of three, not two of five.

Exercises that cannot get a real block are **dropped**, never rendered as
one-set stubs. This surfaced a latent conflict with ADR-0120's 3–5 set promise:
`rxForMain` allowed 6 sets and the emphasis extra set stacked on top for 7. Both
are now clamped to `MAX_WORK_SETS`.

The duration balancer receives the ceiling and will not add a set to any exercise
whose groups are at it. Leftover time simply goes unused: **a duration request is
a ceiling on time, never a licence to exceed a volume limit.**

### Movement redundancy is a graded bias

A new `variantFamily` — `movementSlot:implement:mechanic`, derived in
`catalog/index.ts` alongside the existing enrichment. Slot fixes the movement,
implement separates bodyweight from loaded (positioning equipment like a bench
does *not* split a family), and mechanic keeps a press apart from a fly. All six
push-up variants collapse to one family; dumbbell presses and dumbbell flies are
distinct from it and from each other.

`SELECTION_WEIGHTS.FAMILY_SATURATION` (45, escalating at 0.6 per repeat,
saturating at 1) penalises repeats. It is a **penalty and never a filter**, which
is what preserves the constraint above: it competes *within* the emphasized pool
where the +100 emphasis term is constant, so it reorders which chest exercises
get picked but never lets chest lose to a muscle group the athlete didn't ask
for. When the pool holds only one family, every candidate takes the same penalty
and push-ups still win. Total volume is bounded by the ceiling, not by this.

The family tally is threaded through every selection pass via
`seedUsedFamilies`, so the emphasis-quota fill — the path that produced six
push-up variants — starts from what the previous pass already used.

### Priority emphasis means the whole session

`emphasisMode: 'priority'` now restricts the Main pool itself rather than relying
on the quota fill to displace filler afterwards (that displacement is bounded by
how much emphasized work exists, which is why squats survived on a chest-only
day). When the emphasized pool is genuinely exhausted, **the session comes back
shorter** and the rationale says so.

`balanced` is unaffected: its quota is ~half the block, so the remainder is other
muscle groups — which is what the athlete asked for by choosing "mostly".

### Swaps clamp locally and never re-plan

A swap adjusts one exercise. The ceiling is enforced by clamping only the
*incoming* exercise against the headroom left once the original's own sets are
removed from the tally. Every other exercise is untouched — asserted directly in
the tests. Because the compatibility gate already requires the same
`movementSlot` and overlapping muscles, this is a no-op in the ordinary case.

### The rationale tells the truth

- The ceiling explains itself **only when it cost the athlete something** (work
  was dropped and the session is shorter). Announcing "capped chest, triceps,
  glutes, back, quads and hamstrings" on an otherwise normal session is noise
  that teaches people to ignore the rationale.
- The emphasis-shortfall message now names the real cause, distinguishing the
  athlete's exclusion list from equipment and safety limits.
- Priority mode states plainly that it kept the session on the target area rather
  than filling time with other muscle groups.

Every ceiling event is pushed to `swaps` → `plan.adjustments`, so the decision
log (§7) records which structured input drove which trim or drop.

## Consequences

Measured after the change (same athlete and equipment as the table above):

| Scenario | Chest sets | Result |
| --- | --- | --- |
| `balanced`, 60 min | 9 | 6 exercises, 54 min, no cap message needed |
| `priority`, 60 min | 9 | 3 exercises, 32 min, explains the shortfall |
| `priority`, all other chest excluded | 9 | 3 push-up variants, 21 min |
| `priority`, only `pu-pushup` left | 6 | **Push-up alone** — the constraint holds |

- **The duration slider becomes a ceiling on time rather than a target.** This is
  the honest reading, but it is a visible UX change: asking for 60 minutes of one
  muscle group will return a shorter session. Option 3 from the design discussion
  — filling the remainder with non-volume work on the same target (mobility,
  tempo, skill work) — is deliberately **not** built here; it is the natural
  follow-up if the shortened session proves unsatisfying in use.
- `DAILY_SHARE_OF_MRV` at 0.55 means a muscle group can be trained near its
  weekly ceiling in two sessions. The weekly rules still apply on subsequent
  days, so the two interact as intended, but the constant is a judgement call and
  the first thing to revisit with real training data.
- Sets remain the unit of volume. A set of push-ups and a set of bench press
  still count the same, which understates bodyweight rep work. Making the budget
  rep- or work-aware (building on ADR-0129) is a known follow-up.
- Populating `variantFamily` did not disturb the swap gate, which keys on
  `movementSlot` — already populated, so no dormant restriction was activated.
