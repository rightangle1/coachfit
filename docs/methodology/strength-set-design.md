# Workout Set-Design Methodology

The reference this engine reasons from. It captures the strength-training best
practices we adopt, then layers CoachFit's constraints on top. When the engine's
numbers change, change them here first (or in the same PR) so the rationale stays
recoverable. This is a living document — cite it from ADRs and code comments.

Related: [programming-engine.md](./programming-engine.md) — the full engine
design, logic, and constants that implement this methodology.
[ADR-0103](../decisions/) (overload + safety caps),
[ADR-0104](../decisions/) (volume landmarks), and the ADRs added by the engine
revamp (session time model, superset rationale, load finalization).

---

## 1. First principles

A good trainer never blindly adds load or volume. Every prescription is justified
by the athlete's goal, recent performance, recovery state, and how they feel today.
Two ideas drive everything below:

1. **A session is time × effort, and time is mostly rest.** For strength work, the
   bar is moving for a small fraction of the session; the rest between sets is the
   session. Any honest time budget must count rest as a real, load-dependent
   quantity — not a flat fudge factor.
2. **Structure is intent.** Exercise order, set grouping (straight vs.
   superset/triset), and set/rep/rest choices each express a specific training
   goal. If we can't state *why* a structure was chosen, we shouldn't use it.

---

## 2. Rest between sets (the number everything depends on)

Rest is chosen from the goal of the set, not a global default. Evidence-based
ranges we program to:

| Set type | Rep range / effort | Rest | Why |
|---|---|---|---|
| Heavy compound (strength) | ≤6 reps or RPE ≥8, multi-joint | **150–180 s** | Full ATP-PCr + CNS recovery so the next set keeps its load and technique. Under-resting here silently turns a strength set into a fatigue set. |
| Hypertrophy compound | ~6–15 reps, multi-joint | **75–90 s** | Enough recovery to keep near-target reps while preserving metabolic stress. |
| Isolation / small muscle | any, single-joint | **45–60 s** | Small muscles recover fast; longer rest wastes session time. |
| Core / mobility hold | timed | **20–30 s** | Low systemic cost; brief reset between holds. |
| Cardio steady | continuous | **~0 s** | Rest is intrinsic to the bout. |
| Cardio intervals | work/recovery | built-in | The recovery phase *is* the rest; modeled as explicit `phase: 'recovery'` sets. |
| Aerobics circuit (ADR-0138) | continuous, rotating stations | **~10 s** | Not zero like steady, not a recovery phase like intervals — a brief move-to-the-next-station transition, modeled as `REST.AEROBICS_TRANSITION`. |

**Supersets change the accounting.** In an antagonist or unrelated pairing, one
station rests while the other works, so the *shared* rest is paid roughly once per
round instead of once per exercise. We model a superset as paying ~55% of the
straight-set rest — that is precisely why a superset "buys" time, and the time
model must credit it or supersets look free-but-pointless.

**Transition cost.** Each exercise also carries a one-time setup/teardown (~30–45 s;
more for a barbell/rack, less for bodyweight). It's small but real, and it's part
of why 12 exercises never fit where 5 do.

So the cost of a block is:

```
blockSeconds = Σ_exercises [ transition + Σ_sets ( workSeconds + restSeconds × supersetFactor ) ]
workSeconds   = durationSec (timed)  |  reps × ~3 s (rep-based)
```

---

## 3. Sets, reps, and volume

- **Sets per exercise: usually 3–5 on normal work days.** Recovery, layoff,
  systemic fatigue, local fatigue, or a short time budget may legitimately
  prescribe 1–2 hard sets. A recovery day is allowed to finish early; the engine
  never pads it back into a normal hard-set count merely to fill the clock.
- **Reps by declared resistance outcome:** max strength 4–6 @ RPE 8;
  hypertrophy 8–12 @ RPE 7; muscular endurance 15–20 @ RPE 7; power 3–5 @
  RPE 6. Bodybuilding/sculpting change structure, not physiology.
- **Weekly volume landmarks are individualized starting ranges**, not universal
  10/20 claims. General starting MEV/MRV is 6/12 beginner, 8/16 intermediate,
  10/20 advanced, shifted by outcome and reduced when recent performance,
  readiness, or adherence indicates recovery trouble. Both the program week and
  rolling seven days are tracked.

### Aggregate progression

Productive work across all prescribed working sets is primary; warm-ups and
calibration sets are excluded. For loaded reps this is `Σ(weight × reps)` and
for unloaded reps `Σ(reps)` (duration work uses the analogous time calculation).
Set count, rep falloff, RPE, pain, and technique qualify the decision.

- `2 × 10` prescribed, `20 + skipped` performed at the planned load: 100% work,
  credited and rebalanced to a conservative `2 × 11` next time.
- `3 × 10`, only 20 total: 67%, repeat total work.
- `3 × 10` as `12, 10, 8`: 100%, eligible to progress.
- Lower-load work is prorated. Pain/form breakdown can block a load increase
  without erasing achieved work. A plateau alone never mandates a deload.
- A large minimum increment must be plausible from estimated strength after the
  rep reset; a lower nominal volume-load is not sufficient proof.

---

## 4. Exercise count (why "12 exercises" is wrong)

Exercise count is an **output of the time budget**, not a linear function of
requested minutes. Procedure:

1. Compute the block's time budget (requested duration minus warmup/cooldown/
   conditioning that are actually included).
2. Fill it with **whole set-blocks of 3–5 sets** at real rest, preferring to add
   sets to existing exercises up to 5, then add another distinct movement.
3. Clamp by: distinct movement patterns actually available, per-muscle MEV/MRV, and
   a sane ceiling (~6–7 lifts even for a long session).

A realistic 60-minute lifting session is **~5–6 exercises × 3–4 sets**, not 9 × 2,
and never a pile of 15-second filler sets created to "use up" a budget that never
accounted for rest in the first place.

---

## 5. Supersets / trisets — chosen with rationale, never at random

Grouping is only applied when it serves a stated purpose, and **never on heavy
low-rep main compounds** (they need full rest and undivided focus). Strategies, in
priority order:

1. **Antagonist superset** — opposing muscles (push/pull, quads/hamstrings,
   biceps/triceps). Reciprocal inhibition means one recovers while the other works;
   comparable strength/hypertrophy to straight sets in significantly less time.
   *Rationale example: "Antagonist pair — your back recovers while you press."*
2. **Compound → isolation (same muscle), pre/post-exhaust** — e.g. bench → flye.
   Concentrates stimulus on a target muscle.
3. **Time-saver (unrelated upper/lower)** — only when the goal weighting favors
   general fitness / time efficiency.
4. **Straight sets** — the default, and mandatory for heavy strength work.

Each group carries an explicit `type` + `rationale` so the prebrief and tracker can
explain *what it is building and why*.

---

## 6. Autoregulation — fatigue, feel, and maxing move the *weight*

Load is not a fixed ladder. After the base progression decision (earned increase,
hold, or deload — all within the hard safety caps), the engine **finalizes** load
against today's state. These modifiers can only **reduce or hold** load, never raise
it past the caps:

- **Readiness (graded, not binary):** poor sleep / low energy / high soreness trims
  working load ~5–10% and primarily removes hard sets/exercises. Readiness never
  raises anything automatically — a good day lets performance earn progression.
- **Per-muscle fatigue:** a primary muscle carrying high accumulated fatigue trims
  load ~5–10% on top of any set/RPE de-load.
- **Recent max-out taxation:** if a muscle was recently maxed (a calibration AMRAP
  or e1RM PR in the last several days), it's taxed — reduce load/volume on it this
  session. "You PR'd Tuesday, so we back the squat off today" is exactly the
  trainer judgment we want.

Every modifier that moves a number is written to the decision log with which signal
drove it, so the reasoning is auditable and tunable later.

---

## 7. Timed mobility work — warmups, cool-downs, yoga, and stretch

Warmups, cool-downs, yoga, and stretch are all **several short holds, never one
long static hold** — holding a single pose for five minutes is not a warmup. But
the four are not one mechanism (ADR-0114 v2 split this apart): Warmup/Cooldown
are brief time-fitted circuits, Yoga is a natural-time repeated sequence, and
Stretch is targeted with clinically fixed prescriptions.

### Warmup / Cool-down — time-fitted repeated circuit (unchanged)
- **Per-hold duration is bounded and sensible:** warmup drills ~20–60 s,
  cool-down stretches ~30–75 s (gentle pace and low readiness shift within that
  band). No hold is ever a multi-minute affair.
- **The circuit is compact and repeated** — 2–3 drills/stretches, repeated for
  2–4 rounds, rather than a long list of one-off movements. Hold length is
  derived from the block's time budget (this is the one mechanism of the four
  that still fits hold length *to* the budget — appropriate here since these
  blocks are intentionally brief, not the main event).

### Yoga — natural-time repeated combo (ADR-0114 v2)
- An opening pose and a closing pose (single hold each) bookend a **combo**: one
  pose per middle stage, picked once and then repeated as a unit for as many
  **whole rounds** as the time budget naturally allows.
- Hold length is fixed first (30–90 s, `MOBILITY_HOLD.yoga`, pace/readiness-
  scaled within that band) — round count is the only lever, so the combo's
  natural duration is never fragmented to hit a target time. A 30-minute combo
  at a 30-minute budget is one round; at 60 minutes, two rounds — never two
  compressed 15-minute halves.
- Muscle-agnostic by design: pose selection doesn't bias toward a targeted
  muscle group, but avoidance (including an injury flag, or explicit targeting
  overriding severe — not injured — fatigue) still fully applies.

### Stretch — targeted, clinically correct prescription (ADR-0114 v2)
- Built around explicit targeting ("what am I trying to loosen up today?"), not
  a sequence — roughly **one exercise per targeted area**, never a rotating
  circuit of unrelated movements.
- Each stretch is prescribed by its own type, per stretch science, not a
  time-budget calculation:
  - **Static** (holding still): 30–60 s, 1–2 sets when targeted.
  - **Dynamic** (moving gently): no hold at all — 10–15 reps instead.
- Duration is an **output** of these correct prescriptions, not an input the
  algorithm force-fits — a Stretch block is never compressed below a static
  hold's 30 s floor or padded with extra unrelated exercises to use up time.

### Shared
Transitions between drills/poses are brief in all four, so the time model
charges little between them (unlike a barbell lift's setup). When the catalog
runs short on distinct options for a slot, that block simply runs a touch
shorter rather than stretching a hold to an absurd length.

---

## 8. Safety is absolute

Progression caps (max **+10%** session-to-session load increase), deload triggers
(RPE grind-out or a corroborated multi-signal systemic state), avoidance hard-excludes, and individualized volume
ceilings are **hard constraints enforced as clamps**. Nothing in this methodology —
and no future advisor — may exceed them. When in doubt, under-load.

Pain during a session stops the affected exercise. Substitution is allowed only
for the same specific movement purpose and target muscles after equipment,
avoidance, prerequisite, and difficulty checks; the replacement uses its own
history or an unset load. An unrelated exercise's weight is never transferred.

Cardio progression changes one primary variable at a time. Successful steady
work cycles duration, distance, pace, and perceived intensity (distance/pace only
when a baseline was recorded). Intervals cycle rounds, work duration,
work:recovery ratio, and perceived intensity. Missed work and recovery intent do
not progress the bout.

---

## 9. Sources

- Superset systematic review & meta-analysis (Sports Medicine, 2025) — comparable
  adaptations to straight sets in less time; antagonist pairings increase reps.
- Volume landmarks (MEV/MAV/MRV) — Renaissance Periodization.
- Autoregulation in resistance training (RPE / readiness) — reviews in PMC.
- Rest-interval guidance — heavy compound 2–3 min, hypertrophy 60–90 s, isolation
  45–60 s (general strength-and-conditioning consensus).
