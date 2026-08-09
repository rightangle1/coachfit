# ADR-0201 — Calorie estimation model

- **Status:** Accepted (v2)
- **Date:** 2026-07-22
- **Phase:** 2

## Context
CLAUDE.md calls for an estimated caloric burn per session. No wearable/HR data
yet (deferred — see CLAUDE.md §10), so this must work from what we already log:
completed sets, durations, and modality.

## Decision
MET-based estimate: `calories = MET × bodyweightKg × hours`. Pure function in
`src/domain/metrics/calories.ts`.

- **MET assigned per modality tier** (not per exercise — the catalog is too small
  to justify per-exercise research values yet):
  - `mobility` (warmup/stretch): 2.5
  - `strength` (resistance sets): 5.0
  - `core` (isometric holds, e.g. plank): 3.8
  - `cardio` steady-state: 7.0
  - `cardio` interval: 8.5
- **Duration per completed set:**
  - Duration-based sets (`durationSec` present): use it directly.
  - Rep-based sets: estimate `reps × SECONDS_PER_REP` (3s/rep — a working-tempo
    approximation, not a stopwatch measurement).
  - Only **completed** sets count.
- **Bodyweight:** from `AthleteProfile.bodyweightKg` if set; otherwise a
  documented default (70kg) — clearly an estimate, not precision.
- Output: total kcal for a `SessionRecord`, and a per-modality breakdown for
  a little transparency in the UI.

## Evidence base
The formula itself is the standard MET definition used by ACSM and the
Compendium of Physical Activities: 1 MET ≈ 1 kcal · kg⁻¹ · h⁻¹, so
`kcal = MET × bodyweightKg × hours` is not a bespoke estimate — it's the
textbook conversion. Source: Ainsworth BE, Haskell WL, Herrmann SD, et al.
"2011 Compendium of Physical Activities: a second update of codes and MET
values." *Med Sci Sports Exerc.* 2011;43(8):1575-1581.

Each flat tier MET is a **documented approximation** mapped to the nearest
Compendium code, not a per-exercise lookup (the catalog is too broad for
that yet — a future upgrade path, not a gap in this ADR):

| Tier | App MET | Nearest Compendium code | Compendium MET | Note |
|---|---|---|---|---|
| `mobility` | 2.5 | 02065, stretching/mobility | 2.5 | exact match |
| `strength` | 5.0 | between 02054 (resistance, light-moderate, 3.5) and 02050 (resistance, vigorous, 6.0) | 3.5–6.0 | flat 5.0 is a deliberate moderate-effort midpoint — the app doesn't yet distinguish working sets by perceived effort at the MET-lookup stage (RPE-scaled load is handled elsewhere, ADR-0103) |
| `core` | 3.8 | 02060, conditioning exercise (general) | 4.0–4.5 | intentionally conservative — isometric holds (planks) are lower steady-state cost than dynamic "conditioning exercise, general" |
| `cardio_steady` | 7.0 | general cycling/jogging, moderate | 7.0 | exact match |
| `cardio_interval` | 8.5 | vigorous cardio / interval work | 8.0–10.5 | sits near the low end of the vigorous range, a conservative choice consistent with "when unsure, be conservative" |

## Consequences
- Tier MET values are approximations against the 2011 Compendium, not
  per-exercise research figures — see "Evidence base" above for the mapping
  and the rationale for each documented gap.
- Directly usable today, zero new dependencies, fully offline.
- Accuracy is intentionally rough — this is an estimate, not a medical figure.
- Reversible/upgradeable: when HealthKit/Google Fit HR lands (CLAUDE.md §10),
  swap this function's output for HR-based estimates behind the same call site
  without touching callers.

## v2 (2026-07-29) — per-exercise `metValue` override (ADR-0123)
`metFor()` now checks a researched `Exercise.metValue` before falling back to
the tier table above — exactly the "swap behind the same call site" upgrade
path this ADR's Consequences section anticipated, just triggered by
per-exercise research rather than HR hardware. The tier table remains the
fallback for untagged exercises; nothing about the tier values or their
Compendium mapping above changed. See ADR-0123 for the sourcing rationale
(why this applies to cardio, not strength) and the whole-catalog backfill
tracker (`docs/methodology/exercise-intensity-tagging.md`).
