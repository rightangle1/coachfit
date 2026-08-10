# Architecture Decision Records (ADRs)

We record notable, hard-to-reverse decisions here so the reasoning is preserved and
the choice stays reversible. Routine implementation choices do **not** need an ADR.

For how the engine actually works end to end — pipeline, subsystems, constants,
and the safety envelope — see
[../methodology/programming-engine.md](../methodology/programming-engine.md).

## Process
1. Copy `TEMPLATE.md` to `ADR-0PNN-short-title.md` (`P` = phase, e.g. `0001`).
2. Write it as **Proposed**, capturing the real trade-offs and options considered.
3. Discuss / decide → mark **Accepted** (or **Rejected** / **Superseded by ADR-…**).
4. Keep it short. An ADR is a decision + why, not a design doc.

## Status legend
`Proposed` · `Accepted` · `Rejected` · `Superseded`

## Index

### Phase 0 — Foundations
| ADR | Title | Status |
|-----|-------|--------|
| 0001 | Local data store | Accepted |
| 0002 | State management & persistence | Accepted |
| 0003 | Project structure & domain layering | Accepted |
| 0004 | Body-area taxonomy | Accepted |
| 0005 | Decision-log schema & storage | Accepted |
| 0006 | Navigation | Accepted |
| 0007 | Web as dev/UX-testing target + persistence port | Accepted |

### Phase 1 — Rules engine + core loop
| ADR | Title | Status |
|-----|-------|--------|
| 0101 | Exercise catalog schema | Accepted |
| 0102 | Fatigue & recovery model | Accepted (v1) |
| 0103 | Progressive overload & safety caps | Accepted (v2) |
| 0104 | Volume landmarks | Accepted (v1) |
| 0105 | Session generation algorithm | Accepted (v2) |
| 0106 | Avoidance & targeting resolution | Accepted (v2) |
| 0107 | Readiness scaling | Accepted (v2) |
| 0108 | Workout tracking model & offline guarantees | Accepted (v1) |
| 0109 | Equipment model & recommendation logic | Accepted (v1) |
| 0110 | Design system & theming | Accepted |
| 0111 | Configurable warmup & stretching focus | Accepted (v1) |
| 0112 | Exercise instructional content + catalog expansion | Accepted |
| 0113 | Manual exercise swap during a session | Accepted (v1) |
| 0114 | Flow session structure (Yoga vs. Stretch) | Accepted (v3) |
| 0115 | Owned-weight constraints for dumbbells/kettlebells/bands | Accepted (v1) |
| 0116 | Configurable cool-down | Accepted (v1) |
| 0120 | Session time model & set-block budgeting | Accepted (v3) |
| 0121 | Superset / triset rationale engine | Accepted (v2) |
| 0122 | Load finalization (fatigue, feel, max-out) | Accepted (v1) |
| 0123 | Per-exercise intensity model (MET + load demand) | Accepted (v1) |
| 0124 | Sculpting workout style + Full Body targeting | Accepted (v1) |
| 0125 | Double progression, RPE-free signals, layoff ramp | Accepted (v1) |
| 0126 | Weighted selection, emphasis quota, systemic fatigue | Accepted (v1) |
| 0127 | Demographics scope (age programming; sex/height metrics-only) | Accepted (v1) |
| 0128 | Training zones — per-exercise strength/hypertrophy/endurance | Accepted (v1) |
| 0129 | Aggregate-work progression | Accepted |
| 0130 | Motion and depth tokens | Accepted |
| 0131 | Explicit resistance focus and opt-in tests | Accepted |
| 0132 | Live pain and substitution safety | Accepted |
| 0133 | Lightweight weekly program layer | Accepted |
| 0134 | Per-session volume ceiling & movement redundancy | Accepted (v1) |
| 0136 | Experience-tiered selection & cross-block de-duplication | Accepted (v1) |

### Phase 2 — Metrics & achievements
| ADR | Title | Status |
|-----|-------|--------|
| 0201 | Calorie estimation model | Accepted (v2) |
| 0202 | Strength metric | Accepted (v1) |
| 0203 | Endurance metric | Accepted (v1) |
| 0204 | Achievements engine | Accepted (v1) |
| 0205 | Progress overview composites (Overall Strength / Overall Endurance) | Accepted (v1) |
| 0206 | Absolute strength/endurance performance indices | Accepted (v1) |

### Phase 3 — Media enrichment
| ADR | Title | Status |
|-----|-------|--------|
| 0301 | Animation/media format | Accepted |
| 0302 | Media sourcing & licensing | Accepted |
| 0303 | Clip licensing bar + in-app embedded player | Accepted |
| 0304 | Clinical source as curation reference (Cleveland Clinic) | Accepted |

### Phase 4 — iOS platform integrations
| ADR | Title | Status |
|-----|-------|--------|
| 0401 | iOS Live Activity for the active workout | Accepted |
| 0402 | HealthKit write-back for completed workouts | Accepted |
