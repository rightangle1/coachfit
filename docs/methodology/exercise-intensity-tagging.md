# Exercise Intensity Tagging — living tracker

Backfill tracker for the two per-exercise intensity fields introduced in
[ADR-0123](../decisions/ADR-0123-exercise-intensity-model.md): `metValue`
(cardio/conditioning, Compendium-of-Physical-Activities-sourced) and
`loadDemand` (strength/resistance, mechanics-derived). This is a living
document — update the checklist as batches land; don't let it drift from
`src/domain/catalog/exercises.ts`.

Related: [ADR-0123](../decisions/ADR-0123-exercise-intensity-model.md),
[ADR-0201](../decisions/ADR-0201-calorie-estimation.md) (the original tier
mapping this extends), `strength-set-design.md` (rest/timing philosophy).

---

## 1. `metValue` — Compendium research table

Source: Ainsworth BE, Haskell WL, Herrmann SD, et al. "2011 Compendium of
Physical Activities." *Med Sci Sports Exerc.* 2011;43(8):1575-1581.

Extends ADR-0201's tier-level mapping (`mobility`/`strength`/`core`/
`cardio_steady`/`cardio_interval`) to individual catalog entries. Only
cardio/conditioning entries are in scope — see ADR-0123 for why strength work
uses `loadDemand` instead.

| Catalog id | Compendium code | Description | MET | Tagged? |
|---|---|---|---|---|
| `ca-burpees` | 02214 | High intensity interval exercise, burpees, mountain climbers, squat jumps, Tabata, vigorous effort | 11.0 | ✅ |
| `ca-mountain-climbers-fast` | 02214 | (same code — explicitly named) | 11.0 | ✅ |
| `ca-shadow-boxing` | 15110 (nearest analogue — no dedicated shadowboxing code exists) | Boxing, punching bag (general, unpaced) | 5.8 | ✅ |
| `ca-jumping-jacks` | 02020 | Calisthenics (pushups, situps, pull-ups, jumping jacks, burpees...), vigorous effort — exact match | 7.5 | ✅ |
| `ca-high-knees` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-butt-kickers` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-squat-jumps` | 02214 | (same HIIT code — explicitly named) | 11.0 | ✅ |
| `ca-plank-jacks` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-skater-hops` | 02214 (nearest analogue) | HIIT/plyometric family — no dedicated code | 11.0 | ✅ |
| `ca-tuck-jumps` | 02214 (nearest analogue) | HIIT/plyometric family — no dedicated code | 11.0 | ✅ |
| `ca-star-jumps` | 02214 (nearest analogue) | HIIT/plyometric family — no dedicated code | 11.0 | ✅ |
| `ca-fast-feet` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-kb-swing-intervals` | 02058 | Kettlebell swings — exact match | 9.8 | ✅ |
| `ca-kb-snatch-intervals` | 02058 (nearest analogue) | kettlebell swings — no dedicated snatch code | 9.8 | ✅ |
| `ca-treadmill-sprints` | 12100 (nearest analogue) | Running, 8.6 mph (7 min/mile) — sprint-pace interval proxy | 12.5 | ✅ |
| `ca-bike-sprints` | 01305 | Bicycling, high intensity interval training — exact match | 8.8 | ✅ |
| `ca-rower-sprints` | 18060 (nearest analogue) | canoeing/rowing, competition >6mph, vigorous — no dedicated ergometer-sprint code | 12.5 | ✅ |
| `ca-db-thrusters-interval` | 02058 (nearest analogue) | kettlebell swings — loaded implement conditioning pace | 9.8 | ✅ |
| `ca-db-squat-press-interval` | 02058 (nearest analogue) | kettlebell swings — loaded implement conditioning pace | 9.8 | ✅ |
| `ca-bear-crawl-interval` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-burpee-broad-jump-combo` | 02214 | HIIT (burpees + jump family) — exact match | 11.0 | ✅ |
| `ca-lateral-shuffle` | 02020 (nearest analogue) | vigorous calisthenics — no dedicated code | 7.5 | ✅ |
| `ca-intervals-bw` | — | intentionally untagged: a user-composed "choose 3-4 movements" circuit, not a single specific movement — no Compendium code applies | tier fallback | — |
| `ca-treadmill-walk` | 17352 | Walking, treadmill, 2.5 to 2.9 mph, 0% grade — exact match | 3.5 | ✅ |
| `ca-treadmill-jog` | 12020 | Jogging, general, self-selected pace — exact match | 7.5 | ✅ |
| `ca-treadmill-incline-walk` | 17210 | Walking, 2.9 to 3.5 mph, uphill, 1 to 5% grade — exact match | 5.3 | ✅ |
| `ca-bike-steady` | 01216 | Bicycling, stationary, 60 watts, light to moderate effort — exact match | 5.0 | ✅ |
| `ca-rower-steady` | 02071 | Rowing, stationary ergometer, general, <100 watts, moderate effort — exact match | 5.0 | ✅ |
| `ca-elliptical-steady` | 02048 | Elliptical trainer, moderate effort — exact match | 5.0 | ✅ |
| `ca-stairclimber-steady` | 02065 | Stair-treadmill ergometer, general — exact match (genuinely vigorous even at a steady setting) | 9.3 | ✅ |
| `ca-low-impact-bw` | 17349 (nearest analogue) | slow treadmill walk — marching/stepping in place has no dedicated code | 3.0 | ✅ |
| `ca-step-up-steady` | 17131 (nearest analogue) | Stair climbing, general — continuous bodyweight step-ups | 6.8 | ✅ |
| `ca-brisk-walk-bw` | 17200 | Walking, 3.5 to 3.9 mph, level, brisk — exact match | 4.8 | ✅ |
| `ca-stair-walk-bw` | 17131 | Stair climbing, general — exact match | 6.8 | ✅ |
| `ca-march-high-knees-steady` | 12025 (nearest analogue) | Jogging, in place — moderate paced, not full interval effort | 4.8 | ✅ |
| `ca-bike-recovery-spin` | 01210 | Bicycling, stationary, 25-30 watts, very light to light effort — exact match | 3.5 | ✅ |
| `ca-machine-steady` | — | intentionally untagged: machine-agnostic ("any machine — treadmill, bike, rower, or elliptical"), same reasoning as `ca-intervals-bw` — no single Compendium code applies | tier fallback | — |

All 22 `interval`-pattern and all 15 `steady_cardio`-pattern exercises are
now resolved (32 tagged, 2 intentionally left on the tier fallback as
composite/machine-agnostic entries). Do not hand-wave a MET value without a
Compendium code (or a documented nearest-analogue, as above) — see
ADR-0123's rejected "one number for everything" option.

### Batch C — `core`-pattern holds (41 exercises, all tagged)

The Compendium's coverage for isolated ab/core work is thin (per ADR-0201),
with no per-exercise codes — but it does name concrete exemplars at three
effort levels, which Batch C uses as anchors instead of inventing per-exercise
numbers:

- **Light (2.8, code 02024)** — *"Calisthenics (curl-ups, abdominal crunches,
  plank), light effort"* — the Compendium explicitly names plank and crunch
  here. Applied to: `co-plank`, `co-side-plank`, `co-crunch`,
  `co-reverse-crunch`, `co-toe-touch`, `co-standing-side-bend-bw`,
  `co-flutter-kicks`, `co-scissor-kick`, `co-band-standing-crunch`,
  `co-deadbug`, `co-bird-dog`, `co-band-deadbug-pull`, `co-band-pallof-press`,
  `co-cable-pallof-press`.
- **Moderate (3.8, code 02022)** — *"Calisthenics (pushups, situps,
  pull-ups, lunges), moderate effort"* — situps named explicitly. Applied to:
  `co-situp`, `co-bicycle-crunch`, `co-russian-twist-bw`, `co-superman`,
  `co-decline-situp`, `co-decline-crunch`, `co-back-extension`,
  `co-leg-raise`, `co-hanging-knee-raise`, `co-plank-shoulder-tap`,
  `co-plank-updown`, `co-band-woodchop`, `co-cable-crunch`, `co-db-side-bend`.
- **Vigorous (7.5, code 02020, nearest analogue)** — loaded (dumbbell/
  kettlebell/cable/band-resisted-heavy) or advanced-leverage (hanging,
  gymnastics-style, weighted) core work. Applied to: `co-hollow-hold`,
  `co-hollow-rock`, `co-hanging-leg-raise`, `co-l-sit-hold`,
  `co-weighted-plank`, `co-bear-crawl-hold`, `co-vup`, `co-mountain-climber`,
  `co-db-russian-twist`, `co-db-woodchop`, `co-kb-windmill`,
  `co-kb-russian-twist`, `co-cable-woodchop`.

This is a deliberately coarser methodology than Batch A/B (3 tiers instead of
per-exercise research) because that's the actual resolution the source
supports for this exercise family — stating it plainly here rather than
dressing up 41 identical-precision guesses as individually researched values.

## 2. `loadDemand` — heuristic reference

Default (`defaultLoadDemand`, `src/domain/engine/intensity.ts`) when no
explicit override is set:

```
base            = mechanicOf(exercise) === 'compound' ? 1.1 : 0.85
massCount       = primaryAreas.length + secondaryAreas.length × 0.5
massBonus       = clamp((massCount - 1) × 0.08, 0, 0.25)
unilateralBonus = unilateral ? 0.05 : 0
loadDemand      = clamp(base + massBonus + unilateralBonus, 0.7, 1.4)
```

Hand-set `loadDemand` only to correct a specific exercise the heuristic
under/over-shoots — this is curatorial tagging (same spirit as `jointLoad`),
not a table to fill in for every entry. Most of the catalog should stay on
the heuristic default indefinitely.

**Prerequisite fix (done, 2026-07-29):** `mechanicOf`'s BIG_MOVERS heuristic
misclassified 17 isolation exercises as compound (any push/pull exercise
hitting a big-mover muscle, regardless of joint count) and missed 1 compound
exercise misclassified as isolation. All 18 got an explicit `mechanic`
override as part of the ADR-0123 rollout:

`pu-db-fly`, `pu-db-incline-fly`, `pu-cable-fly`, `pu-cable-low-to-high-fly`,
`de-db-lateral-raise`, `de-db-front-raise`, `de-cable-lateral-raise`,
`de-band-lateral-raise`, `de-band-front-raise`, `de-db-rear-delt-fly`,
`pl-prone-y-raise`, `pl-db-reverse-fly`, `pl-db-shrug`, `pl-bb-shrug`,
`pl-cable-rear-delt-fly`, `pl-band-shrug`, `pl-db-pullover` (all → isolation),
`pu-bench-dip` (→ compound).

**`loadDemand` override pass (done, 2026-07-29):** ran the script-assisted
audit (§3.1) across all 327 non-cardio catalog entries, sorted by pattern and
derived value. Two genuine misses stood out — both cases where the heuristic
has no signal for a named regression/progression pair, so both variants score
identically:

- `pu-incline-pushup` / `pu-decline-pushup` — the catalog's own descriptions
  say incline "reduces load" and decline "increases load," but both scored
  1.22, identical to a standard push-up (the heuristic only sees
  push-pattern + chest/triceps, not elevation direction). Overridden to 1.00
  and 1.32 respectively.
- `sq-wall-sit` / `sq-wall-sit-db` — scored 1.14, in line with dynamic
  compound squats, despite being isometric holds with no eccentric/concentric
  cycling (materially lower CNS/systemic fatigue than an equivalent dynamic
  squat). Overridden to 0.95 and 1.05.

No other entries showed the same "two named variants, one heuristic value"
pattern clearly enough to justify a hand override — box-squat and rack-pull
variants, for example, are still full compound lifts without an unambiguous
easier/harder signal the way an elevation direction gives. Consistent with
"hand-set only to correct a specific miss, not re-derive the whole heuristic
by hand" (§2 above), the pass stopped there rather than tuning every
plausible edge case.

## 3. Backfill plan

Not gated behind ADR-0123 shipping — proceeds incrementally.

1. **Script-assisted audit, not authorship.** A one-off Node script imports
   `EXERCISES`, `mechanicOf`, `defaultLoadDemand` and prints every exercise's
   derived values sorted by movement pattern, for human review. It never
   writes to `exercises.ts` — hand-authored TS with prose fields isn't safely
   codegen-able. A human adds `loadDemand` overrides where the heuristic
   misses.
2. **Manual/researched `metValue` pass**, batched by movement-pattern
   archetype (exercises that cluster around the same or a related Compendium
   code go together):
   - Batch A — all remaining `interval`-pattern cardio (done, 2026-07-29):
     bodyweight explosive drills, kettlebell/dumbbell conditioning intervals,
     and machine sprint intervals (treadmill/bike/rower) — 19 tagged, 1
     (`ca-intervals-bw`) intentionally left untagged as a composite/variable
     circuit. See §1 table above.
   - Batch B — all remaining `steady_cardio`-pattern exercises (done,
     2026-07-29): treadmill/bike/rower/elliptical/stairclimber machines,
     walking variants (brisk, incline, real stairs), and low-impact
     bodyweight cardio — 13 tagged, 1 (`ca-machine-steady`) intentionally
     left untagged as machine-agnostic. See §1 table above.
   - Batch C — 41 `core`-pattern holds (planks, hollow holds). Lower
     priority: ADR-0201 already flags thin/conservative Compendium coverage
     here.
3. **Spot-review sampling.** After each batch, sample ~10% and sanity-check
   the resulting kcal/RPE/rest/session-length numbers in `npm run web`
   against trainer intuition before starting the next batch.
4. Update the checklist below as batches land.

## 4. Checklist

- [x] Prerequisite `mechanic` audit (18 exercises, §2 above)
- [x] Seed pair: `ca-burpees`, `ca-mountain-climbers-fast`, `ca-shadow-boxing`
- [x] Batch A — all remaining `interval`-pattern cardio (19 tagged, 1 intentionally skipped)
- [x] Batch B — all remaining `steady_cardio`-pattern exercises (13 tagged, 1 intentionally skipped)
- [x] Batch C — core-pattern holds (41 tagged, 3-tier Compendium-anchored classification)
- [x] `loadDemand` override pass (script-assisted audit, 4 overrides: incline/decline push-up, wall sit/weighted wall sit)
