# Build Plan — CoachFit App

Phased build plan and the key architectural decisions (ADRs) each phase requires.
See [CLAUDE.md](../CLAUDE.md) for product vision and principles, and
[docs/decisions/](./decisions/) for the ADRs themselves.

**How to read this:** each phase lists a **Goal**, **Deliverables**, and the
**Key ADRs** that must be decided *during* that phase. An ADR is required only for
decisions with real, hard-to-reverse trade-offs — not routine implementation.
Phases are sequential but ADRs within a phase can be tackled in parallel.

Guiding constraints that apply to every phase (from CLAUDE.md):
offline-first always · rules-only core (no LLM) · nuance via structured inputs ·
everything programming-related behind the `ProgrammingEngine` interface ·
log every decision · reversible choices.

---

## Phase 0 — Foundations

**Goal:** A runnable Expo app skeleton with the data layer, domain boundaries, and
the `ProgrammingEngine` interface in place — no real programming logic yet, but
the seams that make everything else reversible are locked in.

**Deliverables**
- Expo + TypeScript (strict) app that boots on a phone/simulator.
- Project structure with clean UI / services / engine / data layering.
- Local-first persistence working (write/read/migrate a trivial record).
- `ProgrammingEngine` interface defined with a stub `RulesEngine` returning a
  hardcoded session.
- Decision-log plumbing (records calls even with the stub engine).
- Navigation shell for the core screens (empty placeholders).

**Key ADRs**
- **ADR-0001 — Local data store.** Expo SQLite vs Drizzle+SQLite vs WatermelonDB
  vs op-sqlite. Criteria: offline-first, typed schema, migrations, sync-friendly
  later. *(Source of truth for all app data.)*
- **ADR-0002 — State management & persistence.** Zustand vs Redux Toolkit vs Jotai;
  how in-memory state hydrates from / persists to the store.
- **ADR-0003 — Project structure & domain layering.** Folder layout, module
  boundaries, the UI ⇄ services ⇄ engine ⇄ data contract. Enforces "UI only calls
  the engine interface."
- **ADR-0004 — Body-area taxonomy.** The shared vocabulary (muscle / group / region
  granularity) used by targeting, avoidance, fatigue, and exercise tagging.
  *(Highest-leverage ADR — everything speaks this language.)*
- **ADR-0005 — Decision-log schema & storage.** What we capture per engine call and
  how it's stored locally (see CLAUDE.md §7).
- **ADR-0006 — Navigation.** Expo Router vs React Navigation.

---

## Phase 1 — Rules engine + core loop

**Goal:** The real, adaptive rules engine and the end-to-end daily loop:
onboarding → equipment → prebrief → workout tracker → debrief → adapts next time.
This is the crown jewel; most engineering effort lives here.

**Deliverables**
- Onboarding: goals + weighting, experience, constraints/injuries.
- Equipment inventory + "few high-value additions" recommendation.
- Prebrief cards: readiness (sleep/soreness/energy), **avoid-today** prompt,
  **target/avoid areas**.
- `RulesEngine.generateSession()` producing genuinely adaptive sessions.
- Workout tracker UX (fatigue-user optimized) with bulletproof offline logging.
- `adjustDuringSession()` for live "too easy / too hard" signal.
- Debrief cards → `interpretDebrief()` feeding the next session.
- Placeholder exercise animations (baseline media).
- Full decision logging on real engine calls.

**Key ADRs**
- **ADR-0101 — Exercise catalog schema.** Fields per exercise: movement pattern,
  primary/secondary body areas (ADR-0004), equipment requirements, modality
  (strength/cardio/mobility), progression type, media refs, contraindications.
- **ADR-0102 — Fatigue & recovery model.** How per-area fatigue accrues and decays
  over time; what drives it (volume, intensity, RPE, soreness reports).
- **ADR-0103 — Progressive overload & safety caps.** The concrete progression
  algorithm and the hard caps (max load/volume increase per unit time) that can
  never be exceeded.
- **ADR-0104 — Volume landmarks.** MEV/MAV-style min-effective / max-recoverable
  volume targets per goal and experience level.
- **ADR-0105 — Session generation algorithm.** How goal weights + readiness +
  fatigue + equipment compose a session; how multiple modalities
  (strength/cardio/mobility) blend in one plan or across a week.
- **ADR-0106 — Avoidance & targeting resolution.** How avoid-today flags and
  target/avoid areas deterministically drive skip / swap / de-load decisions.
- **ADR-0107 — Readiness scaling.** The function mapping readiness inputs to
  volume/intensity adjustments (within caps).
- **ADR-0108 — Workout tracking model & offline guarantees.** Set/rep/weight
  logging schema; immediate persistence; survives backgrounding/crash mid-set.
- **ADR-0109 — Equipment model & recommendation logic.** Inventory schema and the
  rules for suggesting high-value additions tied to goals.

---

## Phase 2 — Metrics & achievements

**Goal:** Turn logged sessions into meaningful trends and motivation.

**Deliverables**
- Caloric burn estimate per session.
- Muscle strength trends (per body area).
- Endurance / work-capacity trends.
- Achievements + progress views.

**Key ADRs**
- **ADR-0201 — Calorie estimation model.** MET-table source and per-exercise
  mapping; how effort/HR (later) would refine it via the metrics abstraction.
- **ADR-0202 — Strength metric.** Estimated-1RM formula choice (e.g. Epley vs
  Brzycki) and how strength trend is derived and displayed.
- **ADR-0203 — Endurance metric.** Definition of the endurance/work-capacity
  measure and how it's tracked over time.
- **ADR-0204 — Achievements engine.** Achievement rule schema and detection
  approach (reusing the decision-log / history data).

---

## Phase 3 — Media enrichment

**Goal:** Richer, still-simple motion visuals without licensing risk.

**Deliverables**
- Curated public-domain stills per exercise.
- Links to short, simple public-domain demo clips where available.
- Graceful fallback to placeholder animation when media is missing.

**Key ADRs**
- **ADR-0301 — Animation/media format.** Placeholder format (Lottie vs Rive vs
  sprite vs SVG) and how media assets are packaged for offline use.
- **ADR-0302 — Media sourcing & licensing.** Public-domain sourcing process,
  per-asset license record, and caching/offline strategy for linked clips.

---

## Phase 4 — iOS platform integrations

**Goal:** Give the active workout a presence outside the app on iOS, and let
completed workouts show up in Apple Health.

**Deliverables**
- Live Activity on the Lock Screen and Dynamic Island during an active
  workout: current exercise, set progress, target, rest countdown, workout
  elapsed time, sets completed/remaining, and buttons to log the current
  set/all remaining sets or move to the previous/next exercise.
- Completed workouts written back to Apple Health (write-only).
- Both are additive and iOS-only — Android and `npm run web` are unaffected.

**Key ADRs**
- **ADR-0401 — iOS Live Activity for the active workout.** `expo-widgets`
  chosen over `@bacons/apple-targets`/a manual Xcode target; interactive
  buttons via `expo-widgets`' native `LiveActivityIntent` support, not deep
  links or a custom App Group bridge.
- **ADR-0402 — HealthKit write-back for completed workouts.**
  `@kingstinct/react-native-healthkit`, write-only (`toShare` only, never
  `toRead`), reusing the existing MET-based calorie estimate unmodified.

## Later / maybe (not scheduled; design seams reserved)

Each becomes its own phase + ADRs if/when we commit. Do **not** build now; do
**not** foreclose them.

- **Health data (HealthKit / Google Fit) — read path.** Read live in-workout
  metrics (esp. HR) and source readiness inputs from Health. Write-back
  (iOS) shipped in Phase 4 (ADR-0402); this covers the remaining read side
  plus Android/Google Fit write-back. *ADR: metrics abstraction + platform
  adapters.*
- **Apple Watch companion app.** Mirror the workout tracker to watchOS so sets
  can be logged from the wrist — deferred as its own future plan; a full
  second client with its own watchOS target, materially larger than the
  Phase 4 Live Activity/HealthKit slice. *ADR: watch-app data sync strategy.*
- **Cloud sync & accounts.** *ADR: sync/conflict-resolution strategy (LWW vs CRDT),
  backend choice, auth.*
- **Richer form monitoring.** *ADR: on-device vision approach.*
- **Public release.** *ADR: onboarding/privacy/store-readiness.*
- **Optional LLM advisor.** Only if it clearly earns its place; slots behind the
  `ProgrammingEngine` interface, proposes-within-envelope, rules ratify.
  *ADR: local vs cloud, degradation, cost.*

---

## ADR index

Live status of each decision is tracked in [docs/decisions/](./decisions/).
ADRs are numbered `ADR-0PNN` where `P` groups by phase (0 = foundations).
