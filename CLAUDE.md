# CLAUDE.md — CoachFit App

Guidance for Claude Code (and humans) working in this repo. Read this first.

---

## 1. What we're building

A mobile app that acts like a **thoughtful personal trainer** for home and gym
workouts. It helps a person clarify their goals (strength, hypertrophy, cardio,
mobility, weight loss / general fitness), understands the equipment they own,
and then builds and continuously adapts a **daily workout** around their goals,
fatigue, recovery, available equipment, and how past sessions actually went.

The experience wraps each session in a **prebrief** (what we're doing today and
why) and a **debrief** (how it went, what it means for next time). During the
workout the user tracks sets / reps / weight in a UI designed to be usable while
sweaty, tired, and mid-set.

**The single most important thing:** the workout must be *genuinely adaptive and
reason like a trainer* — it never blindly increases load/volume. Every progression
is justified by the athlete's actual state and history. The programming engine is
the crown jewel of this app; everything else is in service of it.

**This is an offline-first, rules-driven app.** The entire experience — including
its trainer-like responsiveness — is delivered by a deterministic rules engine.
We get "trainer nuance" not from an LLM but from **structured inputs the rules act
on** (e.g. a daily "anything bothering you we should avoid?" prompt, and user-set
target areas / areas to avoid). An LLM "advisor" for deeper natural-language
nuance is a **much-later, optional add-on — if we do it at all.** Do not build the
app around it.

### Audience & stage
Right now this is for **the author and a few friends**. Optimize for building the
smartest possible experience quickly. But **do not make irreversible architectural
choices** — keep it clean enough to grow into a public product if it proves good.
No monetization, minimal onboarding friction for now.

---

## 2. Guiding principles

1. **Think like a trainer, not a spreadsheet.** No blind linear progression.
   Every recommendation accounts for recovery, recent performance, reported
   effort/RPE, soreness, and stated goals. When unsure, be conservative — a good
   trainer would rather under-load than injure.
2. **Reversible architecture.** Prefer decisions we can undo. The big one:
   all programming logic lives behind a single interface (see §5) so we can swap
   or blend rules vs. LLM implementations forever without touching the rest of the app.
3. **Rules do everything; nuance comes from structured inputs, not an LLM.**
   Push deterministic rules/heuristics as far as they go — and make them
   responsive by capturing the athlete's nuance through explicit, structured
   inputs the rules can act on (avoid-today, target/avoid areas, readiness).
   An LLM "advisor" is a much-later optional add-on, if ever. (Detail in §6.)
4. **Offline-first, always.** The full experience — generation, adjustment,
   tracking, briefs — must work with no network, ever. Nothing core may depend
   on a server or an API call. Cloud sync is optional and additive only.
5. **Log every decision.** Capture the full input context and rationale for every
   generated session (see §7). This is what makes future eval, A/B, and possible
   fine-tuning possible — it cannot be reconstructed later if we skip it now.
6. **UX for the fatigued user.** Big tap targets, minimal typing, one-thumb
   operation, obvious "done" states. Assume the user is sweaty, tired, and rushed.
7. **Safety is a hard constraint, not a preference.** Progression caps, deload
   triggers, avoidance flags, and contraindication checks are enforced by the
   rules and cannot be overridden by any other component.

---

## 3. Tech stack

- **Framework:** Expo / React Native (iOS + Android from one codebase).
- **Language:** TypeScript, strict mode.
- **State:** Local-first store (start with a lightweight solution; keep the data
  layer swappable). Persist to on-device storage.
- **Data storage:** Local database on device (SQLite via Expo, or equivalent) as
  the source of truth. **Cloud sync is optional/additive**, added later without
  changing the local schema contract.
- **AI:** None in the core app. It is **fully rules-driven and offline**. An
  optional LLM "advisor" is a possible much-later add-on that would sit behind the
  engine interface (§5) and never be required for core use. Do not add an AI
  dependency now.
- **Health data:** Not integrated yet. **Design for it now, build later** (see §10).

> When adding dependencies, prefer well-maintained libraries and keep the surface
> small. Justify anything that touches the data layer or the engine interface.

---

## 4. High-level architecture

```
┌─────────────────────────────────────────────┐
│                    UI layer                    │
│  Onboarding · Equipment · Prebrief · Workout   │
│  tracker · Debrief · Progress/achievements     │
└───────────────┬───────────────────────────────┘
                │ (only talks to services + engine interface)
┌───────────────▼───────────────────────────────┐
│                 Domain services                 │
│  Athlete profile · Equipment · Session history  │
│  Metrics (calories, strength, endurance)        │
│  Achievements · Decision log                    │
└───────────────┬───────────────────────────────┘
                │
┌───────────────▼───────────────────────────────┐
│           ProgrammingEngine (interface)         │  ◄── the crown jewel
│  generateSession() · adjustDuringSession()      │
│  interpretDebrief()                             │
│   └─ RulesEngine        (deterministic core)    │
│      [ optional LLM advisor slot — much later ] │
└───────────────┬───────────────────────────────┘
                │
┌───────────────▼───────────────────────────────┐
│      Local-first data layer (SQLite/…)          │
│      + optional cloud sync adapter (later)      │
└─────────────────────────────────────────────────┘
```

**Golden rule:** the UI never knows whether a plan came from rules or from Claude.
It only calls the `ProgrammingEngine` interface.

---

## 5. The ProgrammingEngine interface (reversibility anchor)

This is the abstraction that keeps the rules-vs-Claude decision reversible forever.
Everything programming-related goes through it.

```ts
interface ProgrammingEngine {
  // Build today's session from full athlete context.
  generateSession(input: SessionContext): Promise<SessionPlan>;

  // Live adjustment mid-workout (e.g. "this felt way too easy/hard").
  adjustDuringSession(
    plan: SessionPlan,
    signal: LiveSignal,
  ): Promise<SessionPlan>;

  // Turn the structured debrief (+ optional free text) into takeaways
  // that feed the next generateSession call.
  interpretDebrief(input: DebriefInput): Promise<DebriefResult>;
}

interface SessionContext {
  athlete: AthleteProfile;        // goals, experience, constraints, injuries
  equipment: EquipmentInventory;  // what they own / have access to
  history: SessionRecord[];       // past sessions + performance
  fatigue: FatigueState;          // per-muscle-group recovery estimates
  readiness: ReadinessInput;      // prebrief cards: sleep, soreness, energy
  goals: TrainingGoals;           // strength/cardio/mobility/weightloss weights
  targeting: SessionTargeting;    // areas to emphasize + areas to avoid
  avoidToday: AvoidanceInput;     // "anything bothering you?" → structured flags
}

// Structured nuance the rules act on — this replaces the need for an LLM.
interface SessionTargeting {
  emphasize: BodyArea[];          // muscles/groups/areas the user wants to hit
  avoid: BodyArea[];              // persistent areas to steer clear of
}

interface AvoidanceInput {
  flags: AvoidanceFlag[];         // e.g. { area: "left knee", severity: "mild" }
  note?: string;                  // optional free text, stored (not required)
}
```

Implementations:
- **`RulesEngine`** — deterministic, offline, testable. This **is** the app: the
  default, the safety authority, and the only implementation we build for now.
  It delivers trainer-like responsiveness by acting on the structured `targeting`
  and `avoidToday` inputs — swapping/scaling/skipping exercises accordingly.
- **Optional LLM advisor (much later, if ever)** — would slot behind this same
  interface as an add-on that **proposes** and the RulesEngine **ratifies**,
  composable as `HybridEngine(rules, advisor)` with zero UI changes. Not built now.

Build `RulesEngine` alone. The interface exists purely to keep a future advisor
reversible — it is not a signal to add one soon.

---

## 6. How the rules deliver "trainer nuance" (no LLM)

The whole app is the rules engine. The insight is that most of what feels like a
trainer's judgment can be captured as **structured inputs the rules act on**,
deterministically and offline. We deliberately choose this over an LLM.

### The rules own everything — the "physics," safety, and responsiveness
- Progressive overload logic and **hard caps** (e.g. cap weekly load increase;
  cap set/rep jumps). Nothing ever exceeds these.
- Per-muscle-group **fatigue & recovery** accounting; scheduling around it.
- **Volume landmarks** (minimum effective / maximum recoverable volume) per goal.
- **Deload triggers** (stalled progress, accumulated fatigue, poor readiness).
- **Exercise selection & substitution** filtered by owned equipment and injuries.
- Calorie estimates (MET-based for now), strength/endurance metric computation.
- Achievement detection.

### Nuance = structured inputs, acted on by rules (this is the key idea)
Instead of an LLM interpreting free text, we ask targeted questions and let the
rules respond deterministically:
- **"Anything bothering you we should avoid today?"** → structured avoidance flags
  (area + severity). The rules then **skip, swap, or de-load** exercises that load
  the flagged area, and prefer safe alternatives.
- **Target areas** the user wants to emphasize → the rules bias selection/volume
  toward those muscles/groups/areas (within recovery and volume limits).
- **Areas to avoid** (persistent) → rules exclude/limit exercises loading them.
- **Readiness cards** (sleep, soreness, energy) → rules scale total volume/intensity.

A short **free-text note** may be captured and stored alongside the flags, but the
rules act on the structured fields, not the prose. Nothing breaks offline.

### Safety is absolute
> Safety caps, deload triggers, and avoidance flags are **hard constraints** the
> rules enforce. There is no component that can override them. If we ever add an
> optional LLM advisor (§5), it may only **propose within** this envelope and the
> rules **ratify** — but that is a much-later maybe, not a current dependency.

Revisit *what structured inputs* best capture real nuance as we learn. Document
notable boundary/design calls in `/docs/decisions/` (ADR style) so the reasoning
is preserved and reversible.

---

## 7. Decision logging (do this from day one)

Every `generateSession` / `adjustDuringSession` / `interpretDebrief` call records:
- Full input context (athlete state, fatigue, readiness, history snapshot refs).
- Which engine/implementation produced the output and its version.
- The output plan + the rationale.
- Which structured inputs drove which adjustments (e.g. avoidance flag → swaps).

Store locally (sync later). This enables future evals, tuning the rules, and — if
we ever add an optional advisor — comparing it against rules. **Not optional** — it
cannot be reconstructed after the fact.

---

## 8. Core features / modules

1. **Onboarding & goals** — clarify goals and weighting across strength /
   hypertrophy, cardio / endurance, flexibility / mobility, weight loss /
   general fitness. Capture experience level, constraints, injuries.
2. **Equipment inventory** — user walks through what they own / can access;
   the app tracks it and **recommends a few high-value additions** tied to goals
   (only when genuinely useful — don't upsell gratuitously).
3. **Prebrief** — structured cards: sleep, soreness, energy/readiness; an
   **"anything bothering you we should avoid today?"** prompt (→ structured
   avoidance flags); and **target areas to emphasize / avoid**. Plus a short
   rules-generated note (templated) explaining today's plan and why. All offline.
4. **Workout tracker** — the core loop. Shows planned sets / reps / weight;
   lets the user log actuals fast. Fatigue-user UX is paramount (see §9).
5. **Debrief** — structured cards (how it felt, RPE, issues) + short AI note on
   how it went and what it means for next time. Feeds the next session.
6. **Exercise library & demo media** — see §11.
7. **Progress & metrics** — calorie burn estimate, muscle strength trends,
   endurance trends, and **achievements**.

---

## 9. Workout-tracker UX principles

The user is sweaty, tired, and rushed. Design accordingly:
- Large tap targets; one-thumb reachable primary actions.
- Minimal typing — steppers, quick-adjust chips, and smart defaults
  (prefill last-used / planned weight & reps).
- The current set is always obvious; logging a set is one clear action.
- Clear rest-timer and "next set / next exercise" affordances.
- Never lose data: log persists immediately, survives app backgrounding.
- Readable at a glance from arm's length on a bench.

---

## 10. Health data (HealthKit / Google Fit) — write-back shipped, read still later

**Write-back to HealthKit (iOS) shipped in Phase 4 (ADR-0402).** Completed
workouts are written to Apple Health, write-only (`toShare`, never `toRead`),
behind a platform port (`src/platform/health*.ts`) — Android and web remain
no-ops. Everything below this line is still **not built**:
- The **read path** — metrics (heart rate, calories, weight, steps) still flow
  through self-reported + MET-estimated values; sourcing them from
  HealthKit/Google Fit instead remains a later port implementation, not yet
  built.
- **In-workout live data from HealthKit/Google Fit (esp. heart rate) is high
  value** — still reserve a place for a live metrics stream in the workout
  session model; not built yet.
- **Google Fit write-back** (Android) — not built yet; the iOS write path's
  port boundary (`HealthWritePort`) is the seam an Android implementation
  would plug into.
- Do not build the read path or Android write-back now; do not make choices
  that would block them.

---

## 11. Exercise library & demo media

Goal: **simple visual placeholders of each motion now**, richer form monitoring
much later. Approach = **both**:
- **Baseline:** lightweight, self-made looping animations / illustrations per
  motion (fully controlled, no licensing risk).
- **Enrichment — stills:** curated **public-domain** stills (CC-BY/CC-BY-SA as
  a documented fallback with in-app attribution) where good ones exist.
- **Enrichment — clips (ADR-0303):** any publicly viewable demo video with the
  creator/title clearly attributed in-app, shown inline via an embedded
  player. Clips are **never** license-gated the way stills are — attribution
  is the requirement, not a license tier.
- Media is metadata on the exercise; missing media must degrade gracefully to the
  placeholder animation.
- Advanced graphics / real form monitoring is the **lowest near-term priority**.

> **Stills** are bundled into the app — only use public-domain / appropriately
> licensed assets and record the source + license per asset. Never bundle/
> download copyrighted media.
> **Clips** are never bundled — always streamed from the source platform via
> an embedded player, with the creator/title always visible. "Never embed
> copyrighted media" means never ship the binary in the app package; streaming
> a credited third-party video inline is fine (ADR-0303).

---

## 12. Metrics we track

- **Caloric burn** — estimated (MET-based) now; upgradeable to HR-based later.
- **Muscle strength** — per-muscle-group strength trends from load × reps history.
- **Endurance** — cardio/work-capacity trends.
- **Achievements** — milestone detection to keep motivation up.
- **Fatigue/recovery** — per-muscle-group state driving programming.

---

## 13. Roadmap (rough, reorder as we learn)

- **Phase 0 — Foundations:** Expo app skeleton, TypeScript strict, local-first
  data layer, `ProgrammingEngine` interface + decision-log plumbing.
- **Phase 1 — Rules engine + core loop:** onboarding, equipment, rules-based
  session generation, workout tracker, structured prebrief/debrief (incl.
  avoid-today + target/avoid areas), placeholder exercise animations.
- **Phase 2 — Metrics & achievements:** calorie estimate, strength/endurance
  trends, achievements, progress views.
- **Phase 3 — Media enrichment:** public-domain stills + short clip links.
- **Phase 4 — iOS platform integrations:** Live Activity (Lock Screen +
  Dynamic Island) for the active workout, with buttons to log sets or move
  between exercises (ADR-0401); HealthKit write-back for completed workouts,
  write-only (ADR-0402). Both additive and iOS-only.
- **Later / maybe:** HealthKit/Google Fit read path + Android write-back,
  an Apple Watch companion app, cloud sync, richer form monitoring, public
  release, and — only if it clearly earns its place — an optional LLM advisor
  behind the engine interface for deeper natural-language nuance.

---

## 14. Conventions

- TypeScript strict; no `any` without justification.
- Keep the **UI ⇄ engine boundary clean** — UI only calls the `ProgrammingEngine`
  interface, never a rules module (or any future advisor) directly.
- Programming logic is **unit-tested**; safety caps and deload triggers must have
  explicit tests.
- Record notable architecture/boundary calls as ADRs in `/docs/decisions/`.
- Prefer small, reviewable changes. Match surrounding code style.
- Don't add cloud/auth/health dependencies until their phase — but don't block them.
- **Dev/UX testing runs in the browser** via `npm run web` (Expo Web / react-native-web)
  for a fast click-through + screenshot loop. Persistence swaps to a `localStorage`
  impl on web via the port (ADR-0007); native SQLite remains the source of truth.
  Keep every feature web-runnable — avoid native-only APIs outside a platform port.
