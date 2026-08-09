# ADR-0127 — Demographics: what the engine may know about a person

- **Status:** Accepted (v1)
- **Date:** 2026-08-04
- **Phase:** 1 (engine revamp)

## Context

Until now the only anthropometric datum anywhere in the app was
`AthleteProfile.bodyweightKg`, used exclusively for MET-based calorie estimation.
There was no age, no sex, no height — no field, no type, no column, no UI input.

The question "should we add age, sex, and height?" deserves a per-field answer
rather than a blanket one, because the three are not equivalent, and adding a
field that changes nothing is worse than not adding it: it costs onboarding
friction (CLAUDE.md's "minimal onboarding friction for now") and implies a
precision the engine does not have.

Two constraints shape this. First, **the engine already measures the individual
directly** — through logged loads, completed reps, and RPE — and the strength
metric is deliberately *self-relative* (`relativeRatioPoints` in
`metrics/strength.ts`), so it needs no population norms. Second, CLAUDE.md §10
reserves a HealthKit/Google Fit **read** path for later; heart-rate zones will
require age when it lands.

## Options considered

- **Add nothing.** Zero friction, no risk. But it leaves the single least
  defensible thing in an otherwise careful fatigue model: `NORMAL_HALF_LIFE_HOURS`
  is universal, so a 24-year-old and a 62-year-old receive identical recovery
  curves.
- **Add all three and let them influence programming.** Superficially "more
  personalized". Rejected on the merits — see below.
- **Add age for programming; add sex and height for metrics only.** Each field
  earns its place through a specific rule or formula, and the boundary between
  them is enforced rather than described.

## Decision

**Age (`birthYear`) — yes, and it is the only demographic the engine reads.**
Four documented hooks, no diffuse "age factor":

- **Recovery half-life** scales by age band (<30 ×0.9 … 60+ ×1.4), conservative
  direction only. This is the strongest justification of the three fields.
- **Warm-up floor** for older athletes — a floor, not an override; a longer
  personal preference still wins.
- **Max-day cadence** stretched, and **max-day gating** made stricter: an older
  athlete needs an unambiguously good day, not merely a not-bad one, before being
  invited to test a rep max at RPE 9.

**Sex (`sex`) and height (`heightCm`) — yes, but METRICS ONLY.** They earn their
place solely by enabling a Mifflin–St Jeor BMR-adjusted calorie estimate in place
of raw `MET × kg × h`, which implicitly assumes resting metabolism scales with
bodyweight alone. Two people at the same weight but different height, age and sex
have measurably different resting expenditure. `sex: 'unspecified'` uses the
midpoint of the male/female offsets, so declining to answer is a supported choice
rather than a degraded one, and the adjustment is clamped to [0.8, 1.2] because
it refines an estimate rather than licensing extreme numbers.

**Sex is explicitly rejected as a programming input.** The effect sizes in
fatigue and recovery are modest, individual variation dwarfs them, and — decisively
— the engine already measures *this* athlete directly. Layering a population-level
prior on top of individual measurement makes the prescription worse, not better.
**Menstrual-cycle-phase programming is likewise out of scope**: contested
evidence, high individual variance, sensitive data, and the daily readiness cards
already capture the day-to-day signal it would proxy.

**Height is rejected as a programming input.** Its one plausible use —
limb-length-driven exercise suitability (tall lifters and conventional deadlift,
deep back squat, flat bench ROM) — is real but height is a poor proxy for limb
length, and encoding "tall → avoid conventional deadlift" is a heavy-handed prior
on thin evidence.

**The boundary is enforced, not merely documented.**
`src/domain/engine/__tests__/demographics-boundary-test.ts` reads the engine's own
source and fails if anything under `domain/engine/` references `sex` or
`heightCm`. A comment saying "metrics only" would erode within a month.

**`bodyweightLog` — added regardless of the above, and arguably the most
valuable field here.** `bodyweightKg` was a single mutable scalar with no time
series, so weight loss — a first-class goal in CLAUDE.md §1 and §8 — was
untrackable, and editing the number silently rewrote the calorie estimate on
every previously completed session. The log is additive; the scalar remains the
"current" value everything else reads.

All fields are **optional**, and absent means today's exact behavior. No
migration is needed: `athletes` stores a JSON blob (`data/schema.ts`).

## Consequences

**Easier.** Recovery adapts to the person rather than to an assumed 35-year-old.
Calorie estimates stop being a default-value artifact. Weight-loss progress
becomes chartable. When the HealthKit read path lands (CLAUDE.md §10), age is
already there for heart-rate zones.

**Harder.** Onboarding is longer, even though every new field is skippable.
Storing sex is a meaningful privacy step for an app that previously held almost
no personal data — it stays on-device like everything else (CLAUDE.md §4), and it
is worth re-examining if cloud sync ever arrives. The age bands are a documented
judgment call, not a fitted model, and should be revisited if real usage
contradicts them.

**Reversibility.** High. Every field is optional and additive with no schema
change. Removing sex/height means deleting the BMR term and its call sites;
removing age means dropping four clearly-marked hooks. The boundary test would
fail loudly if a future change quietly widened the engine's access — which is the
point.
