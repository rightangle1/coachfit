# ADR-0402 — HealthKit write-back for completed workouts

- **Status:** Accepted
- **Date:** 2026-08-01
- **Phase:** 4

## Context

CLAUDE.md §10 reserves a write-back adapter seam for HealthKit/Google Fit but
explicitly defers building it ("Not built yet. Design the data layer so it
plugs in cleanly... Do not build the integration now"). This ADR covers pulling
just the iOS write-back slice forward now, at the user's explicit request,
alongside the Live Activity work in ADR-0401. Read access (sourcing readiness
inputs from Health) and Android/Google Fit remain out of scope and stay
deferred.

## Options considered

- **`@kingstinct/react-native-healthkit`** — actively maintained, built on
  `react-native-nitro-modules` (JSI/Nitro), which matches this project's
  mandatory New Architecture (Expo SDK 55+ cannot disable it). Ships its own
  Expo config plugin wiring the `HealthKit` entitlement and
  `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription` Info.plist
  keys automatically — important given `ios/` is gitignored/regenerated on
  every prebuild in this project, so nothing can be hand-edited into the native
  project and expected to survive.
- **`react-native-health`** (agencyenterprise) — older, callback-style API, no
  first-class Expo config plugin, not Nitro/New-Architecture-native. Rejected.
- **Defer entirely** — rejected; the user explicitly scoped this in for this
  pass.

## Decision

**`@kingstinct/react-native-healthkit`**, write-only: `requestAuthorization`
is called with only `toShare: [WorkoutTypeIdentifier]`, never `toRead` — this
is a hard design constraint, not an implementation detail, matching CLAUDE.md
§10's reserved seam being a write-back adapter specifically. The write fires
from a new `src/services/health-writeback.ts`, called fire-and-forget from
`workout-store.ts`'s `finish()`/`endEarly()`, behind the same `.ios.ts`/`.ts`
platform-port convention as ADR-0401 (this pair share the `.ts` extension on
both sides, so the Metro extension-matching gotcha documented in ADR-0401
doesn't apply here — no fix needed).

Workout type maps to a HealthKit activity type
(`bodybuilding`/`sculpting` → `strength`, `cardio` → `cardio`, `yoga` → `yoga`,
`stretch` → `flexibility`, `bodyweight`/missing → `functional`); calories come
from the existing MET-based `estimateSessionCalories` (ADR-0201), unmodified.
An idempotency guard (`SessionRecord.healthKitWorkoutUUID`, set once the write
succeeds) prevents a duplicate write if `finish()`/`endEarly()` is ever
retried.

## Consequences

- **No schema migration.** `SessionRecordRow.recordJson` is a JSON blob, so
  the two new optional `SessionRecord` fields
  (`healthKitWorkoutUUID`, `liveActivityId`) needed no database change.
- **Reversible and narrow.** The write path is entirely behind
  `HealthWritePort`; adding the read path later (sourcing readiness from
  Health) is a separate, additive port method, not a rework of this one. A
  Health-write failure never affects the local record, which remains the
  source of truth — the write is fire-and-forget and swallows all errors.
- **Deferred, updated in `CLAUDE.md` §13 / `docs/BUILD_PLAN.md`:** HealthKit/
  Google Fit **read** path and Android write-back remain "Later/maybe."
- **Confirmed working on iOS Simulator:** ending a workout produced the exact
  expected system authorization prompt, scoped to write-only ("Workouts"
  toggle only, no read categories), displaying our custom
  `NSHealthUpdateUsageDescription` text verbatim; granting it and completing
  the flow produced no errors. Not yet confirmed: the saved workout's exact
  field values in a real Health app (Simulator verification didn't inspect the
  written record directly) — carry into the real-device pass.
