# The Programming Engine — design, logic, and decisions

The complete reference for how CoachFit decides what you train today. It covers
the module map, the session pipeline in execution order, every subsystem with its
real constants, the safety envelope, and the decisions (and defects) from the
engine revamp.

Companion to [strength-set-design.md](./strength-set-design.md), which holds the
training *methodology* this implements, and to the ADRs in
[../decisions/](../decisions/), which hold individual boundary calls. When the
numbers here change, change them in the same PR so the rationale stays
recoverable.

**Scope note.** Everything below is deterministic, offline, and pure. There is no
model, no network call, and no LLM anywhere in this path (CLAUDE.md §3/§6).
"Trainer nuance" comes from structured inputs the rules act on.

---

## 1. Architecture

The UI only ever calls the `ProgrammingEngine` interface
(`src/domain/engine/programming-engine.ts`) — never a rules module directly. This
is the reversibility anchor from CLAUDE.md §5, and `RulesEngine` is its only
implementation.

```
UI  →  services/programming.ts  →  ProgrammingEngine  →  RulesEngine
             (decision log)                                  ├─ selection-score
                                                             ├─ training-zone
                                                             ├─ progression
                                                             ├─ load-finalization
                                                             ├─ fatigue / systemic-load
                                                             ├─ readiness
                                                             ├─ layoff
                                                             ├─ weekly-program
                                                             ├─ debrief-feedback
                                                             ├─ matching / mechanic
                                                             ├─ timing / intensity
                                                             └─ supersets
```

Every call to `generateSession` / `adjustDuringSession` / `interpretDebrief` is
written to the decision log with its full input context and the drivers that moved
it (CLAUDE.md §7).

### Module responsibilities

| Module | Owns |
|---|---|
| `rules-engine.ts` | The pipeline. Block assembly, prescription, rationale, time budget |
| `selection-score.ts` | *Which* exercises — weighted score, anchors, session ordering |
| `training-zone.ts` | *What kind of work* — strength / hypertrophy / endurance rotation |
| `progression.ts` | Load and reps over time — double progression, safety caps |
| `load-finalization.ts` | Today's adjustment to a load — reductions only |
| `fatigue.ts` | Per-muscle fatigue from history, with decay |
| `systemic-load.ts` | Whole-athlete fatigue — streaks, load trend, proactive deload |
| `readiness.ts` | Today's self-report → volume and load multipliers |
| `layoff.ts` | Return-to-training ramp after time away |
| `debrief-feedback.ts` | Yesterday's reported issues → today's avoidance |
| `matching.ts` | How a body area relates to an exercise; equipment gating |
| `timing.ts` | The real time model — work, rest, transitions |
| `intensity.ts` | Per-exercise systemic cost (MET / load demand) |
| `supersets.ts` | Typed, explainable pairing |
| `weekly-program.ts` | Six-week stable weekly intent: modalities, slots, priorities, set ranges, anchors |

---

## 2. The session pipeline

`RulesEngine.generateSession(input: SessionContext) → SessionPlan`, in order:

1. **Build the avoidance model** — pain/injury is hard; calculated local fatigue
   is a soft recovery/selection signal unless athlete feedback corroborates it.
2. **Volume state** — maximum of ISO program-week and rolling seven-day credited
   work, using goal/experience-specific starting landmarks.
3. **Normalize goal weights**; resolve which optional blocks are included.
4. **Baseline prescription** from experience and the duration lever.
5. **Day modifiers** — readiness, training intent, layoff ramp, systemic load →
   a single `volumeScale`.
6. **Filter the pool** by owned equipment and exclusions.
7. **Resolve weekly intent** — modality, movement slots, priority muscles,
   target set range, and stable anchors for the current session in a six-week block.
8. **Select the Main block** — weighted score, anchors, emphasis quota (§4).
9. **Assign the declared resistance working zone**; optionally place a
   milestone/calibration test when the athlete has configured max-day testing (§5).
10. **Order the block** — tests, explicit priorities/weekly anchors, compounds,
    then isolation.
11. **Prescribe each exercise** — aggregate-work double progression inside the zone's rep band,
    then load finalization, then snap to owned weights (§6).
12. **Add exercise-specific ramp sets** to regular heavy compounds; apply
    supersets, then materialize any opt-in test sets.
13. **Build warm-up and cool-down**, biased to what Main actually trained.
14. **Fit the time budget** — trim or extend in whole set-blocks (§10).
15. **Annotate rest**, calibrate estimated duration from recent actuals, and
    build the rationale plus structured reason codes.

Flow sessions (`stretch` / `yoga`) replace steps 7–13 with a dedicated flow
builder and deliberately bypass the budget balancer, deriving structure from
rounds instead.

---

## 3. Signals the engine reads

| Signal | Source | What it moves |
|---|---|---|
| Goals (modality weights) | Profile | Which modality leads and weekly allocation |
| `resistanceFocus` | Profile | Regular resistance zone: general / max strength / hypertrophy / endurance / power |
| Experience | Profile | Set counts, exercise counts, base RPE, whether testing happens at all |
| Age (`birthYear`) | Profile, optional | Fatigue half-life, warm-up floor, max-day gating |
| Equipment + owned weights | Profile | Hard pool filter; every recommended load |
| Session history | Records | Progression, zones, fatigue, volume, recency, layoff |
| Readiness (sleep / energy / soreness) | Prebrief | Volume and load multipliers; blocks testing |
| Training intent | Prebrief | RPE shift and volume scale |
| Emphasis + `emphasisMode` | Prebrief | Guaranteed share of the Main block; extra set |
| Avoid-today flags | Prebrief | Hard exclusion or de-load |
| Standing constraints | Profile | Hard exclusion or de-load |
| Debrief issues | Last few records | Time-decaying avoidance |
| Session length | Prebrief | Exercise count and sets — **never the physiological zone** |
| Enjoyment / would-do-again | Debrief | Small preference tiebreak after safety and program intent |

Sex and height are **metrics-only** and are barred from this path by a test
(ADR-0127).

---

## 4. Exercise selection

An **additive weighted score**, applied greedily so that terms depending on what
has already been chosen actually respond as the block fills.

```
score = W_EMPHASIS  × emphasisMatch     (primary 1.0 / secondary 0.5 / joint 0.25)
      + W_ANCHOR    × hasProgressionBasis
      + W_FAVORITE  × isFavorite
      + W_MEV       × volumeDeficit     (graded by how far under MEV)
      + W_COMPOUND  × isCompound
      + W_ENJOYMENT × learnedSessionPreference
      − W_FATIGUE   × peakFatigue
      − W_MRV       × volumeExcess
      − W_RECENCY   × 2^(−daysSince/5)
      − W_PATTERN   × patternSaturation
      − W_FAMILY    × variantFamilySaturation
```

| Weight | Value |
|---|---|
| `EMPHASIS` | 100 |
| `ANCHOR` | 30 |
| `FAVORITE` | 25 |
| `VOLUME_DEFICIT` | 20 |
| `COMPOUND` | 8 |
| `FATIGUE` | −40 |
| `VOLUME_EXCESS` | −35 |
| `RECENCY` | −45 (half-life 5 days) |
| `PATTERN_SATURATION` | −30 |
| `FAMILY_SATURATION` | −45 (0.6 per repeat, saturating at 1) |
| `ENJOYMENT` | ±12 maximum |

**Anchor vs accessory.** The first `MAIN_ANCHOR_COUNT = 2` picks use a profile
that damps recency to 0.15× and rewards a known load baseline; later picks rotate
freely. You cannot run progressive overload on a lift you meet once a month, so
variety is deliberately *not* uniform.

**Emphasis is a quota, not a nudge.** `balanced` (default) guarantees ~half the
Main block (floor 2) trains an emphasized area; `priority` restricts the Main pool
to emphasized work entirely. The quota pass relaxes the distinct-pattern rule — a
chest day legitimately runs three pushes, though not three push-ups, which is what
the family term (§11) is for. Emphasized exercises earn **+1 set** (clamped to
`MAX_WORK_SETS`) and are the *last* thing the budget balancer drops. **When the
quota cannot be met, the rationale says so** — naming the real cause, and
distinguishing the athlete's own exclusion list from equipment and safety limits.

**`priority` never changes the subject.** Restricting the pool means the block can
run short of its exercise count, and it is left short: the session returns with
fewer exercises rather than padded with muscle groups the athlete declined. A
"chest only" request previously came back as one push-up followed by squats,
deadlifts, lunges and a carry.

**Ordering.** Tests first, then explicit priorities and weekly anchors, then
compounds by descending `loadDemand`, then isolation. Stable among equals.

---

## 5. Training zones

Each exercise is trained in a working zone selected from the explicit
`TrainingGoals.resistanceFocus`. Bodybuilding and sculpting remain structural
preferences; neither is treated as evidence of a physiological outcome.

| Zone | Reps | Working RPE | Rest tier (falls out of reps) |
|---|---|---|---|
| `strength` | 4–6 | 8 | `HEAVY_COMPOUND` 165 s |
| `hypertrophy` | 8–12 | 7 | 90 s compound / 50 s isolation |
| `endurance` | 15–20 | 7 | 90 s compound / 50 s isolation |
| `power` | 3–5 | 6 | `HEAVY_COMPOUND`; crisp reps, stopped well before grind |

`general` defaults to hypertrophy. `max_strength`, `hypertrophy`,
`muscular_endurance`, and `power` map directly to their regular zones. Heavy
strength work is therefore ordinary training for a strength athlete rather than
hypertrophy work interrupted by an automatic test.

### Optional calibration cadence — exposures, not days

"Test this group every N times you train it" tracks adaptation directly and makes
training frequency fall out for free.

| Experience | Strength | Endurance | Min days | Max days |
|---|---|---|---|---|
| beginner | — | — | — | — |
| intermediate | 6 exposures | 8 | 10 | 28 |
| advanced | 8 exposures | 10 | 12 | 35 |

- **Beginners never test.** An RPE-9 AMRAP is a poor trade against still-forming
  technique, and double progression already moves their loads.
- **Advanced test *less*, not more** — slow-moving e1RM, higher recovery cost.
- `minDays` floors a high-frequency trainee; `maxDays` ceilings a once-a-week one.
- Sessions under **30 min** never test; **50 min+** may carry both.
- Tests are disabled unless `AthleteProfile.maxDay` is configured. Ordinary
  working-set performance is the primary calibration path.
- Recovery intent, systemic deload, unresolved pain/avoidance, severe soreness,
  poor energy, or poor sleep blocks all tests.

Due when `exposures ≥ cadence OR days ≥ maxDays`, always subject to
`days ≥ minDays`.

**Goal bias** multiplies the exposure counts (`<1` = sooner). Goals compare
`strength` vs `cardio` **pairwise**, with `general` and `mobility` neutral —
comparing the top goal against all others dilutes the signal to nothing, since a
single dominant goal only reaches ≈0.38 of a normalized four-way split. Clamped to
about ±30%. Workout style does not bias physiology. Cardio / stretch / yoga still
disable strength testing because the test does not belong in those sessions.

### The clock runs per muscle group

Selection deliberately rotates exercises, which pushes any single lift weeks into
the past. A per-exercise clock would leave every lift permanently "overdue" and
cluster tests onto whichever one resurfaced. The group's clock decides *when*; the
specific lift is the tiebreak.

### Test sets

A configured milestone test is a ramp plus an AMRAP marked `isCalibration`:

- **Strength** — 50% × 8, 75% × 3, then `range.min` reps at 1.1× working load,
  RPE 9. Requires a known load to ramp from.
- **Endurance** — one light ramp, then rep out at the working load. Works on
  bodyweight movements too.
- **Never on timed work** — "as many reps as you can" is meaningless for a carry.

At most one of each per session, never both on the same muscle group. Regular
heavy compound working sets receive their own 50% × 8 and 75% × 3 ramp sets even
when no test is scheduled.

### Within-session cascade

Once a group takes a test, other exercises hitting that group move to lighter,
higher-rep work and carry the de-load. Fatigue is derived from *history*, before
the session — this is the one place the engine accounts for damage it is about to
inflict in the same workout.

---

## 6. Progression

### Aggregate-work double progression

Progression reasons from every prescribed working set in the latest exercise
session. Warm-ups and calibration sets are excluded. Individual sets remain
evidence about distribution, effort, pain, and technique; total productive work
is the primary progression signal.

```
loaded reps:     work = Σ(weight × reps)
unloaded reps:   work = Σ(reps)
loaded duration: work = Σ(weight × duration)
unloaded time:   work = Σ(duration)

workCompletionRatio = performedWork / prescribedWork
equivalentRepsPerPlannedSet = comparable-load total reps / prescribed working sets
```

| Situation | Response |
|---|---|
| No history | Start mid-band; athlete logs the load |
| Aggregate work ≥100%, below band top | Rebalance across planned sets, then +1 rep/set (+2 if clearly easy) |
| Aggregate reaches band top | Step only when the minimum increment is plausible from e1RM |
| Aggregate work <100% | Repeat the planned per-set ask; do not infer a deload |
| Ground out (RPE ≥ target + 2) | −10% load, reps to `min` |
| Pain or form breakdown | Record achievement, block load increase, preserve/redistribute work |
| Work done below planned load | Proportional credit; repeat planned load before increasing it |
| Zone changed | Reconcile load via Epley e1RM |
| Last set was a test | Convert the AMRAP to a working load (below) |
| Nothing heavier owned / increment not plausible | Keep climbing reps, up to band + 4 |

**Required examples.** `2 × 10` prescribed and `20 + skipped` at the planned
load is 100% work: the next prescription is conservatively rebalanced to
`2 × 11`. `3 × 10` and only 20 total reps is 67% and does not progress.
`3 × 10` performed as `12, 10, 8` is 100% and may progress despite the final
set being below ten. A time-driven skip is adherence/duration evidence, not
overreaching.

**Effort is read conservatively.** The tracker pre-fills each set's RPE with the
target, so a logged RPE *equal to* what was prescribed carries no information — it
is indistinguishable from an untouched default. The rep evidence decides instead.
This is why progression works for athletes who never engage with RPE at all.

**Converting a test to a working load.** Epley to an estimated 1RM, back down to
the target rep count, then discounted by the RPE gap between an all-out test and a
working set (~2.5% of load per RPE point). Converting rep count alone is a no-op
when test reps equal target reps — the effort buffer is what makes it correct.
Capped against the session's *working* weight, never the test weight.

### Safety caps

| Cap | Value | Notes |
|---|---|---|
| Session load increase | +10% | `MAX_SESSION_LOAD_INCREASE_PCT` |
| Weekly load increase | +15% | vs. previous ISO week's best **working** load |
| Deload magnitude | −10% | Clear RPE grind-out; never a plateau alone |
| Minimum increment allowance | conditional | Candidate e1RM at reset reps must be within 4% of achieved e1RM |

**Large minimum increments require proof.** A percentage cap is the wrong
instrument for a light lift, but reduced volume-load after a rep reset is not
proof by itself. A candidate is allowed only when its estimated strength at the
reset reps is within 4% of the achieved performance. Otherwise the engine holds
load and permits up to four evidence-building reps above the band.

Loads always snap **down** to what the athlete actually owns, so a capped
recommendation can never round up past its cap.

### Return-to-training ramp

Keys off the most recent gap longer than `GRACE_DAYS = 10`, easing **volume harder
than load** (connective tissue and work capacity fall off faster than strength).
Deepest cuts: 25% load, 35% volume, on a square-rooted curve so the early weeks —
where the practical risk is — actually move. Fades by session: full ramp on the
first back, half on the second, gone by the third.

---

## 7. The safety envelope

These are hard constraints (CLAUDE.md §7). Nothing overrides them — not emphasis,
not `priority` mode, not a goal, not the time budget.

| Bucket | Sources | Effect |
|---|---|---|
| `hardSafety` | Severe day-of flags, `severity: 'avoid'` constraints, `targeting.avoid`, recent severe debrief issues | **Absolute exclusion.** Substitute if possible, else skip and say so |
| Calculated fatigue | History-derived local fatigue | **Soft** ranking/recovery signal; never a hard exclusion by itself |
| `limit` | Mild/moderate flags, `limit`/`caution` constraints, recent debrief issues | De-load (−1 set, −1 RPE) |
| `recovery` | Muscle at fatigue ≥0.35, including severe calculated fatigue | De-load hard-set count |
| Over-volume | At/above individualized MRV in either program week or rolling seven days | De-load |

Two structural guarantees reinforce this:

- **The budget balancer never adds sets back to a de-loaded exercise.** It used to
  target them *every time*, precisely because they had the fewest sets — quietly
  undoing the safety decision that cut them.
- **Superset grouping trims to the shortest member**, so pairing can't undo a
  de-load either.

Scoring only ever *reorders* what these filters already allow. Nothing in
selection can rescue an excluded exercise, and nothing can reject an allowed one.

### Live adjustments and substitutions

- `pain` empties the affected exercise's remaining prescription and records body
  area, severity, symptom type, and `pain_stop` reason code.
- `too_hard` changes load first when loaded (−10%); otherwise reps (−1, floor 1)
  or duration (−10 s, floor 10). It never raises any variable: a four-rep set
  becomes three, never five.
- `too_easy` changes exactly one variable: +1 rep within the current zone, or
  +5 s for timed work.
- `time_short` drops cool-down/conditioning and non-priority accessories/sets in
  that order; emphasized work survives first.
- `skip` removes the exercise and repairs orphaned supersets, rest, and duration.
- A replacement must share modality, specific movement slot, and target muscles;
  then pass equipment, exclusion, avoidance, prerequisite, and difficulty gates.
  It is prescribed from its own history. With no baseline, its load is unset.
  The replaced exercise's weight is never transferred.

Every accepted or rejected live decision recomputes group/rest/time and appends a
structured reason code plus human rationale to `SessionPlan.liveAdjustments`.

---

## 8. Fatigue and recovery

### Per-muscle

Each completed working set contributes a decaying impulse:

```
contribution = SET_LOAD × effort × workFactor × groupMultiplier × intensity
score        = Σ contribution × 2^(−hoursSince / halfLife)      [clamped once, at the end]
```

| Constant | Value |
|---|---|
| `SET_LOAD` | 0.13 per average set |
| `SECONDARY_CREDIT` | 0.4 |
| `NORMAL_HALF_LIFE_HOURS` | 48 (× age factor) |
| `MAX_DAY_HALF_LIFE_HOURS` | 60 (× age factor) |
| `RECOVERING` / `FATIGUED` | 0.35 / 0.7 |

Age scales the half-life: <30 ×0.9, 30s ×1.0, 40s ×1.1, 50s ×1.25, 60+ ×1.4 —
conservative direction only, and only when the athlete supplied a birth year.

**Warm-up ramp sets are excluded.** They are preparation, not stimulus; counting
them would inflate a tested muscle by ~2 sets, falsely pushing it toward MRV.

**The clamp is applied once, after accumulation.** Clamping inside the loop made
results depend on the order history arrived in and made a 20-set day
indistinguishable from a 10-set one.

### Systemic

Per-muscle fatigue cannot see a well-rotated six-day week. This can:

| Signal | Threshold | Cut |
|---|---|---|
| Consecutive training days | > 5 | 6% per extra day |
| Rising weekly load (Foster RPE × min) | 3 consecutive weeks **plus** repeated rough readiness or overreach | 20% deload |
| Rough check-ins in last 5 days | > 2 | 5% per extra day |
| Ended early *and* skipped sets | conjunctive | 8% each |

Capped at 30% total. Reductions only. A rising trend by itself and a flat
volume-load trend by itself never trigger a deload. Recovery/deload reductions
primarily remove hard sets (and can shorten the session) instead of disguising a
recovery day as the same number of slightly shorter sets.

**Why ending early is conjunctive.** `endedEarly` alone is not evidence the
prescription was too much — running out of time is at least as common as running
out of gas. Both halves are required: the athlete said it was too hard *and* sets
actually went unfinished. A time-driven finish never touches volume.

---

## 9. Readiness

Graded per signal, summed, then applied to two axes. **Never raises anything** — a
good day is earned through performance, not a self-report.

| Signal | Values the prebrief emits | Penalty |
|---|---|---|
| Energy | Low 2 / Okay 3 / Great 4 | .05 / 0 / 0 |
| Soreness | None 1 / Some 3 / A lot 4 | 0 / .02 / .05 |
| Sleep | Low 2 / Okay 3 / Great 4 | .04 / 0 / 0 |

Volume axis caps at −30% (scale ×2); load axis at −10%. A neutral day is exactly
unchanged. Past a summed penalty of 0.12 the rationale *offers* a recovery session
— user-confirmed, never silently substituted.

The bands are calibrated against what the UI can actually emit. They previously
were not, so the grimmest reportable check-in cost ~8% of reps against a 30%
design ceiling.

---

## 10. Time model and the budget balancer

Session length is modelled properly, not estimated by set count.

| Constant | Value |
|---|---|
| Rep work | `reps × 3 s` (minimum 3 s); timed work uses actual duration |
| `REST.HEAVY_COMPOUND` | 165 s |
| `REST.HYPERTROPHY_COMPOUND` | 90 s |
| `REST.ISOLATION` | 50 s |
| `REST.CORE_MOBILITY` / `WARMUP` | 15 s |
| `SUPERSET_REST_FACTOR` | 0.55 |
| Transitions | 10 s mobility → 45 s barbell/rack |

Rest is scaled by a per-exercise intensity factor in [0.85, 1.15].

**Over budget**, in order: trim a work set toward the soft floor of 4 → drop a
whole Main exercise (non-emphasized first) → trim to the true floor of 3 →
compress discretionary timed holds → only then ease warm-up/cool-down holds, never
below 45 s. Warm-up ramp sets are never removed; reps and weights are never
touched here.

**Under budget**: clone work sets onto the leanest *non-de-loaded* lift, up to
`MAX_WORK_SETS = 5` per exercise and `MAX_SESSION_WORK_SETS = 30` per session —
and never onto an exercise whose muscle groups sit at the per-session ceiling
(§11). When nothing may legally take another set, leftover time goes unused and
the session returns shorter than requested. A duration request is a ceiling on
time, never a licence to exceed a volume limit.

**Duration buys volume, never reps.** Session length scales exercise count and
sets. It does *not* touch the rep band — that belongs to the zone.

The estimate is calibrated by the median actual/planned ratio from the last
eight sessions that stored both values, ignoring ratios outside 0.5–2.0 and
clamping the applied factor to 0.85–1.15.

| Duration constant | Value |
|---|---|
| Baseline / min / max | 30 / 10 / 60 min |
| Budget tolerance | 1.05 |
| Main exercise count (base, by experience) | 3 / 4 / 5 |
| Bodybuilding count | 3 / 5 / 6 |
| Sculpting count | 4 / 6 / 7 |

---

## 11. Volume landmarks

There is no universal 10/20 prescription. Starting landmarks by experience are
6/12 (beginner), 8/16 (intermediate), and 10/20 (advanced), then shifted by
resistance focus: max strength −2/−3, hypertrophy +1/+2, muscular endurance
−1/0, power −3/−5, general 0/0. Two or more rough sessions in the last 21 days
reduce MRV by two sets. MRV always remains at least four sets above MEV.

Primary muscles receive 1.0 credit and secondary muscles 0.4. Warm-ups,
calibration, skipped, and incomplete sets receive no credit. The engine checks
both the ISO program week and a rolling seven-day window, using the larger value
so Monday cannot erase weekend work.

### Per-session ceiling (ADR-0134)

Weekly landmarks cannot see a single day, so a chest-emphasis session could
prescribe 22 chest sets against a weekly MRV of 16 and report itself as within
limits. A **hard per-session ceiling** now bounds each muscle group:

```
dailyCeiling = clamp(round(MRV × 0.55), 4, 10)
```

Derived from the weekly landmark, so it inherits the experience and
resistance-focus adjustments above. Intermediate on general focus → **9 sets per
muscle group per session.** Nothing may exceed it — not emphasis, not workout
style, not session length, not a live swap.

The ceiling is **allocated, not consumed**. Two passes run over the Main block in
priority order (tests, then compounds, emphasized ahead of filler): the first
reserves a real 3-set block for as many exercises as the ceiling supports, the
second tops those up toward their full prescription. An exercise that cannot get
a real block is **dropped**, never rendered as a one-set stub. With 9 chest sets
to spend, that is three exercises of three — not two of five with three dropped.

Secondary credit is 0.4 here too, and headroom is **floored** rather than
rounded: fractional assistance credit must not let the ceiling be crossed a
fraction of a set at a time.

### Movement redundancy

`variantFamily` (`movementSlot:implement:mechanic`) is the redundancy key —
deliberately narrower than `substitutionFamily`, which answers "what can replace
what" and lumps push-up, dumbbell bench press and dumbbell fly into one group.
All six push-up variants share a family; presses and flies do not; a bench
positions the body and does not split a family.

The family term is a **penalty, never a filter.** It competes within the
emphasized pool, where the +100 emphasis term is constant, so it reorders which
chest exercises get picked but never lets chest lose to a muscle group the
athlete didn't ask for. When only one family is available — bodyweight-only, or
the athlete excluded the alternatives — every candidate takes the same penalty
and push-ups still win. An all-push-up session stays a reachable, intended
output; total volume is bounded by the ceiling, not by this.

Volume need is **graded by deficit**, not a boolean. On a Friday, rear delts at 4
sets should outrank lats at 9 — a flag treats them as equal.

---

## 12. The feedback loops

| Loop | Mechanism |
|---|---|
| Performance → next load | `prescribedReps`/`prescribedRpe` frozen on each record; double progression reads them |
| Aggregate work → next structure | Work ratio and equivalent reps redistribute achieved work across intended sets |
| Debrief issue → next session | `debrief.issues` read straight from history — severe blocks its area 3 days, softens to a de-load for 7, then forgotten |
| Test → working loads | AMRAP converted via e1RM + effort buffer |
| Sessions → zone rotation | `prescribedZone` recorded per set, read back as the group's clock |
| Load trend + recovery → deload | Foster session load must be corroborated by rough readiness/overreach |
| Cardio → next cardio | Successful exposures cycle one axis: steady duration/distance/pace/RPE; intervals rounds/work duration/recovery ratio/RPE |
| Actual time → estimates | Last eight actual/planned duration ratios calibrate the model |
| Enjoyment/adherence → selection | 1–5 enjoyment and would-do-again produce a small tiebreak after safety and intent |
| Decision → audit | Structured reason codes stored before prose explanations |

Records predating any of these fields degrade gracefully to the previous behavior
rather than failing.

### Weekly program layer

`buildWeeklyProgram` creates a stable six-week boundary (inside the requested
4–8-week range). It allocates the expected sessions across modality targets or,
when none are supplied, goal weights. Each session carries specific movement
slots, explicit priority muscles, experience-based target set ranges, and up to
two stable anchor exercises with existing progression baselines preferred.

The current session index is the number of completed sessions in the program
week. Missing a day does not change a later session's target range or cram the
missed work forward. Daily readiness may reduce today's prescription without
mutating the remaining weekly intent. Power focus places a power slot first;
mobility weeks include a balance slot.

---

## 13. Key decisions from the engine revamp

Full reasoning lives in the ADRs; this is the index.

### ADR-0125 — Double progression, RPE-free signals, layoff ramp

- Rep *ranges* replace fixed rep targets; load steps only when the top is earned.
- One minimum increment is always allowed once earned — the rep reset is what
  makes it safe, not the percentage.
- Prescribed values are frozen on the record, because the tracker pre-fills logged
  values and the two are otherwise indistinguishable.
- Return-to-training ramp; weekly load ceiling (CLAUDE.md §6 had specified one,
  but only a session cap existed).

### ADR-0126 — Weighted selection, emphasis quota, systemic fatigue

- Additive score replaces a lexicographic boolean cascade, which could not express
  a trade-off — the first differing flag simply won.
- Anchors stay stable so progression stays measurable; accessories rotate.
- Emphasis becomes a guaranteed share and moves volume; the rationale admits when
  it can't be met.
- Systemic fatigue, proactive deloads, and the closed debrief loop.
- Compound-first ordering **supersedes** ADR-0124's region interleaving: when a
  session must lose work, a trainer drops the isolation exercise, not the squat.

### ADR-0127 — Demographics

- **Age**: the only demographic the engine reads, through four documented hooks.
- **Sex and height**: metrics-only, for a Mifflin–St Jeor BMR-adjusted calorie
  estimate. A test reads the engine's own source and fails if either leaks in.
- **Sex-based programming rejected on the merits** — the engine already measures
  the individual through logged loads and RPE, and the strength metric is
  self-relative, so a population prior would be a downgrade. Cycle-phase
  programming likewise out of scope.
- `bodyweightLog` added regardless: weight loss is a first-class goal that was
  untrackable, and editing the scalar silently rewrote every past calorie estimate.

### ADR-0128 — Training zones

- Per-exercise zones rather than a session-level style, which would be too coarse
  to let one session hold both heavy pressing and high-rep accessory work.
- Cadence in exposures, derived from level, frequency, session length, goals and
  style — never a constant.
- The clock runs per muscle group, because rotation makes a per-exercise clock
  pathological.
- **Supersedes** ADR-0125's expectation that rep ranges would come from
  `goals.weights`. They cannot: the goal taxonomy has no axis separating maximal
  force from size.

### ADR-0129 / ADR-0131 / ADR-0132 / ADR-0133 — final engine boundaries

- **ADR-0129:** aggregate work supersedes best-set progression and plateau-only
  deloads.
- **ADR-0131:** explicit resistance focus supersedes automatic zone rotation as
  the source of ordinary work; tests become opt-in.
- **ADR-0132:** pain-stop and compatibility-gated substitution are hard live
  boundaries; no unrelated load transfer.
- **ADR-0133:** a lightweight six-week weekly intent layer sits above daily
  adaptation without introducing complex periodization.

---

## 14. Defects found and fixed

Worth keeping — most were invisible in a single session and only showed up as
"why has this not moved in two months?"

| Defect | Consequence |
|---|---|
| Percentage cap + downward snapping | **Every lift under 25 kg was permanently stalled** — most dumbbell accessory work, i.e. the bulk of bodybuilding and sculpting |
| RPE pre-filled with the target | An athlete tapping through logged exactly the value meaning "hold" — progression never fired, and the data looked real |
| No progression for reps/timed work | Bodyweight mode was not adaptive in any sense |
| Reps and load moved independently | Switching style kept the same load for 3 more reps |
| No recency bound on history | Returning after six weeks off was prescribed the last load at full volume |
| Rep range scaled by duration | A longer session meant *lighter, higher-rep* work; the only route to a strength rep range was a 10-minute session |
| Fatigue clamped mid-accumulation | Order-dependent results; a 20-set day indistinguishable from a 10-set one |
| Readiness bands vs. UI values | The worst reportable day cost ~8% of reps against a 30% ceiling |
| `DebriefResult` discarded | A reported knee flare had zero effect on tomorrow — contradicting CLAUDE.md §8.5 |
| `sessionTrainingLoad` unconsumed | Systemic load was measured and thrown away |
| Under-budget fill targeted de-loaded lifts | Quietly undid safety de-loads, every time |
| `recommendPrescription` lost the calibration branch | A test day's ~110% attempt would have become the next working load, and its RPE 9 read as "ground out" |
| `PerformedSet` had no `isWarmup` | Ramp sets counted as working sets in fatigue and volume |
| `recommendWorkoutType` raw-weight comparison | Cleared its own threshold by 2×10⁻¹⁷; a rounding change would have silently disabled style defaults for every two-goal athlete |
| Best-set progression | A final low set or skip erased aggregate achievement; `20 + skipped` against `2 × 10` failed to progress |
| Live swap copied the old weight | An unrelated replacement inherited a load it had never established; rest/group/time stayed stale |
| `pain` shared the too-hard branch | Pain merely reduced reps and allowed the affected movement to continue |
| Four-rep too-hard floor | `max(5, reps−2)` increased four prescribed reps to five |
| Automatic test rotation | Regular strength athletes received hypertrophy work interrupted by unsolicited AMRAPs |
| Rising load alone deloaded | Three productive rising weeks triggered a deload without any recovery or performance problem |
| Fixed 30 s rep work | Contradicted the trainer model's `reps × ~3 s` and mispriced very short/high-rep sets |

---

## 15. Known gaps

Recorded honestly rather than left to be rediscovered.

- **Barbell plate math** — a bar is treated as infinitely adjustable.
- **Catalog metadata is deterministically enriched, not fully hand-curated.**
  Every selectable row now has difficulty, impact, joint load, prerequisite,
  relationship, substitution family, and movement slot, but unusual exercises
  may still deserve manual overrides.
- **Cardio can adapt all planned axes, but distance/pace require a recorded
  distance baseline.** Equipment-specific units and grade/incline remain outside
  the generic model.
- **Enjoyment is session-level**, so it can prefer exercises from enjoyable
  sessions but cannot yet distinguish which single exercise drove the rating.
- **The weekly layer is intentionally lightweight.** It provides stable intent
  and anchors, not complex block periodization or competition peaking.
- The web decision log remains capped at 20 rows.

---

## 16. Testing strategy

522 tests across 35 suites. The parts that matter for this engine:

- **Single-session behavior** — `rules-engine-test.ts` is the broad regression net.
- **Multi-week scenarios** — `multi-week-scenario-test.ts` simulates an athlete
  training week after week and asserts the *trend*. Nearly every defect above was
  invisible to a single-session test; this is where they live.
- **Safety pinning** — caps, de-load triggers, and the "reductions only"
  invariants have explicit tests (CLAUDE.md §14).
- **Free-behavior pinning** — heavy rest tiers and superset exclusion fall out of
  existing rules for strength-zone work; both are pinned so they cannot silently
  regress.
- **Boundary enforcement** — a test reads the engine's own source to keep `sex`
  and `heightCm` out of it.
- **Aggregate regression cases** — progression covers `20 + skipped`, incomplete
  three-set work, `12/10/8`, lower-load proportional credit, and pain/form gates.
- **Live adjustment coverage** — pain, too-hard, too-easy, skip, time-short,
  accepted/rejected replacement, grouping, rest, rationale, and load isolation.
- **New longitudinal boundaries** — `cardio-progression-test.ts` and
  `weekly-program-test.ts`; catalog completeness and athlete-specific timing are
  also pinned.

When adding a rule, prefer a multi-week assertion over a snapshot one. The
single-session view is exactly what hid these problems.
